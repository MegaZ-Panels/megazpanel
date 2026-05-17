import type { BackupTarget } from "@prisma/client";
import { decryptSecret } from "@/core/crypto";
import { errors } from "@/core/errors";
import type { StorageProvider } from "./types";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

type S3Credentials = { accessKey: string; secretKey: string };

function decodeS3Credentials(target: BackupTarget): S3Credentials {
  if (!target.credentials) {
    throw errors.badRequest(`Backup target "${target.name}" is missing credentials`);
  }
  let raw: string;
  try {
    raw = decryptSecret(target.credentials);
  } catch {
    throw errors.internal(`Backup target "${target.name}" has unreadable credentials`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw errors.internal(`Backup target "${target.name}" credentials are not JSON`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).accessKey !== "string" ||
    typeof (parsed as Record<string, unknown>).secretKey !== "string"
  ) {
    throw errors.internal(`Backup target "${target.name}" credentials missing accessKey/secretKey`);
  }
  return parsed as S3Credentials;
}

export function buildStorageProvider(target: BackupTarget): StorageProvider {
  if (!target.enabled) {
    throw errors.badRequest(`Backup target "${target.name}" is disabled`);
  }
  if (target.provider === "local") {
    if (!target.localPath) {
      throw errors.badRequest(`Local backup target "${target.name}" requires localPath`);
    }
    return new LocalStorage({ id: target.id, root: target.localPath });
  }
  if (target.provider === "s3" || target.provider === "b2") {
    if (!target.bucket || !target.endpoint) {
      throw errors.badRequest(`Target "${target.name}" requires bucket and endpoint`);
    }
    const creds = decodeS3Credentials(target);
    return new S3Storage({
      id: target.id,
      endpoint: target.endpoint,
      bucket: target.bucket,
      region: target.region ?? undefined,
      accessKey: creds.accessKey,
      secretKey: creds.secretKey,
      prefix: target.prefix ?? "",
    });
  }
  throw errors.badRequest(`Unsupported provider for target "${target.name}"`);
}

export type { StorageProvider, ListedObject, ObjectStat } from "./types";
