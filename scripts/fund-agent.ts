// CCTP agent funding — burn USDC on a source chain and mint it into Injective
// (CCTP domain 29) so an autonomous agent wallet can pay SIDELINE's x402 calls.
//
// This is the deliberate funding path the README calls out: it does the
// depositForBurn step (Circle attestation + destination mint follow, per Circle
// docs). Env-gated so nothing runs without explicit config.
//
//   SRC_RPC, SRC_PRIVATE_KEY, SRC_USDC, SRC_TOKEN_MESSENGER, AGENT_ADDRESS, AMOUNT
//   npm run fund

import { ethers } from "ethers";

const {
  SRC_RPC, SRC_PRIVATE_KEY, SRC_USDC, SRC_TOKEN_MESSENGER, AGENT_ADDRESS,
  AMOUNT = "1000000", // 1 USDC (6dp)
} = process.env;

const INJECTIVE_DOMAIN = 29; // CCTP destination domain for Injective testnet

async function main() {
  if (!SRC_RPC || !SRC_PRIVATE_KEY || !SRC_USDC || !SRC_TOKEN_MESSENGER || !AGENT_ADDRESS) {
    console.error("Set SRC_RPC, SRC_PRIVATE_KEY, SRC_USDC, SRC_TOKEN_MESSENGER, AGENT_ADDRESS (and optional AMOUNT).");
    process.exit(1);
  }
  const provider = new ethers.JsonRpcProvider(SRC_RPC);
  const wallet = new ethers.Wallet(SRC_PRIVATE_KEY, provider);
  const amount = BigInt(AMOUNT);

  const usdc = new ethers.Contract(SRC_USDC, ["function approve(address,uint256) returns (bool)"], wallet);
  const messenger = new ethers.Contract(SRC_TOKEN_MESSENGER, [
    "function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken) returns (uint64)",
  ], wallet);

  const mintRecipient = ethers.zeroPadValue(AGENT_ADDRESS, 32); // address -> bytes32

  console.log(`Approving ${amount} USDC to the TokenMessenger…`);
  await (await usdc.approve(SRC_TOKEN_MESSENGER, amount)).wait();

  console.log(`depositForBurn → Injective (domain ${INJECTIVE_DOMAIN}), recipient ${AGENT_ADDRESS}…`);
  const tx = await messenger.depositForBurn(amount, INJECTIVE_DOMAIN, mintRecipient, SRC_USDC);
  const rcpt = await tx.wait();

  console.log("Burn tx:", rcpt?.hash);
  console.log("Next: fetch the Circle attestation for this burn, then call receiveMessage on Injective to mint.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
