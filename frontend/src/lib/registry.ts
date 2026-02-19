/**
 * StealthMetaAddressRegistry — resolve meta-address by standard ETH address and check registration.
 *
 * WHERE THE REGISTRY IS USED:
 * - Lookup (read): In this file, resolveMetaAddress() and isRegistered() call the Registry contract's
 *   stealthMetaAddressOf(registrant, schemeId) via a viem public client (RPC read). The contract
 *   stores a mapping from (address, schemeId) → 66-byte stealth meta-address.
 * - Registration (write): Not in this file. RegistrationView.tsx encodes registerKeys(schemeId, stealthMetaAddress)
 *   and sends a transaction to REGISTRY_ADDRESS so the user's wallet signs and submits the write.
 * - Send flow: SendView.tsx uses resolveMetaAddress() in a useEffect when the user enters a 42-char
 *   ETH address; the resolved 66-byte meta-address is then used to compute the one-time stealth address.
 */

import { createPublicClient, http, getAddress, type Address, type Hex } from "viem";
import { getAppChain } from "./chain";
import { SCHEME_ID_SECP256K1 } from "./contracts";
import { deployedAddresses } from "../contracts/deployedAddresses";

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

const REGISTRY_ADDRESS = deployedAddresses.StealthMetaAddressRegistry as Address;

function getPublicClient() {
  return createPublicClient({
    chain: getAppChain(),
    transport: http(),
  });
}

/**
 * Resolves a standard Ethereum address to its 66-byte stealth meta-address via the Registry.
 * Calls stealthMetaAddressOf(registrant, schemeId) on the Registry contract.
 *
 * @param address - Standard 42-char ETH address (0x + 40 hex)
 * @returns The 66-byte stealth meta-address as hex, or null if not registered / invalid
 */
export async function resolveMetaAddress(address: string): Promise<Hex | null> {
  const normalized = getAddress(address.trim());
  const client = getPublicClient();
  const bytes = await client.readContract({
    address: REGISTRY_ADDRESS,
    abi: STEALTH_REGISTRY_ABI,
    functionName: "stealthMetaAddressOf",
    args: [normalized, SCHEME_ID_SECP256K1],
  });
  if (!bytes || typeof bytes !== "string") return null;
  const hex = bytes as Hex;
  // 66 bytes = 132 hex chars + "0x"
  if (hex.length !== 2 + 66 * 2) return null;
  return hex;
}

/**
 * Returns whether the given address has a stealth meta-address registered.
 */
export async function isRegistered(address: string): Promise<boolean> {
  const meta = await resolveMetaAddress(address);
  return meta != null && meta.length === 2 + 66 * 2;
}

export { REGISTRY_ADDRESS, STEALTH_REGISTRY_ABI };
