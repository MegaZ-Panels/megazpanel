import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat as fsStat, readdir } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ListedObject, ObjectStat, PutBody, PutOptions, StorageProvider } from "./types";

export class LocalStorage implements StorageProvider {
  readonly id: string;
  private readonly root: string;

  constructor(opts: { id: string; root: string }) {
    this.id = opts.id;
    this.root = resolve(opts.root);
  }

  private resolveKey(key: string): string {
    const normalised = posix.normalize("/" + key.replace(/\\/g, "/")).replace(/^\/+/, "");
    if (normalised === "" || normalised.includes("..")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const target = resolve(this.root, normalised);
    const rel = relative(this.root, target);
    if (rel.startsWith("..") || rel.startsWith(`..${sep}`)) {
      throw new Error("Resolved path escapes storage root");
    }
    return target;
  }

  async put(key: string, body: PutBody, _opts?: PutOptions): Promise<{ etag?: string; size: number }> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    const stream =
      body instanceof Readable
        ? body
        : Readable.from(typeof body === "string" ? Buffer.from(body, "utf8") : body);
    const out = createWriteStream(target);
    await pipeline(stream, out);
    const stats = await fsStat(target);
    return { size: stats.size };
  }

  async get(key: string): Promise<Readable> {
    const target = this.resolveKey(key);
    return createReadStream(target);
  }

  async stat(key: string): Promise<ObjectStat | null> {
    try {
      const target = this.resolveKey(key);
      const s = await fsStat(target);
      return { key, size: s.size, lastModified: s.mtime };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveKey(key);
    await rm(target, { force: true });
  }

  async *list(prefix: string): AsyncIterable<ListedObject> {
    const startDir = (() => {
      try {
        return this.resolveKey(prefix.endsWith("/") ? prefix.slice(0, -1) || "." : prefix || ".");
      } catch {
        return this.root;
      }
    })();

    async function* walk(dir: string, root: string): AsyncIterable<ListedObject> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          yield* walk(full, root);
        } else if (entry.isFile()) {
          const s = await fsStat(full);
          const key = relative(root, full).split(sep).join("/");
          yield { key, size: s.size, lastModified: s.mtime };
        }
      }
    }

    yield* walk(startDir, this.root);
  }

  async presignDownload(_key: string, _expiresInSeconds: number): Promise<string | null> {
    return null; // local provider doesn't support presigned URLs
  }
}
