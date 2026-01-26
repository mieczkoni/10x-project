/* eslint-disable no-console */
export type LogMeta = Record<string, unknown> | Error | unknown;

function normalizeMeta(meta: LogMeta): Record<string, unknown> | undefined {
  if (meta === undefined || meta === null) {
    return undefined;
  }

  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
    };
  }

  if (typeof meta === "object") {
    return meta as Record<string, unknown>;
  }

  return { value: meta };
}

function logWithMeta(level: "info" | "warn" | "error", message: string, meta?: LogMeta) {
  const normalized = normalizeMeta(meta);
  if (normalized) {
    console[level](message, normalized);
    return;
  }
  console[level](message);
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    logWithMeta("info", message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    logWithMeta("warn", message, meta);
  },
  error(message: string, meta?: LogMeta) {
    logWithMeta("error", message, meta);
  },
};
