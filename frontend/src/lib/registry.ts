/**
 * StealthMetaAddressRegistry — resolve meta-address by standard ETH address and check registration.
 * Uses chain-specific registry address from contract-config.
 */

import { createPublicClient, http, getAddress, type Address, type Hex } from "viem";
import { getChain, getRpcUrl } from "./chain";
import { SCHEME_ID_SECP256K1 } from "./contracts";
import { getConfigForChain } from "../contracts/contract-config";

const STEALTH_REGISTRY_ABI = [
  {
    type: "function",
    name: "stealthMetaAddressOf",
    inputs: [
      { name: "registrant", type: "address", internalType: "address" },
      { name: "schemeId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "registerKeys",
    inputs: [
      { name: "schemeId", type: "uint256", internalType: "uint256" },
      { name: "stealthMetaAddress", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/**
 * Resolves a standard Ethereum address to its 66-byte stealth meta-address via the Registry.
 *
 * @param address - Standard 42-char ETH address (0x + 40 hex)
 * @param chainId - Chain id for registry contract (e.g. from useWallet().chainId)
 * @returns The 66-byte stealth meta-address as hex, or null if not registered / invalid / unsupported chain
 */
export async function resolveMetaAddress(
  address: string,
  chainId: number | null
): Promise<Hex | null> {
  if (chainId == null) return null;
  const config = getConfigForChain(chainId);
  if (!config) return null;
  const chain = getChain(chainId);
  const rpcUrl = getRpcUrl(chain);
  if (!rpcUrl) return null;
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  const normalized = getAddress(address.trim());
  const bytes = await client.readContract({
    address: config.registry,
    abi: STEALTH_REGISTRY_ABI,
    functionName: "stealthMetaAddressOf",
    args: [normalized, SCHEME_ID_SECP256K1],
  });
  if (!bytes || typeof bytes !== "string") return null;
  const hex = bytes as Hex;
  if (hex.length !== 2 + 66 * 2) return null;
  return hex;
}

/**
 * Returns whether the given address has a stealth meta-address registered on the given chain.
 */
export async function isRegistered(
  address: string,
  chainId: number | null
): Promise<boolean> {
  if (chainId == null) return false;
  const meta = await resolveMetaAddress(address, chainId);
  return meta != null && meta.length === 2 + 66 * 2;
}

/**
 * Registry address for a chain. Use for registration tx; null if chain not supported.
 */
export function getRegistryAddress(chainId: number | null): Address | null {
  const config = getConfigForChain(chainId);
  return config?.registry ?? null;
}

export { STEALTH_REGISTRY_ABI };
