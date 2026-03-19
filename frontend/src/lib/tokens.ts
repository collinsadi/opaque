/**
 * Token configuration by chain. Driven by MULTICHAIN_CONFIG (contract-config.ts).
 * Native ETH is represented as symbol "ETH" with address null.
 */

import type { Address } from "viem";
import { getChain } from "./chain";
import { MULTICHAIN_CONFIG } from "../contracts/contract-config";

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

const TOKEN_META: Record<string, { name: string; decimals: number }> = {
  USDC: { name: "USD Coin", decimals: 6 },
  USDT: { name: "Tether USD", decimals: 6 },
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
 * Get tokens config for a chain from MULTICHAIN_CONFIG. Only tokens listed for that chain are returned.
 * Native token uses the chain's nativeCurrency (e.g. ETH on Sepolia).
 */
export function getTokensForChain(chainId: number): ChainTokens {
  const chain = getChain(chainId);
  const native: TokenInfo = {
    symbol: chain.nativeCurrency.symbol,
    name: chain.nativeCurrency.name,
    decimals: chain.nativeCurrency.decimals,
    address: null,
  };
  const config = MULTICHAIN_CONFIG[chainId];
  if (!config?.tokens) {
    return { native, tokens: [] };
  }
  const tokens: TokenInfo[] = [];
  for (const [symbol, address] of Object.entries(config.tokens)) {
    const meta = TOKEN_META[symbol];
    if (meta && address && address !== "0x0000000000000000000000000000000000000000") {
      tokens.push({
        symbol,
        name: meta.name,
        decimals: meta.decimals,
        address: address as Address,
      });
    }
  }
  return { native, tokens };
}

/**
 * All selectable assets for send/display: native first, then tokens.
 */
export function getSelectableAssets(chainId: number): TokenInfo[] {
  const { native, tokens } = getTokensForChain(chainId);
  return [native, ...tokens];
}

export { ERC20_BALANCE_ABI };
