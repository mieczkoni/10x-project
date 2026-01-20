const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const COOLDOWN_MS = 5 * 60 * 1000;

type LoginRateLimitRecord = {
  failures: number[];
  blockedUntil?: number;
};

const failuresByKey = new Map<string, LoginRateLimitRecord>();

function normalizeKey(email: string, ipAddress: string | null): string {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedIp = ipAddress?.trim() || 'unknown';
  if (!normalizedEmail) {
    return `ip:${normalizedIp}`;
  }
  return `${normalizedEmail}|${normalizedIp}`;
}

function pruneFailures(failures: number[], nowMs: number): number[] {
  const windowStart = nowMs - WINDOW_MS;
  return failures.filter((timestamp) => timestamp >= windowStart);
}

export function checkLoginRateLimit(
  email: string,
  ipAddress: string | null,
  nowMs = Date.now()
): { allowed: boolean; retryAfterSeconds?: number; key: string } {
  const key = normalizeKey(email, ipAddress);
  const record = failuresByKey.get(key) ?? { failures: [] };
  const failures = pruneFailures(record.failures, nowMs);

  if (record.blockedUntil && record.blockedUntil > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.blockedUntil - nowMs) / 1000),
      key,
    };
  }

  if (failures.length >= MAX_FAILURES) {
    const blockedUntil = nowMs + COOLDOWN_MS;
    failuresByKey.set(key, { failures, blockedUntil });
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(COOLDOWN_MS / 1000),
      key,
    };
  }

  failuresByKey.set(key, { failures });
  return { allowed: true, key };
}

export function recordLoginFailure(key: string, nowMs = Date.now()): void {
  const record = failuresByKey.get(key) ?? { failures: [] };
  const failures = pruneFailures(record.failures, nowMs);
  failures.push(nowMs);

  if (failures.length >= MAX_FAILURES) {
    failuresByKey.set(key, { failures, blockedUntil: nowMs + COOLDOWN_MS });
    return;
  }

  failuresByKey.set(key, { failures });
}

export function resetLoginFailures(key: string): void {
  failuresByKey.delete(key);
}
