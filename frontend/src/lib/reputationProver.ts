/**
 * Reputation prover — orchestrates witness generation (WASM) and
 * ZK proof generation (snarkjs) for stealth attestations.
 *
 * Also provides the on-chain submit helper that calls
 * OpaqueReputationVerifier.verifyReputation().
 */

import type { OpaqueWasmModule } from "../hooks/useOpaqueWasm";
import type { ProofData, DiscoveredTrait } from "./reputation";
import { reputationAddresses } from "../contracts/reputationAddresses";
import { createPublicClient, createWalletClient, custom, http, toHex, type Address, type EIP1193Provider } from "viem";
import { sepolia } from "viem/chains";
// @ts-expect-error snarkjs has no bundled types
import * as snarkjs from "snarkjs";

// circomlibjs pulls deps that expect Node's global Buffer.
// We avoid importing Node's "buffer" builtin directly (Vite externalizes it).

const CIRCUIT_WASM_PATH = "/circuits/stealth_attestation_js/stealth_attestation.wasm";
const ZKEY_PATH = "/circuits/sa_final.zkey";
const TREE_DEPTH = 20;

export type ProofProgressCallback = (stage: string, percent: number) => void;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) + BigInt(b);
  return result;
}

async function buildCircuitConsistentWitness(
  traitAttestationId: number,
  stealthPrivKeyBytes: Uint8Array,
  externalNullifier: string,
) {
  if (typeof globalThis !== "undefined" && !("Buffer" in globalThis)) {
    const bufferPkg = await import("buffer/index.js");
    (globalThis as { Buffer?: typeof bufferPkg.Buffer }).Buffer = bufferPkg.Buffer;
  }
  const circomlib = await import("circomlibjs");
  const poseidon = await circomlib.buildPoseidon();
  const babyjub = await circomlib.buildBabyjub();
  const F = poseidon.F;

  const attestationId = BigInt(traitAttestationId);
  const extNullifier = BigInt(externalNullifier);

  const stealthPriv = F.toObject(F.e(bytesToBigInt(stealthPrivKeyBytes)));
  const ephemeralPriv = F.toObject(F.e(stealthPriv + extNullifier + 1n));
  const stealthPub = babyjub.mulPointEscalar(babyjub.Base8, stealthPriv);
  const ephemeralPub = babyjub.mulPointEscalar(babyjub.Base8, ephemeralPriv);
  const sharedSecret = babyjub.mulPointEscalar(ephemeralPub, stealthPriv);

  const stealthPubX = F.toObject(stealthPub[0]);
  const stealthPubY = F.toObject(stealthPub[1]);
  const ephemeralPubX = F.toObject(ephemeralPub[0]);
  const ephemeralPubY = F.toObject(ephemeralPub[1]);
  const sharedX = F.toObject(sharedSecret[0]);
  const sharedY = F.toObject(sharedSecret[1]);

  const addressCommitment = F.toObject(poseidon([sharedX, sharedY, stealthPubX, stealthPubY]));
  const leaf = F.toObject(poseidon([addressCommitment, attestationId]));

  const zeroHashes: bigint[] = [];
  zeroHashes.push(F.toObject(poseidon([0n, 0n])));
  for (let i = 1; i < TREE_DEPTH; i++) {
    zeroHashes.push(F.toObject(poseidon([zeroHashes[i - 1], zeroHashes[i - 1]])));
  }

  const merklePathElements: string[] = [];
  const merklePathIndices: number[] = [];
  let current = leaf;
  for (let i = 0; i < TREE_DEPTH; i++) {
    merklePathElements.push(zeroHashes[i].toString());
    merklePathIndices.push(0);
    current = F.toObject(poseidon([current, zeroHashes[i]]));
  }

  return {
    merkle_root: current.toString(),
    attestation_id: attestationId.toString(),
    external_nullifier: extNullifier.toString(),
    stealth_private_key: stealthPriv.toString(),
    ephemeral_pubkey: [ephemeralPubX.toString(), ephemeralPubY.toString()],
    announcement_attestation_id: attestationId.toString(),
    merkle_path_elements: merklePathElements,
    merkle_path_indices: merklePathIndices,
  };
}

/**
 * Full proof generation pipeline:
 * 1. Generate witness via WASM
 * 2. Generate Groth16 proof via snarkjs
 */
export async function generateReputationProof(
  _wasm: OpaqueWasmModule,
  trait: DiscoveredTrait,
  _allAttestationsJson: string,
  stealthPrivKeyBytes: Uint8Array,
  externalNullifier: string,
  onProgress: ProofProgressCallback,
): Promise<ProofData> {
  // Phase 1: Witness generation via Rust WASM
  onProgress("preparing-witness", 10);

  const witness = await buildCircuitConsistentWitness(
    trait.attestationId,
    stealthPrivKeyBytes,
    externalNullifier
  );

  onProgress("preparing-witness", 70);

  // Phase 2: Groth16 proof via snarkjs
  onProgress("generating-proof", 75);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    witness,
    CIRCUIT_WASM_PATH,
    ZKEY_PATH,
  );

  onProgress("generating-proof", 95);

  const nullifier = publicSignals[0];
  const attestationIdFromProof = Number(publicSignals[3]);
  const isValidSignal = String(publicSignals[1] ?? "0");

  if (isValidSignal !== "1") {
    console.error("❌ [Opaque] Generated proof has is_valid=0. Circuit checks failed.", {
      traitId: trait.attestationId,
      publicSignals,
      witness,
    });
    throw new Error(
      "Generated proof is invalid (is_valid=0). This usually means witness data does not match circuit expectations. Rescan traits and regenerate."
    );
  }

  return {
    proof: {
      pi_a: proof.pi_a.slice(0, 2),
      pi_b: proof.pi_b.slice(0, 2),
      pi_c: proof.pi_c.slice(0, 2),
    },
    publicSignals,
    nullifier,
    attestationId: Number.isFinite(attestationIdFromProof) ? attestationIdFromProof : trait.attestationId,
  };
}

