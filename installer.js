#!/usr/bin/env node
/**
 * MegaZPanel — Installer static server
 * ------------------------------------------------------------------
 * Serves the bash installer scripts under `deploy/install/` over HTTP
 * so they can be fetched with a single one-liner, e.g.:
 *
 *   curl -fsSL https://installer.aethercloud.web.id/install | sudo bash
 *   curl -fsSL https://installer.aethercloud.web.id/storage | sudo bash
 *
 * It listens on port 9898 by default and is designed to sit behind an
 * nginx reverse proxy that terminates TLS for `installer.aethercloud.web.id`.
 *
 * No third-party dependencies — pure Node.js standard library.
 *
 * Usage:
 *   node installer.js                 # listens on 0.0.0.0:9898
 *   PORT=9898 node installer.js       # explicit port
 *   HOST=127.0.0.1 node installer.js  # bind to localhost only
 *
 * Routes:
 *   GET /                          HTML index with usage instructions
 *   GET /install                   → deploy/install/install-panel.sh
 *   GET /install-panel.sh          → same as /install
 *   GET /storage                   → deploy/install/install-storage-node.sh
 *   GET /install-storage           → same as /storage
 *   GET /install-storage-node.sh   → same as /storage
 *   GET /healthz                   200 OK plain text health check
 *
 * Anything else returns 404.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// ── Config ────────────────────────────────────────────────────────────────
const PORT = Number.parseInt(process.env.PORT || '9898', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const INSTALL_DIR = path.join(ROOT, 'deploy', 'install');

// Map of route → on-disk filename (relative to INSTALL_DIR).
// Multiple routes can point at the same file (aliases).
const FILE_ROUTES = Object.freeze({
  '/install': 'install-panel.sh',
  '/install-panel.sh': 'install-panel.sh',
  '/install.sh': 'install-panel.sh',
  '/storage': 'install-storage-node.sh',
  '/install-storage': 'install-storage-node.sh',
  '/install-storage-node.sh': 'install-storage-node.sh',
  '/storage.sh': 'install-storage-node.sh',
});

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

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(body);
}

function sendNotFound(req, res) {
  setSecurityHeaders(res);
  send(res, 404, 'Not Found\n');
  log(req, 404);
}

function sendMethodNotAllowed(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Allow', 'GET, HEAD');
  send(res, 405, 'Method Not Allowed\n');
  log(req, 405);
}

function publicBaseUrl(req) {
  // Prefer reverse-proxy hints; fall back to Host header.
  const proto =
    req.headers['x-forwarded-proto']?.toString().split(',')[0].trim() ||
    'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return `${proto}://${host}`;
}

function indexHtml(baseUrl) {
  const safeBase = baseUrl || 'https://installer.aethercloud.web.id';
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
<p class="muted">Static delivery of the panel and storage-node bash installers.</p>

<h2>Install panel host</h2>
<pre>curl -fsSL ${safeBase}/install | sudo bash</pre>

<h2>Install storage node</h2>
<pre>curl -fsSL ${safeBase}/storage | sudo bash</pre>

<h2>Direct downloads</h2>
<ul>
  <li><a href="/install-panel.sh">/install-panel.sh</a></li>
  <li><a href="/install-storage-node.sh">/install-storage-node.sh</a></li>
</ul>

<p class="muted">Source: <a href="https://github.com/MegaZ-Panels/megazpanel">github.com/MegaZ-Panels/megazpanel</a></p>
</body>
</html>
`;
}

async function serveFile(req, res, relName) {
  const filePath = path.join(INSTALL_DIR, relName);

  // Defence-in-depth: ensure the resolved path is still inside INSTALL_DIR.
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(INSTALL_DIR + path.sep)) {
    setSecurityHeaders(res);
    send(res, 400, 'Bad Request\n');
    log(req, 400, 'path-escape');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch (err) {
    if (err.code === 'ENOENT') {
      sendNotFound(req, res);
    } else {
      setSecurityHeaders(res);
      send(res, 500, 'Internal Server Error\n');
      log(req, 500, `stat:${err.code || err.message}`);
    }
    return;
  }
  if (!stat.isFile()) {
    sendNotFound(req, res);
    return;
  }

  setSecurityHeaders(res);
  res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
  res.setHeader('Content-Length', stat.size);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${path.basename(relName)}"`,
  );
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('Last-Modified', stat.mtime.toUTCString());

  // 304 short-circuit on If-Modified-Since.
  const ims = req.headers['if-modified-since'];
  if (ims) {
    const since = Date.parse(ims);
    if (!Number.isNaN(since) && stat.mtimeMs <= since + 999) {
      res.writeHead(304);
      res.end();
      log(req, 304, relName);
      return;
    }
  }

  if (req.method === 'HEAD') {
    res.writeHead(200);
    res.end();
    log(req, 200, `${relName} HEAD`);
    return;
  }

  res.writeHead(200);
  const stream = fs.createReadStream(resolved);
  stream.on('error', (err) => {
    log(req, 500, `read:${err.code || err.message}`);
    if (!res.writableEnded) res.destroy(err);
  });
  stream.pipe(res);
  res.on('finish', () => log(req, 200, `${relName} ${stat.size}b`));
}

// ── Server ────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendMethodNotAllowed(req, res);
      return;
    }

    // Normalise URL (strip query, collapse duplicate slashes).
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
      send(res, 200, 'ok\n', { 'Cache-Control': 'no-store' });
      log(req, 200, 'healthz');
      return;
    }

    if (urlPath === '/robots.txt') {
      setSecurityHeaders(res);
      send(res, 200, 'User-agent: *\nDisallow: /\n');
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

    sendNotFound(req, res);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('handler error:', err);
    if (!res.headersSent) {
      setSecurityHeaders(res);
      send(res, 500, 'Internal Server Error\n');
    }
    log(req, 500, `unhandled:${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[installer] serving deploy/install on http://${HOST}:${PORT} ` +
      `(root=${ROOT})`,
  );
});

// Graceful shutdown so systemd (or Ctrl-C) can stop us cleanly.
function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[installer] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  // Hard exit if connections linger.
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
