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
| **x402** | `src/server.ts` + `src/x402.ts` | **The business model.** Full 402 handshake in spec shape (unpaid → 402 + `accepts[]`; paid → 200 + `X-PAYMENT-RESPONSE`). Real EIP-3009 verification is implemented: the `X-PAYMENT` authorization's EIP-712 signature is recovered and checked against payTo/amount/time window, then (when configured) settled on-chain via `transferWithAuthorization`, returning a tx hash. |
| **Agent Skills** | `skill/SKILL.md` | Packaged, installable skill that wraps the full agent loop — discover fixtures → hit paywall → pay → consume — over the MCP tools + x402 gateway, with the exact handshake shapes in `skill/references/x402.md`. |
| **CCTP** | `scripts/fund-agent.ts` (`npm run fund`) | Agent-wallet funding: `depositForBurn` of USDC into Injective (CCTP domain 29), the on-ramp for autonomous wallets that pay the x402 calls. |
| **Injective integration** | x402 `network: eip155:1439`, `src/x402.ts` | Payment contract + on-chain settlement target Injective EVM testnet; a relayer submits the EIP-3009 authorization and pays gas. |

### Payment modes (auto-selected from env)
| Mode | Enabled by | Behavior |
|---|---|---|
| `demo` | *(default, no config)* | Accepts the handshake, issues a signed token. Zero-config for judges. |
| `verify` | `USDC_ADDRESS` | Cryptographically verifies the EIP-3009 signature, recipient, amount, and validity window. |
| `settle` | `+ RPC_URL`, `RELAYER_PRIVATE_KEY` | Also submits `transferWithAuthorization` on Injective EVM testnet and returns the tx hash. |

Payment tokens are **HMAC-signed** (`src/token.ts`), so the MCP premium tool
validates a token was issued by the gateway for that match — not just any
non-empty string. `GET /health` reports the active mode.

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
npm run fund       # CCTP: fund an agent wallet with USDC into Injective (needs env)
```
Runs zero-config in demo mode. To enable real EIP-3009 verification / on-chain
settlement, set the payment vars in `.env` (see `.env.example`).
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
- The x402 verification path is real code (`src/x402.ts`): EIP-3009 signature
  recovery + payTo/amount/window checks, and a relayer that submits
  `transferWithAuthorization` on Injective EVM testnet. It ships **demo mode by
  default** (zero-config for judges); set `USDC_ADDRESS` for verification and
  `RPC_URL` + `RELAYER_PRIVATE_KEY` for on-chain settlement.
- Data source is community-run (worldcup26.ir); API-Football is the drop-in
  production upgrade (`APIFOOTBALL_KEY`).
- CCTP funding (`scripts/fund-agent.ts`) does the `depositForBurn`; the Circle
  attestation + destination mint are the standard follow-up steps.
