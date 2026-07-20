// SIDELINE HTTP gateway — the API with no API keys.
//
//   GET /matches                 free: all fixtures + live scores (real feed)
//   GET /live                    free: live/finished only
//   GET /premium/brief/:id        x402-metered: 402 handshake, payment = auth
//   GET /health                  status (incl. active payment mode)
//   /                            landing page with a live try-it console
//
// x402 flow:
//   1) request without X-PAYMENT  -> 402 + JSON payment requirements
//   2) request with X-PAYMENT     -> verified (and, when configured, settled
//                                    on-chain on Injective EVM testnet), then
//                                    served + an HMAC-signed payment token the
//                                    MCP premium tool can reuse.
// No accounts. No keys. The payment IS the authentication.

import "dotenv/config";
import express from "express";
import path from "path";
import { Engine } from "./engine.js";
import { verifyAndSettle, paymentMode } from "./x402.js";
import { issueToken } from "./token.js";

const PORT = Number(process.env.PORT ?? 8791);
const PRICE = process.env.PRICE_UNITS ?? "5000"; // 0.005 USDC (6dp)
const PAY_TO = process.env.PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = process.env.CHAIN_ID ? `eip155:${process.env.CHAIN_ID}` : "eip155:1439";

function paymentRequired(id: string) {
  return {
    x402Version: 1,
    error: "Payment required",
    accepts: [{
      scheme: "exact",
      network: NETWORK,                    // Injective EVM testnet
      asset: "USDC",
      maxAmountRequired: PRICE,
      payTo: PAY_TO,
      resource: `/premium/brief/${id}`,
      description: "SIDELINE premium match brief — pay-per-call, no account, no key",
      mimeType: "application/json",
    }],
  };
}

async function main() {
  const engine = new Engine();
  await engine.refresh();
  setInterval(() => void engine.refresh(), 45_000);

  const app = express();
  app.use(express.static(path.join(process.cwd(), "public")));

  app.get("/health", (_q, r) => r.json({
    ok: true, app: "sideline", matches: engine.list().length,
    dataSource: process.env.APIFOOTBALL_KEY ? "api-football" : "worldcup26.ir (free, no auth)",
    x402: { price: PRICE, asset: "USDC", payTo: PAY_TO, network: NETWORK, mode: paymentMode() },
  }));

  app.get("/matches", (_q, r) => r.json(engine.list()));
  app.get("/live", (_q, r) => r.json(engine.list().filter((m) => m.status !== "upcoming")));

  app.get("/premium/brief/:id", async (q, r) => {
    try {
      const payment = q.get("X-PAYMENT");
      if (!payment) return r.status(402).json(paymentRequired(q.params.id));

      // Verify the x402 payment (and settle on-chain when configured).
      const settle = await verifyAndSettle(payment);
      if (!settle.ok) {
        return r.status(402).json({ ...paymentRequired(q.params.id), reason: settle.reason });
      }

      const m = engine.matches.get(q.params.id);
      if (!m) return r.status(404).json({ error: "unknown match id" });

      const token = issueToken(q.params.id, { tx: settle.txHash ?? null });
      r.setHeader("X-PAYMENT-RESPONSE", JSON.stringify({
        settled: settle.mode === "settled", mode: settle.mode, txHash: settle.txHash ?? null, token,
      }));
      r.json({
        paid: true, mode: settle.mode, txHash: settle.txHash ?? null, payment_token: token,
        match: `${m.home} vs ${m.away}`, stage: m.stage ?? null, status: m.status,
        score: m.homeScore != null ? `${m.homeScore}-${m.awayScore}` : null, kickoff: m.kickoff,
        brief: `Live-feed brief for ${m.home} vs ${m.away} — status=${m.status}. Deeper paid analytics ship here next.`,
      });
    } catch (e: any) {
      console.error("[sideline] premium error:", e.message);
      r.status(500).json({ error: "internal error", detail: e.message });
    }
  });

  app.listen(PORT, () => console.log(
    `[sideline] gateway live on :${PORT} — no keys, ever — payment mode: ${paymentMode()}`,
  ));
}

main().catch((e) => { console.error("[sideline] fatal:", e.message); process.exit(1); });
