#!/usr/bin/env node
/**
 * MegaZPanel — Installer static server
 * ------------------------------------------------------------------
 * Fetches the bash installer scripts directly from the public GitHub
 * repository and serves them over HTTP so they can be downloaded with
 * a single one-liner, e.g.:
 *
 *   curl -fsSL https://installer.aethercloud.web.id/install | sudo bash
 *   curl -fsSL https://installer.aethercloud.web.id/storage | sudo bash
 *
 * It listens on port 9898 by default and is designed to sit behind an
 * nginx reverse proxy that terminates TLS for `installer.aethercloud.web.id`.
 *
 * The server holds an in-memory cache of each upstream file and
 * revalidates with conditional `If-None-Match` (ETag) requests once the
 * cache TTL expires, so GitHub bandwidth use stays minimal even under
 * load. If the upstream is unreachable but a previously fetched copy
 * exists in cache, that stale copy is served with an `X-Stale-Cache: 1`
 * header rather than failing.
 *
 * No third-party dependencies — pure Node.js standard library.
 *
 * ── Environment variables ─────────────────────────────────────────────
 *   PORT                  default 9898
 *   HOST                  default 0.0.0.0
 *   GITHUB_OWNER          default MegaZ-Panels
 *   GITHUB_REPO           default megazpanel
 *   GITHUB_BRANCH         default main
 *   GITHUB_PATH_PREFIX    default deploy/install
 *   GITHUB_RAW_BASE       full override of upstream base URL
 *   CACHE_TTL_SECONDS     default 60
 *   UPSTREAM_TIMEOUT_MS   default 10000
 *
 * ── Routes ────────────────────────────────────────────────────────────
 *   GET /                          HTML index with usage instructions
 *   GET /install                   → install-panel.sh        (from GitHub)
 *   GET /install-panel.sh          → same as /install
 *   GET /install.sh                → same as /install
 *   GET /storage                   → install-storage-node.sh (from GitHub)
 *   GET /install-storage           → same as /storage
 *   GET /install-storage-node.sh   → same as /storage
 *   GET /storage.sh                → same as /storage
 *   GET /healthz                   200 ok
 *   GET /robots.txt                disallow all
 *   GET /favicon.ico               204
 */

'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

// ── Config ────────────────────────────────────────────────────────────────
const PORT = Number.parseInt(process.env.PORT || '9898', 10);
const HOST = process.env.HOST || '0.0.0.0';

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'MegaZ-Panels';
const GITHUB_REPO = process.env.GITHUB_REPO || 'megazpanel';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_PATH_PREFIX = (process.env.GITHUB_PATH_PREFIX || 'deploy/install')
  .replace(/^\/+|\/+$/g, '');

const GITHUB_RAW_BASE =
  process.env.GITHUB_RAW_BASE ||
  `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/` +
    `${GITHUB_BRANCH}/${GITHUB_PATH_PREFIX}`;

const CACHE_TTL_MS =
  Number.parseInt(process.env.CACHE_TTL_SECONDS || '60', 10) * 1000;
const UPSTREAM_TIMEOUT_MS = Number.parseInt(
  process.env.UPSTREAM_TIMEOUT_MS || '10000',
  10,
);
const MAX_REDIRECTS = 3;
const USER_AGENT = 'megazpanel-installer/1.0 (+https://github.com/MegaZ-Panels/megazpanel)';

// Map of route → upstream filename. Multiple routes may alias the same file.
const FILE_ROUTES = Object.freeze({
  '/install': 'install-panel.sh',
  '/install-panel.sh': 'install-panel.sh',
  '/install.sh': 'install-panel.sh',
  '/storage': 'install-storage-node.sh',
  '/install-storage': 'install-storage-node.sh',
  '/install-storage-node.sh': 'install-storage-node.sh',
  '/storage.sh': 'install-storage-node.sh',
});

// Whitelist of filenames we are allowed to fetch from upstream.
const ALLOWED_FILES = new Set(Object.values(FILE_ROUTES));

// ── In-memory cache ───────────────────────────────────────────────────────
/** @type {Map<string, {body:Buffer, etag?:string, lastModified?:string, fetchedAt:number}>} */
const cache = new Map();
/** @type {Map<string, Promise<{body:Buffer, etag?:string, lastModified?:string, fetchedAt:number}>>} */
const inflight = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────
function log(req, status, extra = '') {
  const ip =
    req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.socket.remoteAddress ||
    '-';
  const ua = req.headers['user-agent'] || '-';
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(
    `${ts} ${ip} "${req.method} ${req.url}" ${status}${
      extra ? ' ' + extra : ''
    } "${ua}"`,
  );
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
}

