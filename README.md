# SIDELINE — Live World Cup data. No API keys, ever.
### Injective Global Cup submission

**The problem (two users, one wall).** (1) AI assistants are where people ask
everything now — and every one of them is blind to the world's biggest live
sporting event, because no standard tool exposes it. (2) Developers and
autonomous agents who want sports data face the same ritual: signup forms,
API keys, rate-limit tiers, and season-length subscriptions to read one
match. Agents can't even fill in the signup form.

**The product.** One small server, two doors:
- **MCP door (for AIs):** add one config entry and Claude/Cursor/any MCP
  client gets live World Cup tools — `get_live_scores`, `get_fixtures`,
  `get_match`, `get_premium_brief`. Answers come from the live feed at call
  time. No database, no manual curation.
- **HTTP door (for devs & agents):** plain endpoints where **the x402 payment
  is the authentication**. `GET /premium/brief/:id` without payment returns
  **HTTP 402** with the exact price and pay-to in the x402 shape; retry with
  an `X-PAYMENT` authorization and the content is served with an
  `X-PAYMENT-RESPONSE` receipt. No accounts. No keys. Free tier
  (`/matches`, `/live`) stays open to everyone.

## 🔴 How the Injective technologies are used
| Technology | Where | How |
|---|---|---|
| **MCP Server** | `src/mcp.ts` | **Core product.** A real Model Context Protocol server (official TypeScript SDK, stdio transport) exposing 4 live tools any AI can call. The premium tool returns the x402 payment contract when unpaid — agents learn to pay. |
| **x402** | `src/server.ts` `/premium/brief/:id` | **The business model.** Full 402 handshake in spec shape: unpaid → 402 + `accepts[]` (scheme, asset USDC, amount, payTo, resource); paid → 200 + `X-PAYMENT-RESPONSE`. Facilitator/relayer settlement is the marked integration point; payment tokens bridge HTTP payments to MCP tool calls. |
| **Agent Skills** | `skill/SKILL.md` | Packaged, installable skill that wraps the full agent loop — discover fixtures → hit paywall → pay → consume — over the MCP tools + x402 gateway, with the exact handshake shapes in `skill/references/x402.md`. |
| **CCTP** | roadmap | Funding path for agent wallets (USDC into Injective testnet, domain 29) — deliberately out of scope to keep the product small and honest. |
| **Injective integration** | x402 `network: eip155:1439` | Payment contract targets Injective EVM testnet; on-chain settlement via relayer is the production path. |

## World Cup data
Free, no-auth live API (worldcup26.ir) fetched at call time — optional
`APIFOOTBALL_KEY` upgrades to API-Football. Zero keys required to run,
test, or judge.

## Run
```bash
npm install
npm start          # HTTP gateway + landing on :8791
npm run mcp        # MCP server on stdio (for Claude Desktop / Cursor)
npm run smoke      # with the gateway running: PASS/FAIL the free -> 402 -> paid flow
```
Claude Desktop config:
```json
{ "mcpServers": { "sideline": { "command": "npx", "args": ["tsx", "src/mcp.ts"], "cwd": "/path/to/sideline" } } }
```

## Demo script (≤3 min)
1. Landing page: live board filling from the real feed — "no keys, ever."
2. Try-it console: free call (200) → premium call (402, show the payment
   contract) → retry with payment (200 + receipt header). The whole x402
   story in three clicks.
3. Claude Desktop with SIDELINE connected: ask "what World Cup matches are
   on?" — watch the AI call `get_live_scores` live.
4. Ask Claude for the premium brief: it hits the 402 contract → pays via the
   gateway → passes the token → unlocked. An AI autonomously paying for data.

## Honest notes
- Payment verification accepts the handshake and issues a token in demo
  mode; production submits the EIP-3009 authorization to an on-chain relayer
  before serving (marked in code).
- Data source is community-run; API-Football is the production upgrade path.
