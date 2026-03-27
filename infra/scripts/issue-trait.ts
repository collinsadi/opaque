/**
 * Issue a stealth attestation trait to a recipient.
 *
 * Calls StealthAddressAnnouncer.announce() with attestation metadata
 * encoded as [viewTag, 0xA7, ...attestation_id (8 bytes BE)].
 *
 * Usage:
 *   cd infra && tsx scripts/issue-trait.ts \
 *     --to <stealth-meta-address-hex> \
 *     --trait-id <attestation_id_number> \
 *     [--network sepolia]
 *
 * Example:
 *   tsx scripts/issue-trait.ts --to 0x02abc...def --trait-id 2
 */

import { ethers } from "ethers";
import * as crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const ANNOUNCER_ABI = [
  "function announce(uint256 schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata) external",
];

const SCHEME_ID = 1; // secp256k1
const ATTESTATION_MARKER = 0xa7;

function parseArgs() {
  const args = process.argv.slice(2);
  let metaAddress = "";
  let traitId = 0;
  let network = "sepolia";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--to" && args[i + 1]) metaAddress = args[++i];
    else if (args[i] === "--trait-id" && args[i + 1]) traitId = parseInt(args[++i], 10);
    else if (args[i] === "--network" && args[i + 1]) network = args[++i];
  }

  if (!metaAddress || !traitId) {
    console.error("Usage: tsx scripts/issue-trait.ts --to <stealth-meta-address-hex> --trait-id <number>");
    process.exit(1);
  }

  return { metaAddress, traitId, network };
}

function encodeAttestationMetadata(viewTag: number, attestationId: number): Uint8Array {
  const buf = new Uint8Array(10);
  buf[0] = viewTag;
  buf[1] = ATTESTATION_MARKER;
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64BE(BigInt(attestationId));
  buf.set(idBuf, 2);
  return buf;
}

/**
 * Minimal stealth address derivation (secp256k1 DKSAP) using ethers.
 * Mirrors the Rust/TS implementation but using ethers' SigningKey.
 */
function deriveStealthAddress(metaAddressHex: string) {
  const raw = metaAddressHex.startsWith("0x") ? metaAddressHex.slice(2) : metaAddressHex;
  const bytes = Buffer.from(raw, "hex");
  if (bytes.length < 66) throw new Error("Meta-address must be 66 bytes (compressed V || S)");

  const viewPubKeyBytes = bytes.subarray(0, 33);
  const spendPubKeyBytes = bytes.subarray(33, 66);

  const viewPubKey = ethers.SigningKey.computePublicKey(viewPubKeyBytes, false);
  const spendPubKey = ethers.SigningKey.computePublicKey(spendPubKeyBytes, false);

  // Generate ephemeral key pair
  const ephemeralPriv = crypto.randomBytes(32);
  const ephemeralSigningKey = new ethers.SigningKey(ephemeralPriv);
  const ephemeralPubKey = ephemeralSigningKey.compressedPublicKey;

  // ECDH: shared secret = ephemeral_priv * view_pub
  const sharedSecretPoint = ephemeralSigningKey.computeSharedSecret(viewPubKey);
  // Compress the shared secret point
  const sharedCompressed = ethers.SigningKey.computePublicKey(sharedSecretPoint, true);

  // s_h = keccak256(shared_secret_compressed)
  const sH = ethers.keccak256(sharedCompressed);
  const viewTag = parseInt(sH.slice(2, 4), 16);

  // S_h = s_h * G
  const sHSigningKey = new ethers.SigningKey(sH);
  const sHPubKey = sHSigningKey.publicKey; // uncompressed 0x04...

  // P_stealth = P_spend + S_h (point addition via adding uncompressed keys)
  const spendPoint = ethers.SigningKey.computePublicKey(spendPubKeyBytes, false);
  const sHPoint = sHPubKey;

  // ethers doesn't have point addition directly, so derive the address
  // by computing: stealth_address = keccak256(P_stealth_uncompressed[1:])[12:]
  // We need to add the two points. Use the addPoints helper:
  const stealthPubKey = addPoints(spendPoint, sHPoint);
  const stealthUncompressed = stealthPubKey.startsWith("0x04") ? stealthPubKey : "0x04" + stealthPubKey.slice(2);
  const addrHash = ethers.keccak256("0x" + stealthUncompressed.slice(4)); // skip 0x04
  const stealthAddress = ethers.getAddress("0x" + addrHash.slice(26));

  return {
    stealthAddress,
    ephemeralPubKey,
    viewTag,
  };
}

