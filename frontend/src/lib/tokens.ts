/**
 * Token configuration by chain. Easy to update for new chains or tokens.
 * Native ETH is represented as symbol "ETH" with address null.
 * For chain 31337 (local), token addresses come from deployedAddresses after deploy.
 */

import type { Address } from "viem";
import { deployedAddresses } from "../contracts/deployedAddresses";

export type TokenInfo = {
  symbol: string;
  name: string;
  decimals: number;
  /** null for native (ETH) */
  address: Address | null;
};

export type ChainTokens = {
  native: TokenInfo;
  tokens: TokenInfo[];
};

/** ChainId -> supported tokens. Add new chains here. */
export const TOKENS_BY_CHAIN: Record<number, ChainTokens> = {
  31337: {
    native: { symbol: "ETH", name: "Ether", decimals: 18, address: null },
    tokens: [
      { symbol: "USDC", name: "USD Coin", decimals: 6, address: deployedAddresses.USDC as Address },
      { symbol: "USDT", name: "Tether USD", decimals: 6, address: deployedAddresses.USDT as Address },
    ],
  },
  1: {
    native: { symbol: "ETH", name: "Ether", decimals: 18, address: null },
    tokens: [
      { symbol: "USDC", name: "USD Coin", decimals: 6, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address },
      { symbol: "USDT", name: "Tether USD", decimals: 6, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address },
    ],
  },
};

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Get tokens config for a chain. Returns native + tokens; addresses for mocks may be zero until deployed.
 */
export function getTokensForChain(chainId: number): ChainTokens {
  const config = TOKENS_BY_CHAIN[chainId];
  if (config) return config;
  return {
    native: { symbol: "ETH", name: "Ether", decimals: 18, address: null },
    tokens: [],
  };
}

/**
 * All selectable assets for send/display: native first, then tokens.
 */
export function getSelectableAssets(chainId: number): TokenInfo[] {
  const { native, tokens } = getTokensForChain(chainId);
  return [native, ...tokens];
}

export { ERC20_BALANCE_ABI };
