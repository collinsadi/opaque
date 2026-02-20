/**
 * App chain config. Use getChain(chainId) for the connected wallet's chain; getAppChain() for env default.
 */

import { defineChain, type Chain } from "viem";
import { mainnet } from "viem/chains";
import { sepolia } from "viem/chains";

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

export const KNOWN_CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  31337: hardhatLocal,
};

/**
 * Returns the Chain for a given chainId. Use for wallet/contract calls when you have the connected chain id.
 */
export function getChain(chainId: number): Chain {
  const known = KNOWN_CHAINS[chainId];
  if (known) return known;
  return defineChain({
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
    rpcUrls: { default: { http: [] } },
  });
}

/**
 * Returns the chain the dApp should use when no wallet is connected (e.g. env default).
 * Set VITE_CHAIN_ID in .env (e.g. 31337 for local Hardhat, 1 for mainnet).
 */
export function getAppChain(): Chain {
  const raw = import.meta.env.VITE_CHAIN_ID;
  const id = raw ? Number(import.meta.env.VITE_CHAIN_ID) : 31337;
  return getChain(id);
}
