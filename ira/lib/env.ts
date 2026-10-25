// API keys. Both are required: the app has no offline or rule-based fallback.
// Put them in ira/.env.local (copy .env.example) and restart `npm run dev`.

export const KEY_NAMES = ["NESSIE_API_KEY", "GEMINI_API_KEY"] as const;
export type KeyName = (typeof KEY_NAMES)[number];

export class MissingKeyError extends Error {
  constructor(public readonly key: KeyName) {
    super(`${key} is not set. Add it to ira/.env.local and restart the server.`);
  }
}

export const missingKeys = (): KeyName[] => KEY_NAMES.filter((k) => !process.env[k]?.trim());

export function requireKey(name: KeyName): string {
  const v = process.env[name]?.trim();
  if (!v) throw new MissingKeyError(name);
  return v;
}