function sendText(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(body);
}

function publicBaseUrl(req) {
  const proto =
    req.headers['x-forwarded-proto']?.toString().split(',')[0].trim() ||
    'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return `${proto}://${host}`;
}

function indexHtml(baseUrl) {
  const safeBase = baseUrl || 'https://installer.aethercloud.web.id';
  const upstream = `${GITHUB_RAW_BASE}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MegaZPanel · Installer</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: dark; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
         background: #0b0d10; color: #e6edf3; max-width: 780px;
         margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.55; }
  h1 { font-size: 1.4rem; margin: 0 0 1rem; }
  h2 { font-size: 1.05rem; margin: 1.75rem 0 .5rem; color: #7ee787; }
  code, pre { background: #161b22; border: 1px solid #30363d;
              border-radius: 6px; }
  code { padding: .12rem .35rem; font-size: .92em; }
  pre { padding: .85rem 1rem; overflow-x: auto; }
  a { color: #79c0ff; }
  .muted { color: #8b949e; font-size: .9rem; }
</style>
</head>
<body>
<h1>MegaZPanel · Installer</h1>
<p class="muted">Static delivery of the panel and storage-node bash installers
(fetched from GitHub, cached for ${Math.round(CACHE_TTL_MS / 1000)}s).</p>

<h2>Install panel host</h2>
<pre>curl -fsSL ${safeBase}/install | sudo bash</pre>

<h2>Install storage node</h2>
<pre>curl -fsSL ${safeBase}/storage | sudo bash</pre>

<h2>Direct downloads</h2>
<ul>
  <li><a href="/install-panel.sh">/install-panel.sh</a></li>
  <li><a href="/install-storage-node.sh">/install-storage-node.sh</a></li>
</ul>

<p class="muted">Upstream: <a href="${upstream}">${upstream}</a></p>
<p class="muted">Source: <a href="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}">github.com/${GITHUB_OWNER}/${GITHUB_REPO}</a></p>
</body>
</html>
`;
}

