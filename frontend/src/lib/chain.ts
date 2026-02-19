/**
 * App chain config driven by VITE_CHAIN_ID / VITE_NETWORK.
 * Update .env (VITE_CHAIN_ID, VITE_NETWORK) to change the target chain for transactions.
 */

import { defineChain, type Chain } from "viem";
import { mainnet } from "viem/chains";

/** Hardhat local node (default chain for local dev) */
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat",
  network: "hardhat",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
});

const KNOWN_CHAINS: Record<number, Chain> = {
  1: mainnet,
  31337: hardhatLocal,
};

/**
 * Returns the chain the dApp should use for wallet/send transactions.
 * Set VITE_CHAIN_ID in .env (e.g. 31337 for local Hardhat, 1 for mainnet).
 */
export function getAppChain(): Chain {
  const raw = import.meta.env.VITE_CHAIN_ID;
  const id = raw ? Number(import.meta.env.VITE_CHAIN_ID) : 31337;
  const known = KNOWN_CHAINS[id];
  if (known) {
    console.log("🔗 [Opaque] getAppChain", { chainId: id, name: known.name });
    return known;
  }
  console.log("🔗 [Opaque] getAppChain (custom)", { chainId: id });
  return defineChain({
    id,
    name: import.meta.env.VITE_NETWORK ?? `Chain ${id}`,
    nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
    rpcUrls: { default: { http: [] } },
  });
}
