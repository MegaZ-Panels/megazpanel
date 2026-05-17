/**
 * Pterodactyl-compatible variable validation DSL.
 * Rules are pipe-separated, optionally with a colon-argument:
 *   required | string | max:64 | regex:^[A-Z]+$ | in:a,b,c | between:1,99
 *
 * Implemented rules:
 *   required, nullable, string, integer, numeric, boolean, alpha_num, alpha_dash,
 *   url, email, ipv4, ipv6, in:list, not_in:list, min:n, max:n, between:a,b,
 *   regex:pattern, file_exists (no-op on backend), starts_with:val, ends_with:val
 */

export type RuleResult = { ok: true } | { ok: false; message: string };

type Validator = (value: string | null, arg: string | undefined) => RuleResult;

const ok: RuleResult = { ok: true };

const isPresent = (v: string | null): v is string => v !== null && v !== "";

const validators: Record<string, Validator> = {
  required: (v) => (isPresent(v) ? ok : { ok: false, message: "is required" }),
  nullable: () => ok,
  string: (v) => (v === null || typeof v === "string" ? ok : { ok: false, message: "must be a string" }),
  integer: (v) =>
    !isPresent(v) || /^-?\d+$/.test(v) ? ok : { ok: false, message: "must be an integer" },
  numeric: (v) =>
    !isPresent(v) || /^-?\d+(\.\d+)?$/.test(v) ? ok : { ok: false, message: "must be numeric" },
  boolean: (v) =>
    !isPresent(v) || ["0", "1", "true", "false"].includes(v.toLowerCase())
      ? ok
      : { ok: false, message: "must be a boolean" },
  alpha_num: (v) =>
    !isPresent(v) || /^[a-zA-Z0-9]+$/.test(v) ? ok : { ok: false, message: "must be alphanumeric" },
  alpha_dash: (v) =>
    !isPresent(v) || /^[a-zA-Z0-9_-]+$/.test(v)
      ? ok
      : { ok: false, message: "may only contain letters, numbers, dashes and underscores" },
  url: (v) => {
    if (!isPresent(v)) return ok;
    try {
      new URL(v);
      return ok;
    } catch {
      return { ok: false, message: "must be a valid URL" };
    }
  },
  email: (v) =>
    !isPresent(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? ok : { ok: false, message: "must be a valid email" },
  ipv4: (v) =>
    !isPresent(v) || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(v) ? ok : { ok: false, message: "must be an IPv4 address" },
  ipv6: (v) =>
    !isPresent(v) || /^[0-9a-fA-F:]+$/.test(v) ? ok : { ok: false, message: "must be an IPv6 address" },
  in: (v, arg) => {
    if (!isPresent(v)) return ok;
    const allowed = (arg ?? "").split(",").map((s) => s.trim());
    return allowed.includes(v) ? ok : { ok: false, message: `must be one of ${allowed.join(", ")}` };
  },
  not_in: (v, arg) => {
    if (!isPresent(v)) return ok;
    const denied = (arg ?? "").split(",").map((s) => s.trim());
    return denied.includes(v)
      ? { ok: false, message: `must not be one of ${denied.join(", ")}` }
      : ok;
  },
  min: (v, arg) => {
    if (!isPresent(v) || arg === undefined) return ok;
    const n = Number(arg);
    if (Number.isNaN(n)) return ok;
    if (/^-?\d+(\.\d+)?$/.test(v)) {
      return Number(v) >= n ? ok : { ok: false, message: `must be at least ${n}` };
    }
    return v.length >= n ? ok : { ok: false, message: `must be at least ${n} characters` };
  },
  max: (v, arg) => {
    if (!isPresent(v) || arg === undefined) return ok;
    const n = Number(arg);
    if (Number.isNaN(n)) return ok;
    if (/^-?\d+(\.\d+)?$/.test(v)) {
      return Number(v) <= n ? ok : { ok: false, message: `must be at most ${n}` };
    }
    return v.length <= n ? ok : { ok: false, message: `must be at most ${n} characters` };
  },
  between: (v, arg) => {
    if (!isPresent(v) || arg === undefined) return ok;
    const [aRaw, bRaw] = arg.split(",");
    const a = Number(aRaw);
    const b = Number(bRaw);
    if (Number.isNaN(a) || Number.isNaN(b)) return ok;
    if (/^-?\d+(\.\d+)?$/.test(v)) {
      const n = Number(v);
      return n >= a && n <= b ? ok : { ok: false, message: `must be between ${a} and ${b}` };
    }
    return v.length >= a && v.length <= b
      ? ok
      : { ok: false, message: `must be between ${a} and ${b} characters` };
  },
  regex: (v, arg) => {
    if (!isPresent(v) || !arg) return ok;
    try {
      const re = new RegExp(arg);
      return re.test(v) ? ok : { ok: false, message: `must match pattern ${arg}` };
    } catch {
      return { ok: false, message: "rule has invalid regex" };
    }
  },
  starts_with: (v, arg) =>
    !isPresent(v) || !arg || v.startsWith(arg)
      ? ok
      : { ok: false, message: `must start with ${arg}` },
  ends_with: (v, arg) =>
    !isPresent(v) || !arg || v.endsWith(arg)
      ? ok
      : { ok: false, message: `must end with ${arg}` },
  file_exists: () => ok,
};

export type ParsedRule = { name: string; arg: string | undefined };

export function parseRules(spec: string): ParsedRule[] {
  return spec
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx === -1) return { name: part.toLowerCase(), arg: undefined };
      return { name: part.slice(0, idx).toLowerCase(), arg: part.slice(idx + 1) };
    });
}

export function validateAgainstRules(
  value: string | null,
  spec: string,
): { ok: true } | { ok: false; messages: string[] } {
  const rules = parseRules(spec);
  const errors: string[] = [];

  const requiredPresent = rules.some((r) => r.name === "required");
  const nullableAllowed = rules.some((r) => r.name === "nullable");
  if (!isPresent(value)) {
    if (requiredPresent) return { ok: false, messages: ["is required"] };
    if (nullableAllowed) return { ok: true };
    return { ok: true };
  }

  for (const rule of rules) {
    const fn = validators[rule.name];
    if (!fn) continue;
    const res = fn(value, rule.arg);
    if (!res.ok) errors.push(res.message);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, messages: errors };
}
