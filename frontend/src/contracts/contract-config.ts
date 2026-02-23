/**
 * Centralized multichain contract configuration.
 * Maps chainId to StealthMetaAddressRegistry, StealthAddressAnnouncer, and token addresses.
 * Deploy script writes deployed-addresses.json for the deployed chain; we merge it here.
 */

import type { Address } from "viem";

import deployedJson from "./deployed-addresses.json";

export type ChainContractConfig = {
  registry: Address;
  announcer: Address;
  tokens: { USDC: Address; USDT: Address };
  /** First block where announcer exists; scanner never looks before this. Set by deploy script. */
  deployedBlock?: number;
};

/** Placeholder for chains not yet deployed. */
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const STATIC_CONFIG: Record<number, ChainContractConfig> = {
  1: {
    registry: ZERO,
    announcer: ZERO,
    tokens: {
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address,
    },
    deployedBlock: 0,
  },
  11155111: {
    registry: "0x77425e04163d608B876c7f50E34A378624A12067" as Address,
    announcer: "0x840f72249A8bF6F10b0eB64412E315efBD730865" as Address,
    tokens: {
      USDC: "0x7aD6F36984EA947B80A2A282BDfb27d0E888792e",
      USDT: "0x3b9B3EdDdc5ABBc5Cd474EB7EB5EcE4881272D20",
    },
    deployedBlock: 5_500_000,
  },
  31337: {
    registry: "0x43ca3D2C94be00692D207C6A1e60D8B325c6f12f" as Address,
    announcer: "0xb09da8a5B236fE0295A345035287e80bb0008290" as Address,
    tokens: {
      USDC: ZERO,
      USDT: ZERO,
    },
    deployedBlock: 0,
  },
  /** Polkadot Hub testnet (Paseo PassetHub). Set via deployed-addresses.json after deploy. */
  420420417: {
    registry: "0x6b37BD0Fc564dc353989B6A5E9c50b2fb68FB2a0" as Address,
    announcer: "0xD5FDa624D5F58F4586A959ff3e9c7CA72a9b74D8" as Address,
    tokens: { USDC: "0xEd6cF00a74D876Df67533abB09820dE2c7DD6533" as Address, USDT: "0xD0f91C535265a7958F7D16639C59608C4F3B5e5E" as Address },
    deployedBlock: 5590094,
  },
};

type DeployedJson = {
  chainId: number;
  registry: string;
  announcer: string;
  tokens: { USDC: string; USDT: string };
  deployedBlock?: number;
};

const deployed = deployedJson as DeployedJson;

/** Multichain config. Deploy script overwrites deployed-addresses.json so this stays in sync. */
export const MULTICHAIN_CONFIG: Record<number, ChainContractConfig> = {
  ...STATIC_CONFIG,
  ...(deployed?.chainId != null &&
    deployed.registry &&
    deployed.announcer &&
    deployed.tokens
    ? {
      [deployed.chainId]: {
        registry: deployed.registry as Address,
        announcer: deployed.announcer as Address,
        tokens: {
          USDC: (deployed.tokens.USDC ?? ZERO) as Address,
          USDT: (deployed.tokens.USDT ?? ZERO) as Address,
        },
        deployedBlock: deployed.deployedBlock ?? STATIC_CONFIG[deployed.chainId]?.deployedBlock ?? 0,
      },
    }
    : {}),
};

/**
 * Get contract config for a chain. Returns null if chain is not supported.
 */
export function getConfigForChain(chainId: number | null | undefined): ChainContractConfig | null {
  if (chainId == null) return null;
  return MULTICHAIN_CONFIG[chainId] ?? null;
}

/** Supported chain IDs (Ethereum, Sepolia, Hardhat local, Paseo). */
export const SUPPORTED_CHAIN_IDS: readonly number[] = [11155111, 31337, 420420417];

export function isChainSupported(chainId: number | null | undefined): boolean {
  return chainId != null && chainId in MULTICHAIN_CONFIG;
}

/** Paseo (Polkadot Hub testnet) chain ID. Private balance page uses Polkadot subgraph when on this network. */
const PASEO_CHAIN_ID = 420420417;

/**
 * Subgraph URL for the announcement indexer (e.g. The Graph).
 * Used by the private balance page via useScanner: when the network is Polkadot (Paseo, chainId 420420417),
 * returns VITE_POLKADOT_SUBGRAPH_URL; otherwise VITE_SUBGRAPH_URL. When set, scanner uses indexer first
 * and falls back to chunked RPC on failure.
 */
export function getSubgraphUrl(chainId: number | null | undefined): string | null {

  console.log("chainId", chainId);
  console.log("VITE_POLKADOT_SUBGRAPH_URL", import.meta.env.VITE_POLKADOT_SUBGRAPH_URL);
  console.log("VITE_SUBGRAPH_URL", import.meta.env.VITE_SUBGRAPH_URL);
  if (chainId == null) return null;
  const isPolkadotNetwork = chainId === PASEO_CHAIN_ID;
  const polkadotSubgraphUrl = isPolkadotNetwork
    ? (import.meta.env.VITE_POLKADOT_SUBGRAPH_URL as string | undefined)
    : undefined;
  if (isPolkadotNetwork && (!polkadotSubgraphUrl || !String(polkadotSubgraphUrl).trim())) {
    console.warn(
      "[Opaque] Polkadot network detected but VITE_POLKADOT_SUBGRAPH_URL is not set. Set it in .env to use the indexer on the private balance page."
    );
  }
  const fromEnv = (polkadotSubgraphUrl ?? import.meta.env.VITE_SUBGRAPH_URL) as string | undefined;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  return null;
}
