/**
 * Modular contract config for Opaque Cash frontend.
 * Uses addresses from deployedAddresses.ts and ABIs from abis/.
 */

import { Contract, type InterfaceAbi, type Provider, type Signer } from "ethers";
import { deployedAddresses } from "./deployedAddresses";

import StealthAddressAnnouncerAbi from "./abis/StealthAddressAnnouncer.json";
import StealthMetaAddressRegistryAbi from "./abis/StealthMetaAddressRegistry.json";

export type OpaqueContractName = "StealthAddressAnnouncer" | "StealthMetaAddressRegistry";

const abis: Record<OpaqueContractName, InterfaceAbi> = {
  StealthAddressAnnouncer: StealthAddressAnnouncerAbi as unknown as InterfaceAbi,
  StealthMetaAddressRegistry: StealthMetaAddressRegistryAbi as unknown as InterfaceAbi,
};

function getAddress(contractName: OpaqueContractName): string {
  switch (contractName) {
    case "StealthAddressAnnouncer":
      return deployedAddresses.StealthAddressAnnouncer;
    case "StealthMetaAddressRegistry":
      return deployedAddresses.StealthMetaAddressRegistry;
    default:
      throw new Error(`Unknown contract: ${contractName}`);
  }
}

/**
 * Returns a typed Ethers.js Contract instance for the given Opaque contract.
 * Uses addresses from the auto-generated deployedAddresses.ts and ABIs from abis/.
 *
 * @param contractName - "StealthAddressAnnouncer" | "StealthMetaAddressRegistry"
 * @param providerOrSigner - Ethers provider or signer (e.g. from wagmi/ethers)
 * @returns Contract instance
 */
export function getOpaqueContract(
  contractName: OpaqueContractName,
  providerOrSigner: Provider | Signer
): Contract {
  const address = getAddress(contractName);
  const abi = abis[contractName];
  return new Contract(address, abi, providerOrSigner);
}

export { deployedAddresses };
