// SIDELINE smoke test — one command to prove the whole thing works before you
// hit record. Start the gateway first (`npm start`), then run `npm run smoke`.
// Walks the free -> 402 -> paid x402 sequence and prints PASS/FAIL per step.
// No extra deps: uses Node 18+ global fetch. Exit code 1 if any step fails.

const BASE = process.env.SMOKE_URL ?? `http://localhost:${process.env.PORT ?? 8791}`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log(`\nSIDELINE smoke test → ${BASE}\n`);

  // 1. Health — proof of "no keys"
  try {
    const r = await fetch(`${BASE}/health`);
    const j: any = await r.json();
    check("GET /health", r.status === 200 && j.ok === true,
      `HTTP ${r.status}, ${j.matches} matches, source=${j.dataSource}`);
  } catch (e: any) {
    check("GET /health", false, `gateway unreachable (${e.message}). Is \`npm start\` running?`);
    return finish(); // nothing else will work
  }

  // 2. Free tier — 200, array, grab a real match id
  let id: string | null = null;
  try {
    const r = await fetch(`${BASE}/matches`);
    const j: any = await r.json();
    const arr = Array.isArray(j) ? j : [];
    id = arr[0]?.id ?? null;
    check("GET /matches (free)", r.status === 200 && Array.isArray(j),
      `HTTP ${r.status}, ${arr.length} matches, no key needed`);
    if (!id) console.log("   ℹ️  feed returned no fixtures right now — paid-brief step will use a placeholder id");
  } catch (e: any) {
    check("GET /matches (free)", false, e.message);
  }

  // 3. Free /live — 200, array
  try {
    const r = await fetch(`${BASE}/live`);
    const j: any = await r.json();
    check("GET /live (free)", r.status === 200 && Array.isArray(j), `HTTP ${r.status}`);
  } catch (e: any) {
    check("GET /live (free)", false, e.message);
  }

  const briefId = id ?? "smoke-no-fixtures";

  // 4. Premium WITHOUT payment -> 402 + payment contract
  try {
    const r = await fetch(`${BASE}/premium/brief/${briefId}`);
    const j: any = await r.json();
    const accept = j?.accepts?.[0];
    const shaped = r.status === 402 && !!accept &&
      accept.asset === "USDC" && !!accept.maxAmountRequired && !!accept.payTo;
    check("GET /premium/brief/:id (no payment)", shaped,
      shaped ? `HTTP 402, price=${accept.maxAmountRequired} ${accept.asset}, payTo=${accept.payTo}`
             : `expected 402 + accepts[]; got HTTP ${r.status}`);
  } catch (e: any) {
    check("GET /premium/brief/:id (no payment)", false, e.message);
  }

  // 5. Premium WITH payment -> 200 + payment_token + X-PAYMENT-RESPONSE
  //    (needs a real id; server 404s on unknown ids after the paywall)
  if (id) {
    try {
      const r = await fetch(`${BASE}/premium/brief/${id}`, {
        headers: { "X-PAYMENT": "demo-eip3009-authorization" },
      });
      const receipt = r.headers.get("X-PAYMENT-RESPONSE");
      const j: any = await r.json();
      const ok = r.status === 200 && j.paid === true && !!j.payment_token && !!receipt;
      check("GET /premium/brief/:id (WITH payment)", ok,
        ok ? `HTTP 200, paid=true, token issued, receipt header present`
           : `expected 200 + paid token + receipt; got HTTP ${r.status}`);
    } catch (e: any) {
      check("GET /premium/brief/:id (WITH payment)", false, e.message);
    }
  } else {
    console.log("⏭️  GET /premium/brief/:id (WITH payment) — skipped: no real match id from the feed");
  }

  finish();
}

function finish() {
  console.log("");
  if (failures === 0) console.log("🎉 All checks passed — safe to record.\n");
  else console.log(`⚠️  ${failures} check(s) failed — see above.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