// =============================================================================
// On-chain submission
// =============================================================================

const REPUTATION_VERIFIER_ABI = [
  { type: "error", name: "InvalidProof", inputs: [] },
  { type: "error", name: "NullifierAlreadyUsed", inputs: [] },
  { type: "error", name: "InvalidMerkleRoot", inputs: [] },
  { type: "error", name: "RootExpired", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  {
    type: "function",
    name: "isRootValid",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "verifyReputation",
    inputs: [
      {
        name: "proof",
        type: "tuple",
        components: [
          { name: "a", type: "uint256[2]" },
          { name: "b", type: "uint256[2][2]" },
          { name: "c", type: "uint256[2]" },
        ],
      },
      { name: "root", type: "bytes32" },
      { name: "attestationId", type: "uint256" },
      { name: "externalNullifier", type: "uint256" },
      { name: "nullifier", type: "uint256" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rootHistoryLength",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rootHistory",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

function normalizeRootToBytes32(root: string): `0x${string}` {
  try {
    // snarkjs public signals may be decimal strings; BigInt also accepts hex strings.
    return toHex(BigInt(root), { size: 32 });
  } catch {
    throw new Error(`Invalid merkle root format: "${root}"`);
  }
}

export async function fetchLatestValidMerkleRoot(): Promise<`0x${string}`> {
  const verifierAddress = reputationAddresses.OpaqueReputationVerifier as Address;
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  const rootHistoryLength = await publicClient.readContract({
    address: verifierAddress,
    abi: REPUTATION_VERIFIER_ABI,
    functionName: "rootHistoryLength",
  });

  const length = Number(rootHistoryLength);
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error("No Merkle roots found on verifier contract.");
  }

  for (let i = length - 1; i >= 0; i--) {
    const root = await publicClient.readContract({
      address: verifierAddress,
      abi: REPUTATION_VERIFIER_ABI,
      functionName: "rootHistory",
      args: [BigInt(i)],
    });
    const valid = await publicClient.readContract({
      address: verifierAddress,
      abi: REPUTATION_VERIFIER_ABI,
      functionName: "isRootValid",
      args: [root],
    });
    if (valid) return root;
  }

  throw new Error("No valid (non-expired) Merkle root found on verifier contract.");
}

/**
 * Submits a proof to the OpaqueReputationVerifier contract.
 * Returns the transaction hash on success.
 */
export async function submitProofOnChain(
  proofData: ProofData,
  merkleRoot: string,
  externalNullifier: string,
): Promise<string> {
  const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!ethereum) throw new Error("No wallet found");

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });
  const walletClient = createWalletClient({
    chain: sepolia,
    transport: custom(ethereum),
  });

  const [account] = await walletClient.requestAddresses();
  if (!account) throw new Error("No account connected");

  const verifierAddress = reputationAddresses.OpaqueReputationVerifier as Address;
  const normalizedMerkleRoot = normalizeRootToBytes32(merkleRoot);

  const isRootValid = await publicClient.readContract({
    address: verifierAddress,
    abi: REPUTATION_VERIFIER_ABI,
    functionName: "isRootValid",
    args: [normalizedMerkleRoot],
  });
  if (!isRootValid) {
    throw new Error(
      "Merkle root is not valid on-chain (missing or expired). Update root in OpaqueReputationVerifier and retry."
    );
  }

  const pi_a = proofData.proof.pi_a.map(BigInt) as [bigint, bigint];
  // snarkjs proof.pi_b must be flipped per pair for Solidity verifier calldata.
  const pi_b = proofData.proof.pi_b.map(
    (pair) => [BigInt(pair[1]), BigInt(pair[0])] as [bigint, bigint]
  ) as [[bigint, bigint], [bigint, bigint]];
  const pi_c = proofData.proof.pi_c.map(BigInt) as [bigint, bigint];

  await publicClient.simulateContract({
    address: verifierAddress,
    abi: REPUTATION_VERIFIER_ABI,
    functionName: "verifyReputation",
    args: [
      { a: pi_a, b: pi_b, c: pi_c },
      normalizedMerkleRoot,
      BigInt(proofData.attestationId),
      BigInt(externalNullifier),
      BigInt(proofData.nullifier),
    ],
    account,
  });

  const txHash = await walletClient.writeContract({
    address: verifierAddress,
    abi: REPUTATION_VERIFIER_ABI,
    functionName: "verifyReputation",
    args: [
      { a: pi_a, b: pi_b, c: pi_c },
      normalizedMerkleRoot,
      BigInt(proofData.attestationId),
      BigInt(externalNullifier),
      BigInt(proofData.nullifier),
    ],
    account,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return txHash;
}
