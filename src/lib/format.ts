const GROUP_SEPARATOR = /\B(?=(\d{3})+(?!\d))/g;

/** 1234567 -> "1.234.567" (pt-BR visual grouping). */
export function formatCounter(value: string): string {
  return value.replace(GROUP_SEPARATOR, ".");
}

/** Exact decimal comparison without converting to Number. */
export function compareDecimal(a: string, b: string): number {
  const clean = (input: string) => input.replace(/^0+(?=\d)/, "");
  const left = clean(a);
  const right = clean(b);
  if (left.length !== right.length) return left.length - right.length;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,18}$/.test(value);
}

export function makeClickId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
