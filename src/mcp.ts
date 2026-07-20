// SIDELINE MCP server — gives any AI assistant live World Cup eyes.
//
// Add to Claude Desktop / Cursor / any MCP client with one config entry:
//   { "mcpServers": { "sideline": { "command": "npx", "args": ["tsx", "src/mcp.ts"], "cwd": "<this repo>" } } }
//
// Tools are served from LIVE data (free no-auth World Cup API, refreshed on
// demand) — no database, no manual curation, no API keys. The premium tool
// demonstrates the x402 handshake: it returns the same 402 payment-required
// contract the HTTP gateway uses, so agents learn to pay per call.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Engine } from "./engine.js";

const engine = new Engine();
let lastRefresh = 0;
async function fresh() {           // refresh at most every 30s; live enough, polite to the API
  if (Date.now() - lastRefresh > 30_000) { await engine.refresh(); lastRefresh = Date.now(); }
  return engine.list();
}

const server = new McpServer({ name: "sideline", version: "0.1.0" });

server.tool(
  "get_live_scores",
  "Live and recently-finished World Cup matches with current scores. Data is fetched live at call time.",
  {},
  async () => {
    const m = (await fresh()).filter((x) => x.status !== "upcoming").slice(-15);
    return { content: [{ type: "text", text: JSON.stringify(m.length ? m : { note: "No live or finished matches right now." }, null, 2) }] };
  },
);

server.tool(
  "get_fixtures",
  "Upcoming World Cup fixtures with kickoff times (UTC ms) and stage.",
  {},
  async () => {
    const m = (await fresh()).filter((x) => x.status === "upcoming").slice(0, 25);
    return { content: [{ type: "text", text: JSON.stringify(m, null, 2) }] };
  },
);

server.tool(
  "get_match",
  "Details for one match by id (from get_fixtures / get_live_scores).",
  { match_id: z.string().describe("The match id") },
  async ({ match_id }) => {
    await fresh();
    const m = engine.matches.get(match_id);
    return { content: [{ type: "text", text: JSON.stringify(m ?? { error: "unknown match id" }, null, 2) }] };
  },
);

server.tool(
  "get_premium_brief",
  "Premium pre-match brief (community lean, schedule context). Demonstrates x402: without a payment token this returns the 402 payment contract; an agent that pays via the HTTP gateway receives a token to pass here.",
  { match_id: z.string(), payment_token: z.string().optional().describe("Token from a settled x402 payment at the HTTP gateway") },
  async ({ match_id, payment_token }) => {
    if (!payment_token) {
      return { content: [{ type: "text", text: JSON.stringify({
        status: 402, error: "Payment required",
        accepts: [{ scheme: "exact", asset: "USDC", maxAmountRequired: process.env.PRICE_UNITS ?? "5000",
          payTo: process.env.PAY_TO ?? "0x0", resource: "get_premium_brief",
          how: "GET the HTTP gateway /premium/brief/{id} to complete the x402 handshake and receive a token." }],
      }, null, 2) }] };
    }
    await fresh();
    const m = engine.matches.get(match_id);
    if (!m) return { content: [{ type: "text", text: JSON.stringify({ error: "unknown match id" }) }] };
    return { content: [{ type: "text", text: JSON.stringify({
      paid: true, match: `${m.home} vs ${m.away}`, stage: m.stage ?? null,
      kickoff: m.kickoff, status: m.status, score: m.homeScore != null ? `${m.homeScore}-${m.awayScore}` : null,
      brief: `Verified live feed context for ${m.home} vs ${m.away}: status=${m.status}. This slot is where deeper paid analytics ship next (odds-implied probabilities, form context).`,
    }, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[sideline-mcp] ready on stdio — live World Cup tools exposed");
