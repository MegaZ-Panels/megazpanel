export type AppErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "bad_request"
  | "internal_error";

const STATUS: Record<AppErrorCode, number> = {
  validation_error: 400,
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
};

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status: number;
  public readonly fields: Record<string, string[]> | undefined;

  constructor(
    code: AppErrorCode,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fields = fields;
  }
}

export const errors = {
  badRequest: (msg: string, fields?: Record<string, string[]>) =>
    new AppError("bad_request", msg, fields),
  validation: (msg: string, fields?: Record<string, string[]>) =>
    new AppError("validation_error", msg, fields),
  unauthorized: (msg = "Authentication required") =>
    new AppError("unauthorized", msg),
  forbidden: (msg = "You do not have permission to perform this action") =>
    new AppError("forbidden", msg),
  notFound: (msg = "Resource not found") => new AppError("not_found", msg),
  conflict: (msg: string, fields?: Record<string, string[]>) =>
    new AppError("conflict", msg, fields),
  rateLimited: (msg = "Too many requests") => new AppError("rate_limited", msg),
  internal: (msg = "Internal server error") => new AppError("internal_error", msg),
};
