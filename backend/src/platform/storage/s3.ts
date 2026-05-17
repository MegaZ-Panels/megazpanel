import { Client as MinioClient } from "minio";
import { Readable } from "node:stream";
import type {
  ListedObject,
  ObjectStat,
  PutBody,
  PutOptions,
  StorageProvider,
} from "./types";

export type S3Options = {
  id: string;
  endpoint: string; // e.g. "s3.amazonaws.com" or "s3.us-west-002.backblazeb2.com"
  bucket: string;
  region?: string;
  accessKey: string;
  secretKey: string;
  prefix?: string;
  port?: number;
  useSSL?: boolean;
};

function parseEndpoint(endpoint: string): { host: string; port?: number; useSSL: boolean } {
  let raw = endpoint.trim();
  let useSSL = true;
  if (raw.startsWith("https://")) {
    raw = raw.slice("https://".length);
  } else if (raw.startsWith("http://")) {
    useSSL = false;
    raw = raw.slice("http://".length);
  }
  const slash = raw.indexOf("/");
  if (slash !== -1) raw = raw.slice(0, slash);
  const colon = raw.indexOf(":");
  if (colon === -1) return { host: raw, useSSL };
  const host = raw.slice(0, colon);
  const port = Number(raw.slice(colon + 1));
  return { host, port: Number.isFinite(port) ? port : undefined, useSSL };
}

export class S3Storage implements StorageProvider {
  readonly id: string;
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(opts: S3Options) {
    this.id = opts.id;
    this.bucket = opts.bucket;
    this.prefix = (opts.prefix ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
    const { host, port, useSSL } = parseEndpoint(opts.endpoint);
    this.client = new MinioClient({
      endPoint: host,
      port: opts.port ?? port,
      useSSL: opts.useSSL ?? useSSL,
      accessKey: opts.accessKey,
      secretKey: opts.secretKey,
      region: opts.region,
    });
  }

  private fullKey(key: string): string {
    const cleaned = key.replace(/^\/+/, "");
    return this.prefix ? `${this.prefix}/${cleaned}` : cleaned;
  }

  async put(key: string, body: PutBody, opts?: PutOptions): Promise<{ etag?: string; size: number }> {
    const fk = this.fullKey(key);
    const stream =
      body instanceof Readable
        ? body
        : Readable.from(typeof body === "string" ? Buffer.from(body, "utf8") : body);
    const meta: Record<string, string> = {};
    if (opts?.contentType) meta["Content-Type"] = opts.contentType;
    if (opts?.metadata) {
      for (const [k, v] of Object.entries(opts.metadata)) meta[`x-amz-meta-${k}`] = v;
    }
    const result =
      opts?.contentLength !== undefined
        ? await this.client.putObject(this.bucket, fk, stream, opts.contentLength, meta)
        : await this.client.putObject(this.bucket, fk, stream, undefined, meta);
    const stat = await this.client.statObject(this.bucket, fk);
    return { etag: result.etag, size: stat.size };
  }

  async get(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, this.fullKey(key));
  }

  async stat(key: string): Promise<ObjectStat | null> {
    try {
      const s = await this.client.statObject(this.bucket, this.fullKey(key));
      return {
        key,
        size: s.size,
        etag: s.etag,
        lastModified: s.lastModified,
        contentType: (s.metaData?.["content-type"] as string | undefined) ?? undefined,
      };
    } catch (err) {
      if ((err as { code?: string }).code === "NotFound") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, this.fullKey(key));
  }

  async *list(prefix: string): AsyncIterable<ListedObject> {
    const stream = this.client.listObjectsV2(this.bucket, this.fullKey(prefix), true);
    for await (const item of stream as AsyncIterable<{
      name: string;
      size: number;
      lastModified: Date;
    }>) {
      const stripped = this.prefix && item.name.startsWith(`${this.prefix}/`)
        ? item.name.slice(this.prefix.length + 1)
        : item.name;
      yield { key: stripped, size: item.size, lastModified: item.lastModified };
    }
  }

  async presignDownload(key: string, expiresInSeconds: number): Promise<string | null> {
    return this.client.presignedGetObject(this.bucket, this.fullKey(key), expiresInSeconds);
  }
}
