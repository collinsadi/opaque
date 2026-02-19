/**
 * Opaque Cash — Client-side stealth address crypto (EIP-5564 / DKSAP)
 * Uses @noble/curves secp256k1; compatible with Rust scanner.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import type { Hex } from "viem";
import { getAddress, type Address } from "viem";

const CURVE = secp256k1;
const DOMAIN = "opaque-cash-v1";

// -----------------------------------------------------------------------------
// Key derivation from wallet signature (entropy)
// -----------------------------------------------------------------------------

/**
 * Derive viewing key (v) and spending key (s) from a signature used as entropy.
 * Uses HKDF to expand the signature bytes into two 32-byte private keys.
 */
export function deriveKeysFromSignature(signatureHex: Hex): {
  viewingKey: Uint8Array;
  spendingKey: Uint8Array;
} {
  console.log("🔐 [Opaque] deriveKeysFromSignature");
  const sigBytes =
    typeof signatureHex === "string"
      ? (signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex)
      : signatureHex;
  const sig = typeof sigBytes === "string" ? hexToBytes(sigBytes) : sigBytes;
  const okm = hkdf(sha256, sig, undefined, DOMAIN, 64);
  const viewingKey = okm.slice(0, 32);
  const spendingKey = okm.slice(32, 64);
  console.log("🔐 [Opaque] Keys derived from signature ✅");
  return { viewingKey, spendingKey };
}

/**
 * Get viewing public key V and spending public key S from private keys.
 * Stealth meta-address = compressed(V) || compressed(S) per EIP-5564.
 */
export function keysToStealthMetaAddress(
  viewingKey: Uint8Array,
  spendingKey: Uint8Array
): { V: Uint8Array; S: Uint8Array; metaAddress: Uint8Array } {
  const V = CURVE.getPublicKey(viewingKey, true);
  const S = CURVE.getPublicKey(spendingKey, true);
  const metaAddress = new Uint8Array(V.length + S.length);
  metaAddress.set(V, 0);
  metaAddress.set(S, V.length);
  return { V, S, metaAddress };
}

/**
 * Encode stealth meta-address as hex (0x-prefixed).
 */
export function stealthMetaAddressToHex(metaAddress: Uint8Array): Hex {
  return ("0x" + bytesToHex(metaAddress)) as Hex;
}

/**
 * Parse recipient stealth meta-address: first 33 bytes = viewing pubkey, next 33 = spending pubkey.
 */
export function parseStealthMetaAddress(metaHex: Hex): {
  viewPubKey: Uint8Array;
  spendPubKey: Uint8Array;
} {
  const raw =
    typeof metaHex === "string" && metaHex.startsWith("0x")
      ? metaHex.slice(2)
      : metaHex;
  const bytes = hexToBytes(raw);
  if (bytes.length < 66)
    throw new Error("Invalid stealth meta-address: expected 66 bytes");
  return {
    viewPubKey: bytes.slice(0, 33),
    spendPubKey: bytes.slice(33, 66),
  };
}

// -----------------------------------------------------------------------------
// Sender: derive stealth address and view tag (DKSAP)
// -----------------------------------------------------------------------------

/**
 * Shared secret from sender side: s = r * P_view (ephemeral priv * viewing pub).
 * Encoded as compressed point (33 bytes) then hashed with Keccak-256 per EIP-5564.
 */
function sharedSecretSender(
  ephemeralPriv: Uint8Array,
  viewPubKey: Uint8Array
): Uint8Array {
  const P = CURVE.ProjectivePoint.fromHex(viewPubKey);
  const scalar = bytesToBigInt(ephemeralPriv) % CURVE.CURVE.n;
  if (scalar === 0n) throw new Error("Invalid ephemeral key");
  const sharedPoint = P.multiply(scalar);
  return sharedPoint.toRawBytes(true);
}

/**
 * s_h = Keccak256(shared_secret); viewTag = s_h[0].
 */
function hashSharedSecret(sharedSecret: Uint8Array): {
  sH: Uint8Array;
  viewTag: number;
} {
  const sH = keccak_256(sharedSecret);
  const viewTag = sH[0];
  return { sH, viewTag };
}

/**
 * Reduce s_h mod n to get scalar; S_h = s_h * G; P_stealth = P_spend + S_h.
 * Address = last 20 bytes of Keccak256(uncompressed(P_stealth)).
 */
function stealthPointAndAddress(
  spendPubKey: Uint8Array,
  sH: Uint8Array
): { stealthAddress: Address } {
  const n = CURVE.CURVE.n;
  const sHBig = bytesToBigInt(sH);
  const sHMod = sHBig % n;
  if (sHMod === 0n) throw new Error("Invalid scalar from hash");
  const S_h = CURVE.ProjectivePoint.BASE.multiply(sHMod);
  const P_spend = CURVE.ProjectivePoint.fromHex(spendPubKey);
  const P_stealth = P_spend.add(S_h);
  const uncompressed = P_stealth.toRawBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  const addr = getAddress(("0x" + bytesToHex(hash.slice(12))) as Hex);
  return { stealthAddress: addr };
}

/**
 * Generate ephemeral keypair (r, R), compute stealth address P and view tag.
 * Returns everything needed to call the Announcer and send funds to P.
 */
export function computeStealthAddressAndViewTag(
  recipientMetaAddressHex: Hex
): {
  ephemeralPriv: Uint8Array;
  ephemeralPubKey: Uint8Array;
  stealthAddress: Address;
  viewTag: number;
  metadata: Uint8Array;
} {
  console.log("🔐 [Opaque] computeStealthAddressAndViewTag", { recipientMeta: recipientMetaAddressHex.slice(0, 20) + "…" });
  const { viewPubKey, spendPubKey } = parseStealthMetaAddress(
    recipientMetaAddressHex
  );
  const ephemeralPriv = CURVE.utils.randomPrivateKey();
  const ephemeralPubKey = CURVE.getPublicKey(ephemeralPriv, true);

  const shared = sharedSecretSender(ephemeralPriv, viewPubKey);
  const { sH, viewTag } = hashSharedSecret(shared);
  const { stealthAddress } = stealthPointAndAddress(spendPubKey, sH);

  const metadata = new Uint8Array(1);
  metadata[0] = viewTag;

  console.log("🔐 [Opaque] Stealth address computed ✅", { stealth: stealthAddress.slice(0, 14) + "…", viewTag });
  return {
    ephemeralPriv,
    ephemeralPubKey,
    stealthAddress,
    viewTag,
    metadata,
  };
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2) throw new Error("Invalid hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBigInt(b: Uint8Array): bigint {
  let x = 0n;
  for (let i = 0; i < b.length; i++) x = (x << 8n) | BigInt(b[i]);
  return x;
}

export { getAddress };
export type { Address, Hex };
