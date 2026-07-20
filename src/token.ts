// Payment tokens bridge a settled HTTP x402 payment to the MCP premium tool.
// They are HMAC-signed so the MCP server (a separate process) can validate one
// without shared memory — closing the "any non-empty token unlocks it" gap.
// A shared TOKEN_SECRET (env) ties the two doors together; a dev default keeps
// the zero-config demo working out of the box.

import crypto from "crypto";

const SECRET = process.env.TOKEN_SECRET ?? "sideline-dev-secret-change-me";
const TTL_MS = 15 * 60_000;

export function issueToken(matchId: string, extra: Record<string, unknown> = {}): string {
  const body = { m: matchId, exp: Date.now() + TTL_MS, ...extra };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(
  token?: string,
  matchId?: string,
): { ok: boolean; reason?: string; data?: any } {
  if (!token) return { ok: false, reason: "missing payment token" };
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, reason: "malformed token" };

  const expect = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid token signature" };
  }

  let data: any;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "corrupt token payload" };
  }
  if (typeof data.exp !== "number" || data.exp < Date.now()) return { ok: false, reason: "token expired" };
  if (matchId && data.m !== matchId) return { ok: false, reason: "token not valid for this match" };
  return { ok: true, data };
}