function addPoints(pubKey1: string, pubKey2: string): string {
  // Decompress both to get x,y coordinates, then add on secp256k1
  // Use a simpler approach: since ethers v6 doesn't expose raw EC point addition,
  // we use the fact that we can recover the stealth address via the contract's announce
  // and the scanner will derive it correctly.
  // For this script, we use a hex-math approach with the secp256k1 curve.

  // Actually, ethers.SigningKey does not support point addition.
  // Instead, use the wallet-based approach: compute stealth address the same way
  // the Rust code does, using scalar arithmetic.

  // Fallback: use @noble/curves if available, otherwise just use ethers'
  // computeSharedSecret trick.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { secp256k1 } = require("@noble/curves/secp256k1");
    const p1 = secp256k1.ProjectivePoint.fromHex(pubKey1.startsWith("0x") ? pubKey1.slice(2) : pubKey1);
    const p2 = secp256k1.ProjectivePoint.fromHex(pubKey2.startsWith("0x") ? pubKey2.slice(2) : pubKey2);
    const sum = p1.add(p2);
    return "0x" + sum.toHex(false);
  } catch {
    throw new Error(
      "Point addition requires @noble/curves. Install: npm i @noble/curves"
    );
  }
}

async function main() {
  const { metaAddress, traitId, network } = parseArgs();

  const rpcUrl = network === "sepolia"
    ? process.env.SEPOLIA_RPC_URL
    : "http://127.0.0.1:8545";
  if (!rpcUrl) throw new Error(`Set ${network.toUpperCase()}_RPC_URL in .env`);

  const privateKey = network === "sepolia"
    ? process.env.SEPOLIA_PRIVATE_KEY
    : process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("Set deployer private key in .env");

  const announcerAddress = network === "sepolia"
    ? "0x840f72249A8bF6F10b0eB64412E315efBD730865"
    : process.env.ANNOUNCER_ADDRESS;
  if (!announcerAddress) throw new Error("Set ANNOUNCER_ADDRESS in .env for non-sepolia");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const announcer = new ethers.Contract(announcerAddress, ANNOUNCER_ABI, signer);

  console.log(`Issuing trait ${traitId} to meta-address ${metaAddress.slice(0, 20)}...`);
  console.log(`Network: ${network}, Announcer: ${announcerAddress}`);

  // Derive stealth address for the recipient
  const { stealthAddress, ephemeralPubKey, viewTag } = deriveStealthAddress(metaAddress);

  console.log(`  Stealth address: ${stealthAddress}`);
  console.log(`  View tag: ${viewTag}`);
  console.log(`  Ephemeral pubkey: ${ephemeralPubKey.slice(0, 20)}...`);

  // Encode attestation metadata
  const metadata = encodeAttestationMetadata(viewTag, traitId);
  const metadataHex = "0x" + Buffer.from(metadata).toString("hex");

  console.log(`  Metadata: ${metadataHex}`);
  console.log(`\nSending announce() transaction...`);

  const tx = await announcer.announce(
    SCHEME_ID,
    stealthAddress,
    ephemeralPubKey,
    metadataHex,
  );

  console.log(`  TX hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  Confirmed in block: ${receipt.blockNumber}`);
  console.log(`\nTrait ${traitId} issued successfully!`);
  console.log(`The recipient's scanner will discover this attestation on next scan.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
