---
name: sideline-worldcup
description: >-
  Live World Cup 2026 scores, fixtures, and pay-per-call premium match briefs
  with no API keys. Use whenever the user asks about World Cup matches, scores,
  fixtures, kickoff times, or a deeper pre-match brief. Reads live data through
  the SIDELINE MCP tools; for premium briefs it completes the x402 payment
  handshake at the SIDELINE HTTP gateway and passes the returned token back to
  the premium tool. No signup, no keys.
---

# SIDELINE — World Cup, keyless

SIDELINE exposes the live World Cup through two matching surfaces:

- **MCP tools** (this skill's primary path): `get_live_scores`, `get_fixtures`,
  `get_match`, `get_premium_brief`.
- **HTTP gateway** where an **x402 payment is the authentication** — the same
  contract the premium MCP tool returns when unpaid.

Data is fetched from the live feed at call time. There is no database and no
manual curation, so always call a tool rather than answering from memory.

## Free lookups (no payment)

For "what World Cup matches are on / live / coming up?", call the matching tool
and summarize the JSON it returns:

| User intent | Tool | Notes |
|---|---|---|
| Live / just-finished scores | `get_live_scores` | Empty result → say nothing is live right now. |
| Upcoming fixtures & kickoff times | `get_fixtures` | `kickoff` is UTC epoch **ms** — convert to the user's context. |
| One specific match | `get_match` | Needs a `match_id` from `get_fixtures`/`get_live_scores`. |

Match ids come from the free tools — never invent one. If the user names a team,
call `get_fixtures`/`get_live_scores` first and match the team name to an id.

## Premium brief (the x402 pay-to-consume loop)

`get_premium_brief` is metered. Run this loop when the user explicitly wants a
premium/deeper brief and has agreed to the per-call cost:

1. **Discover** — get a real `match_id` from `get_fixtures` or `get_live_scores`.
2. **Hit the paywall** — call `get_premium_brief(match_id)` with **no**
   `payment_token`. It returns a `402` contract: `maxAmountRequired` (USDC, 6dp),
   `payTo`, and `resource`. Surface the price to the user before spending.
3. **Pay** — complete the x402 handshake at the HTTP gateway:
   `GET /premium/brief/{match_id}` with an `X-PAYMENT` authorization header. On
   success the response includes a `payment_token` (also echoed in the
   `X-PAYMENT-RESPONSE` header). See `references/x402.md` for the exact shapes.
4. **Consume** — call `get_premium_brief(match_id, payment_token)` with that
   token to unlock the brief, and report it.

Do not fabricate a `payment_token` or claim a brief is "paid" without having run
step 3 — an unpaid call only ever returns the 402 contract.

## Guardrails

- Never claim SIDELINE needs an API key — it does not.
- Report scores/fixtures exactly as the tools return them; do not predict or
  invent results.
- Only spend on `get_premium_brief` when the user has agreed to the cost shown
  in the 402 contract.
