import pino from "pino";
import { config } from "./config";

const isDev = config.env === "development";

export const logger = pino({
  level: isDev ? "debug" : "info",
  base: { service: "megazpanel-backend" },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", singleLine: true },
      }
    : undefined,
});

export type Logger = typeof logger;
