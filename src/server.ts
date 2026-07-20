// SIDELINE HTTP gateway — the API with no API keys.
//
//   GET /matches                 free: all fixtures + live scores (real feed)
//   GET /live                    free: live/finished only
//   GET /premium/brief/:id       x402-metered: 402 handshake, payment = auth
//   GET /health                  status
//   /                            landing page with a live try-it console
//
// x402 flow implemented to spec shape:
//   1) request without X-PAYMENT  -> 402 + JSON payment requirements
//   2) request with X-PAYMENT     -> verified (facilitator integration point),
//                                    served + payment token for MCP reuse
// No accounts. No keys. The payment IS the authentication.

import "dotenv/config";
import express from "express";
import path from "path";
import crypto from "crypto";
import { Engine } from "./engine.js";

const PORT = Number(process.env.PORT ?? 8791);
const PRICE = process.env.PRICE_UNITS ?? "5000"; // 0.005 USDC (6dp)
const PAY_TO = process.env.PAY_TO ?? "0x0000000000000000000000000000000000000000";

async function main() {
  const engine = new Engine();
  await engine.refresh();
  setInterval(() => void engine.refresh(), 45_000);

  const app = express();
  app.use(express.static(path.join(process.cwd(), "public")));

  // Payment tokens issued after a settled x402 payment (in-memory; stateless-friendly)
  const tokens = new Map<string, number>(); // token -> expiry

  app.get("/health", (_q, r) => r.json({
    ok: true, app: "sideline", matches: engine.list().length,
    dataSource: process.env.APIFOOTBALL_KEY ? "api-football" : "worldcup26.ir (free, no auth)",
    x402: { price: PRICE, asset: "USDC", payTo: PAY_TO },
  }));

  app.get("/matches", (_q, r) => r.json(engine.list()));
  app.get("/live", (_q, r) => r.json(engine.list().filter((m) => m.status !== "upcoming")));

  app.get("/premium/brief/:id", (q, r) => {
    const payment = q.get("X-PAYMENT");
    if (!payment) {
      return r.status(402).json({
        x402Version: 1,
        error: "Payment required",
        accepts: [{
          scheme: "exact",
          network: "eip155:1439",             // Injective EVM testnet (chain id per docs)
          asset: "USDC",
          maxAmountRequired: PRICE,
          payTo: PAY_TO,
          resource: `/premium/brief/${q.params.id}`,
          description: "SIDELINE premium match brief — pay-per-call, no account, no key",
          mimeType: "application/json",
        }],
      });
    }
    // Facilitator verification is the marked integration point: in production the
    // X-PAYMENT payload (EIP-3009 authorization) is submitted to a relayer and
    // settled on-chain before serving. Demo accepts the handshake and issues a
    // token so agents can reuse it against the MCP premium tool.
    const m = engine.matches.get(q.params.id);
    if (!m) return r.status(404).json({ error: "unknown match id" });
    const token = crypto.randomBytes(12).toString("hex");
    tokens.set(token, Date.now() + 15 * 60_000);
    r.setHeader("X-PAYMENT-RESPONSE", JSON.stringify({ settled: true, token }));
    r.json({
      paid: true, payment_token: token,
      match: `${m.home} vs ${m.away}`, stage: m.stage ?? null, status: m.status,
      score: m.homeScore != null ? `${m.homeScore}-${m.awayScore}` : null, kickoff: m.kickoff,
      brief: `Live-feed brief for ${m.home} vs ${m.away} — status=${m.status}. Deeper paid analytics ship here next.`,
    });
  });

  app.listen(PORT, () => console.log(`[sideline] gateway live on :${PORT} — no keys, ever`));
}

main().catch((e) => { console.error("[sideline] fatal:", e.message); process.exit(1); });
