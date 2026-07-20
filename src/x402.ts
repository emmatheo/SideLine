// x402 payment verification & settlement for the SIDELINE gateway.
//
// Three modes, chosen automatically from env (so the demo runs with zero config):
//   demo     (default)            — accept the handshake, issue a token, no chain.
//   verify   (USDC_ADDRESS set)   — cryptographically verify the EIP-3009
//                                   authorization: EIP-712 signature recovers to
//                                   `from`, correct recipient, amount, time window.
//   settle   (+ RELAYER_PRIVATE_KEY, RPC_URL) — also submit
//                                   transferWithAuthorization on Injective EVM
//                                   testnet and return the on-chain tx hash.
//
// `ethers` is imported lazily and only outside demo mode, so a missing/broken
// web3 dep can never crash the free/demo path the hackathon demo relies on.

export interface Settlement {
  mode: "demo" | "verified" | "settled";
  ok: boolean;
  txHash?: string;
  from?: string;
  reason?: string;
}

const PAY_TO = (process.env.PAY_TO ?? "").toLowerCase();
const PRICE = BigInt(process.env.PRICE_UNITS ?? "5000");
const RPC_URL = process.env.RPC_URL;
const USDC = process.env.USDC_ADDRESS;
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "1439"); // Injective EVM testnet
const TOKEN_NAME = process.env.USDC_NAME ?? "USD Coin";  // must match the deployed token's EIP-712 domain
const TOKEN_VERSION = process.env.USDC_VERSION ?? "2";

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export function paymentMode(): "demo" | "verify" | "settle" {
  if (RELAYER_KEY && RPC_URL && USDC) return "settle";
  if (USDC) return "verify";
  return "demo";
}

/** Decode an X-PAYMENT header (base64 JSON per x402, or raw JSON) into the
 *  EIP-3009 authorization + signature. Returns null if it isn't that shape. */
function decode(header: string): { signature: string; authorization: any } | null {
  try {
    const raw = header.trim().startsWith("{")
      ? header
      : Buffer.from(header, "base64").toString("utf8");
    const obj = JSON.parse(raw);
    const p = obj.payload ?? obj;
    if (p?.signature && p?.authorization) {
      return { signature: p.signature, authorization: p.authorization };
    }
  } catch {
    /* not a structured payload */
  }
  return null;
}

export async function verifyAndSettle(xPayment: string): Promise<Settlement> {
  const mode = paymentMode();
  if (mode === "demo") return { mode: "demo", ok: true };

  const decoded = decode(xPayment);
  if (!decoded) {
    return { mode: "demo", ok: false, reason: "malformed X-PAYMENT (expected a base64 EIP-3009 authorization)" };
  }
  const a = decoded.authorization;

  // 1) recipient, amount, and validity window — cheap checks before any crypto.
  const now = Math.floor(Date.now() / 1000);
  if (String(a.to).toLowerCase() !== PAY_TO) return { mode: "verified", ok: false, reason: "payTo mismatch" };
  if (BigInt(a.value) < PRICE) return { mode: "verified", ok: false, reason: "amount below required price" };
  if (Number(a.validAfter) > now || Number(a.validBefore) < now) {
    return { mode: "verified", ok: false, reason: "authorization expired or not yet valid" };
  }

  // 2) EIP-712 signature must recover to `from`.
  const { ethers } = await import("ethers");
  const domain = { name: TOKEN_NAME, version: TOKEN_VERSION, chainId: CHAIN_ID, verifyingContract: USDC };
  let recovered: string;
  try {
    recovered = ethers.verifyTypedData(domain, EIP3009_TYPES, {
      from: a.from, to: a.to, value: a.value,
      validAfter: a.validAfter, validBefore: a.validBefore, nonce: a.nonce,
    }, decoded.signature);
  } catch (e: any) {
    return { mode: "verified", ok: false, reason: "signature verification failed: " + e.message };
  }
  if (recovered.toLowerCase() !== String(a.from).toLowerCase()) {
    return { mode: "verified", ok: false, reason: "signature does not match `from`" };
  }

  if (mode === "verify") return { mode: "verified", ok: true, from: recovered };

  // 3) settle on-chain: relayer submits transferWithAuthorization and pays gas.
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const relayer = new ethers.Wallet(RELAYER_KEY!, provider);
    const usdc = new ethers.Contract(USDC!, [
      "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
    ], relayer);
    const sig = ethers.Signature.from(decoded.signature);
    const tx = await usdc.transferWithAuthorization(
      a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, sig.v, sig.r, sig.s,
    );
    const rcpt = await tx.wait(1);
    return { mode: "settled", ok: true, from: recovered, txHash: rcpt?.hash ?? tx.hash };
  } catch (e: any) {
    return { mode: "verified", ok: false, reason: "settlement transaction failed: " + e.message };
  }
}
