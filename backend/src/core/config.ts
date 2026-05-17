import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().min(1).default("0.0.0.0"),

  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  SESSION_COOKIE_NAME: z.string().min(1).default("mzp_sid"),
  CSRF_COOKIE_NAME: z.string().min(1).default("mzp_csrf"),
  SESSION_LIFETIME_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24),
  SESSION_REMEMBER_ME_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_DOMAIN: z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  APP_SECRET: z
    .string()
    .min(16, "APP_SECRET must be at least 16 characters")
    .default("development-only-do-not-use-in-prod-please-replace"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable error.
  const formatted = parsed.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n  ");
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n  ${formatted}`);
  process.exit(1);
}

export const config = Object.freeze({
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  host: parsed.data.HOST,
  webOrigin: parsed.data.WEB_ORIGIN,
  databaseUrl: parsed.data.DATABASE_URL,
  session: {
    cookieName: parsed.data.SESSION_COOKIE_NAME,
    csrfCookieName: parsed.data.CSRF_COOKIE_NAME,
    lifetimeMs: parsed.data.SESSION_LIFETIME_HOURS * 60 * 60 * 1000,
    rememberMeMs: parsed.data.SESSION_REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000,
    cookieDomain: parsed.data.COOKIE_DOMAIN,
    cookieSecure: parsed.data.COOKIE_SECURE,
  },
  appSecret: parsed.data.APP_SECRET,
});

export type AppConfig = typeof config;
