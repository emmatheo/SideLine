# SIDELINE — demo & recording script

A ready-to-shoot voiceover + shot list for a ≤60s walkthrough video, plus the
longer ≤3-minute judge demo. Everything here runs on live data with **no API
keys** — the whole point of the product.

## Before you record (2 minutes)

```bash
npm install
npm start                 # gateway + landing on http://localhost:8791
npm run smoke             # optional: green PASS/FAIL check, great credibility beat
```
Open **http://localhost:8791**. The live board fills from the real feed. For the
"AI calls it" beat, also connect SIDELINE in Claude Desktop (see the MCP config
on the landing page or in the README).

---

## 60-second voiceover (screen-recording the site)

The site has a **▶ Walk me through it** button that auto-plays the
free → 402 → paid sequence with on-screen captions, so the timing below lines up
with one button press. Narrate over it:

| Time | On screen | Voiceover |
|---|---|---|
| 0:00 | Hero | "This is SIDELINE. Live World Cup data for AIs, agents, and developers — with **no API keys, ever**." |
| 0:06 | Guide cards | "One small server, two doors: one for AI assistants over MCP, one for developers over plain HTTP. Here's the whole idea in four steps." |
| 0:14 | Click **Walk me through it** → free call | "First, free data — anyone reads live scores and fixtures, no account, no key." |
| 0:22 | 402 response | "Ask for a premium brief and the server answers **HTTP 402** with the price. There's no login — the **payment is the authentication**. That's the x402 standard." |
| 0:32 | Paid 200 + token | "Send the payment and the brief unlocks, with a reusable token. An AI runs this whole loop on its own." |
| 0:42 | Claude Desktop (optional) | "Connected to Claude, I just ask 'what World Cup matches are on?' — and the AI calls the live tool itself." |
| 0:52 | Close on hero | "SIDELINE. The payment is the account. No keys, ever." |

---

## 3-minute judge demo (live, hands-on)

1. **Landing page (0:00–0:40).** Live board filling from the real feed. Say the
   thesis: two blind users (AIs and agents) hit the same wall — keys and signup
   forms — and SIDELINE removes it. Point at "no keys, ever."
2. **Try-it console (0:40–1:40).** Press the three buttons in order:
   - `GET /matches (free)` → **200**, no key.
   - `GET /premium/brief (no payment)` → **402** — read out the payment contract
     (`maxAmountRequired`, `payTo`, `resource`).
   - `↻ retry WITH payment` → **200** + `X-PAYMENT-RESPONSE` receipt. The whole
     x402 story in three clicks.
3. **Claude Desktop, MCP (1:40–2:30).** Ask "what World Cup matches are on?" —
   watch Claude call `get_live_scores` live. Then ask for the premium brief: it
   returns the 402 contract, you pay at the gateway, pass the token back, and it
   unlocks. An AI autonomously paying for data.
4. **Close (2:30–3:00).** Recap: free tier open to everyone; premium metered by
   x402 where the payment *is* the account; targets Injective EVM testnet
   (`eip155:1439`) with relayer settlement as the production path.

---

## Honest framing (say this — judges respect it)

- Demo mode accepts the x402 handshake and issues a token immediately so the
  end-to-end loop is demonstrable with zero on-chain setup. Production submits
  the EIP-3009 authorization to a facilitator/relayer for on-chain USDC
  settlement before serving — the marked integration point in `src/server.ts`.
- Data comes from a free, community-run, no-auth World Cup feed; API-Football is
  the drop-in production upgrade (`APIFOOTBALL_KEY`).

## Fallback if the live feed is quiet

Match days vary. If the feed returns no in-progress games, the board and
`get_live_scores` still show finished matches — narrate those, or set
`APIFOOTBALL_KEY` in `.env` to switch sources. The 402 paywall demo works
regardless, since the payment check fires before any match lookup.
