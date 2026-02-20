/**
 * Subgraph mapping: persist only the raw hex data needed for stealth derivation.
 * - id: unique per log (txHash-logIndex)
 * - etherealPublicKey, viewTag, metadata: used by WASM for view-tag check and key derivation
 * - blockNumber, timestamp: ordering and sync
 * - transactionHash, logIndex, stealthAddress: for client cache key and full check
 */
import { Bytes } from "@graphprotocol/graph-ts";
import { Announcement as AnnouncementEvent } from "../generated/StealthAddressAnnouncer/StealthAddressAnnouncer";
import { Announcement } from "../generated/schema";

export function handleAnnouncement(event: AnnouncementEvent): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const entity = new Announcement(id);

  const metadata = event.params.metadata;
  entity.etherealPublicKey = event.params.ephemeralPubKey;
  entity.metadata = metadata;
  entity.viewTag = metadata.length > 0 ? metadata[0] : 0;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.logIndex = event.logIndex.toI32();
  entity.stealthAddress = Bytes.fromHexString(event.params.stealthAddress.toHexString());

  entity.save();
}
