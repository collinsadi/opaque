/**
 * Contract ABIs and addresses for Opaque Cash (EIP-5564 Announcer).
 */

export const STEALTH_ANNOUNCER_ABI = [
  {
    type: "function",
    name: "announce",
    inputs: [
      { name: "schemeId", type: "uint256", internalType: "uint256" },
      { name: "stealthAddress", type: "address", internalType: "address" },
      { name: "ephemeralPubKey", type: "bytes", internalType: "bytes" },
      { name: "metadata", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Announcement",
    inputs: [
      { name: "schemeId", type: "uint256", indexed: true },
      { name: "stealthAddress", type: "address", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "ephemeralPubKey", type: "bytes", indexed: false },
      { name: "metadata", type: "bytes", indexed: false },
    ],
  },
] as const;

/** ERC-5564 schemeId for secp256k1 with view tags */
export const SCHEME_ID_SECP256K1 = 1n;

/** Default announcer address; replace per chain. */
export const DEFAULT_ANNOUNCER_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;
