/**
 * ENS resolution for Sub-ENS names (e.g. alice.opaque.eth).
 * Resolves name → controller address, then caller can resolve meta-address via registry.
 */

import { createPublicClient, http, getAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import { getChain } from "./chain";

/**
 * Resolve an ENS name (e.g. "alice.opaque.eth") to the controller's Ethereum address.
 * Returns null if the name doesn't exist or doesn't resolve to an address.
 */
export async function resolveEnsToAddress(
  ensName: string,
  chainId: number
): Promise<Address | null> {
  const chain = getChain(chainId);
  const rpcUrl = chain.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) return null;
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  try {
    const normalizedName = normalize(ensName.trim());
    const address = await client.getEnsAddress({ name: normalizedName });
    if (!address) return null;
    return getAddress(address);
  } catch {
    return null;
  }
}

/**
 * Check if an identifier looks like an ENS name (ends with .eth).
 */
export function isEnsName(identifier: string): boolean {
  const t = identifier.trim().toLowerCase();
  return t.endsWith(".eth") && t.length > 4;
}