// ── Upstream fetch (with redirect + ETag revalidation) ────────────────────
function httpsGet(targetUrl, headers, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(targetUrl);
    } catch (err) {
      return reject(err);
    }
    if (u.protocol !== 'https:') {
      return reject(new Error(`refusing non-https upstream: ${u.protocol}`));
    }
    const req = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: u.port || 443,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/plain, application/octet-stream;q=0.9, */*;q=0.5',
          ...headers,
        },
        timeout: UPSTREAM_TIMEOUT_MS,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirectsLeft <= 0) {
            return reject(new Error('too many redirects'));
          }
          const next = new URL(res.headers.location, targetUrl).toString();
          return resolve(httpsGet(next, headers, redirectsLeft - 1));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('upstream timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchUpstream(filename) {
  // Coalesce concurrent requests for the same file into a single fetch.
  if (inflight.has(filename)) return inflight.get(filename);

  const promise = (async () => {
    const url = `${GITHUB_RAW_BASE}/${encodeURIComponent(filename)}`;
    const cached = cache.get(filename);
    const condHeaders = {};
    if (cached?.etag) condHeaders['If-None-Match'] = cached.etag;
    if (cached?.lastModified)
      condHeaders['If-Modified-Since'] = cached.lastModified;

    const resp = await httpsGet(url, condHeaders);

    if (resp.status === 304 && cached) {
      const refreshed = { ...cached, fetchedAt: Date.now() };
      cache.set(filename, refreshed);
      return refreshed;
    }

    if (resp.status === 200) {
      const entry = {
        body: resp.body,
        etag: resp.headers.etag,
        lastModified: resp.headers['last-modified'],
        fetchedAt: Date.now(),
      };
      cache.set(filename, entry);
      return entry;
    }

    const err = new Error(`upstream status ${resp.status} for ${filename}`);
    err.status = resp.status;
    throw err;
  })().finally(() => inflight.delete(filename));

  inflight.set(filename, promise);
  return promise;
}

async function getEntry(filename) {
  const cached = cache.get(filename);
  const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  if (fresh) return { entry: cached, stale: false };

  try {
    const entry = await fetchUpstream(filename);
    return { entry, stale: false };
  } catch (err) {
    if (cached) {
      // Serve stale on upstream failure rather than 5xx.
      return { entry: cached, stale: true, error: err };
    }
    throw err;
  }
}

// ── Request handler ───────────────────────────────────────────────────────
async function serveFile(req, res, filename) {
  if (!ALLOWED_FILES.has(filename)) {
    setSecurityHeaders(res);
    sendText(res, 404, 'Not Found\n');
    log(req, 404, `disallowed:${filename}`);
    return;
  }

  let result;
  try {
    result = await getEntry(filename);
  } catch (err) {
    setSecurityHeaders(res);
    res.setHeader('Cache-Control', 'no-store');
    sendText(res, 502, `Bad Gateway: ${err.message}\n`);
    log(req, 502, `upstream-fail:${filename}:${err.message}`);
    return;
  }

  const { entry, stale } = result;
  const size = entry.body.length;

  setSecurityHeaders(res);
  res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
  res.setHeader('Content-Length', size);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${filename.replace(/[\r\n"]/g, '')}"`,
  );
  res.setHeader(
    'Cache-Control',
    `public, max-age=${Math.round(CACHE_TTL_MS / 1000)}`,
  );
  if (entry.lastModified) res.setHeader('Last-Modified', entry.lastModified);
  if (entry.etag) res.setHeader('ETag', entry.etag);
  if (stale) res.setHeader('X-Stale-Cache', '1');

  // Conditional GET from the client: short-circuit if their cached copy still matches.
  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];
  if (
    (ifNoneMatch && entry.etag && ifNoneMatch === entry.etag) ||
    (ifModifiedSince &&
      entry.lastModified &&
      Date.parse(ifModifiedSince) >= Date.parse(entry.lastModified))
  ) {
    res.writeHead(304);
    res.end();
    log(req, 304, `${filename}${stale ? ' stale' : ''}`);
    return;
  }

  if (req.method === 'HEAD') {
    res.writeHead(200);
    res.end();
    log(req, 200, `${filename} HEAD${stale ? ' stale' : ''}`);
    return;
  }

  res.writeHead(200);
  res.end(entry.body);
  log(req, 200, `${filename} ${size}b${stale ? ' stale' : ''}`);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      setSecurityHeaders(res);
      res.setHeader('Allow', 'GET, HEAD');
      sendText(res, 405, 'Method Not Allowed\n');
      log(req, 405);
      return;
    }

    const rawPath = (req.url || '/').split('?')[0].split('#')[0];
    const urlPath = rawPath.replace(/\/{2,}/g, '/') || '/';

    if (urlPath === '/' || urlPath === '/index.html') {
      const body = indexHtml(publicBaseUrl(req));
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? '' : body);
      log(req, 200, 'index');
      return;
    }

    if (urlPath === '/healthz') {
      setSecurityHeaders(res);
      sendText(res, 200, 'ok\n', { 'Cache-Control': 'no-store' });
      log(req, 200, 'healthz');
      return;
    }

    if (urlPath === '/robots.txt') {
      setSecurityHeaders(res);
      sendText(res, 200, 'User-agent: *\nDisallow: /\n');
      log(req, 200, 'robots');
      return;
    }

    if (urlPath === '/favicon.ico') {
      setSecurityHeaders(res);
      res.writeHead(204, { 'Cache-Control': 'public, max-age=86400' });
      res.end();
      log(req, 204, 'favicon');
      return;
    }

    const file = FILE_ROUTES[urlPath];
    if (file) {
      await serveFile(req, res, file);
      return;
    }

    setSecurityHeaders(res);
    sendText(res, 404, 'Not Found\n');
    log(req, 404);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('handler error:', err);
    if (!res.headersSent) {
      setSecurityHeaders(res);
      sendText(res, 500, 'Internal Server Error\n');
    }
    log(req, 500, `unhandled:${err.message}`);
  }
});

// Optional: warm cache on startup so the first request is instant.
(async () => {
  for (const filename of ALLOWED_FILES) {
    try {
      await fetchUpstream(filename);
      // eslint-disable-next-line no-console
      console.log(`[installer] warm-cache ok: ${filename}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[installer] warm-cache FAILED for ${filename}: ${err.message}`,
      );
    }
  }
})();

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[installer] listening on http://${HOST}:${PORT}\n` +
      `[installer] upstream: ${GITHUB_RAW_BASE}\n` +
      `[installer] cache TTL: ${Math.round(CACHE_TTL_MS / 1000)}s, ` +
      `upstream timeout: ${UPSTREAM_TIMEOUT_MS}ms`,
  );
});

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[installer] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
