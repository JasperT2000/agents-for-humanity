const ALLOWED = new Map<string, number>([
  ["30m", 30 * 60 * 1000],
  ["1h", 60 * 60 * 1000],
  ["2h", 2 * 60 * 60 * 1000],
  ["6h", 6 * 60 * 60 * 1000],
  ["12h", 12 * 60 * 60 * 1000],
]);

export function parseIntervalMs(value: string): number {
  const key = value.trim().toLowerCase();
  const ms = ALLOWED.get(key);
  if (ms === undefined) {
    throw new Error(
      `Invalid interval "${value}". Use one of: ${[...ALLOWED.keys()].join(", ")}`,
    );
  }
  return ms;
}
