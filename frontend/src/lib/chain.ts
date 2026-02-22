/**
 * App chain config. Use getChain(chainId) for the connected wallet's chain; getAppChain() for env default.
 * RPC URL: VITE_RPC_URL (or VITE_PASEO_RPC_URL for Paseo) when set; otherwise chain default with console warning.
 */

import { defineChain, type Chain } from "viem";
import { sepolia, mainnet } from "viem/chains";

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

/** Polkadot Hub testnet (Paseo PassetHub) - EVM-compatible */
export const paseo = defineChain({
  id: 420420417,
  name: "Polkadot Hub TestNet",
  network: "polkadot-hub-testnet",
  nativeCurrency: {
    decimals: 18,
    name: "PAS",
    symbol: "PAS",
  },
  rpcUrls: {
    default: { http: ["https://eth-rpc-testnet.polkadot.io"] },
  },
});

export const KNOWN_CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  31337: hardhatLocal,
  420420417: paseo,
};

const RPC_WARN_LOGGED: Record<number, boolean> = {};
const PASEO_CHAIN_ID = 420420417;

/**
 * Returns the RPC URL for the given chain.
 * For Paseo (420420417): uses VITE_PASEO_RPC_URL when set, then VITE_RPC_URL, then chain default.
 * For other chains: uses VITE_RPC_URL when set, then chain default.
 * Logs a one-time console warning per chain when using the fallback (to encourage setting a custom RPC).
 */
export function getRpcUrl(chain: Chain): string | undefined {
  const paseoUrl =
    chain.id === PASEO_CHAIN_ID
      ? (import.meta.env.VITE_PASEO_RPC_URL as string | undefined)
      : undefined;
  const genericUrl = import.meta.env.VITE_RPC_URL as string | undefined;
  const fromEnv = (paseoUrl ?? genericUrl) as string | undefined;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  const fromChain = chain.rpcUrls?.default?.http?.[0];
  if (fromChain && !RPC_WARN_LOGGED[chain.id]) {
    RPC_WARN_LOGGED[chain.id] = true;
    const envHint =
      chain.id === PASEO_CHAIN_ID
        ? "VITE_PASEO_RPC_URL or VITE_RPC_URL"
        : "VITE_RPC_URL";
    console.warn(
      "[Opaque] RPC URL is not set. Using public RPC for chain",
      chain.id,
      "- consider setting",
      envHint,
      "in .env for better rate limits and privacy."
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
 * Set VITE_CHAIN_ID in .env (e.g. 31337 for local Hardhat, 1 for mainnet).
 */
export function getAppChain(): Chain {
  const raw = import.meta.env.VITE_CHAIN_ID;
  const id = raw ? Number(import.meta.env.VITE_CHAIN_ID) : 31337;
  return getChain(id);
}
