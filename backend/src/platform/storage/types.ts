import type { Readable } from "node:stream";

export type PutBody = Readable | Buffer | string;

export type PutOptions = {
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
};

export type ObjectStat = {
  key: string;
  size: number;
  etag?: string;
  lastModified?: Date;
  contentType?: string;
};

export type ListedObject = {
  key: string;
  size: number;
  lastModified?: Date;
};

export interface StorageProvider {
  readonly id: string;
  put(key: string, body: PutBody, opts?: PutOptions): Promise<{ etag?: string; size: number }>;
  get(key: string): Promise<Readable>;
  stat(key: string): Promise<ObjectStat | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): AsyncIterable<ListedObject>;
  presignDownload(key: string, expiresInSeconds: number): Promise<string | null>;
}
