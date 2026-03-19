/**
 * App chain config. Use getChain(chainId) for the connected wallet's chain; getAppChain() for env default.
 * RPC URL: VITE_RPC_URL when set; otherwise chain default with console warning.
 */

import { defineChain, type Chain } from "viem";
import { sepolia, mainnet } from "viem/chains";

// /** Hardhat local (commented: Sepolia-only) */
// export const hardhatLocal = defineChain({
//   id: 31337,
//   name: "Hardhat",
//   network: "hardhat",
//   nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
//   rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
// });

// /** Paseo PassetHub (commented: Sepolia-only) */
// export const paseo = defineChain({
//   id: 420420417,
//   name: "Polkadot Hub TestNet",
//   network: "polkadot-hub-testnet",
//   nativeCurrency: { decimals: 18, name: "PAS", symbol: "PAS" },
//   rpcUrls: { default: { http: ["https://eth-rpc-testnet.polkadot.io"] } },
// });

export const KNOWN_CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  // 31337: hardhatLocal,
  // 420420417: paseo,
};

const RPC_WARN_LOGGED: Record<number, boolean> = {};

/**
 * Returns the RPC URL for the given chain.
 * Uses VITE_RPC_URL when set, then chain default.
 * Logs a one-time console warning per chain when using the fallback (to encourage setting a custom RPC).
 */
export function getRpcUrl(chain: Chain): string | undefined {
  const genericUrl = import.meta.env.VITE_RPC_URL as string | undefined;
  if (genericUrl && typeof genericUrl === "string" && genericUrl.trim().length > 0) {
    return genericUrl.trim();
  }
  const fromChain = chain.rpcUrls?.default?.http?.[0];
  if (fromChain && !RPC_WARN_LOGGED[chain.id]) {
    RPC_WARN_LOGGED[chain.id] = true;
    console.warn(
      "[Opaque] RPC URL is not set. Using public RPC for chain",
      chain.id,
      "- consider setting VITE_RPC_URL in .env for better rate limits and privacy."
    );
  }
  return fromChain;
}

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
 * Set VITE_CHAIN_ID in .env (default Sepolia 11155111).
 */
export function getAppChain(): Chain {
  const raw = import.meta.env.VITE_CHAIN_ID;
  const id = raw ? Number(import.meta.env.VITE_CHAIN_ID) : 11155111;
  return getChain(id);
}
