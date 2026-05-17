import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors";

type ApiErrorBody = {
  code: string;
  message: string;
  errors?: Record<string, string[]>;
  requestId: string;
};

type AnyError = Error & { statusCode?: number };

export async function errorHandler(
  err: AnyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const requestId = request.id;

  if (err instanceof AppError) {
    request.log.warn({ err, code: err.code }, "app error");
    const body: ApiErrorBody = {
      code: err.code,
      message: err.message,
      requestId,
    };
    if (err.fields) body.errors = err.fields;
    await reply.status(err.status).send(body);
    return;
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      (fields[key] ??= []).push(issue.message);
    }
    request.log.warn({ err }, "validation error");
    await reply.status(400).send({
      code: "validation_error",
      message: "Request validation failed",
      errors: fields,
      requestId,
    } satisfies ApiErrorBody);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      await reply.status(409).send({
        code: "conflict",
        message: `Duplicate value for: ${target.join(", ") || "unique field"}`,
        requestId,
      } satisfies ApiErrorBody);
      return;
    }
    if (err.code === "P2025") {
      await reply.status(404).send({
        code: "not_found",
        message: "Resource not found",
        requestId,
      } satisfies ApiErrorBody);
      return;
    }
  }

  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    await reply.status(err.statusCode).send({
      code: "bad_request",
      message: err.message,
      requestId,
    } satisfies ApiErrorBody);
    return;
  }

  request.log.error({ err }, "unhandled error");
  await reply.status(500).send({
    code: "internal_error",
    message: "Internal server error",
    requestId,
  } satisfies ApiErrorBody);
}
