/**
 * Subgraph mapping: index Announcement events into the Announcement entity.
 * Only stores raw hex data needed for stealth derivation (ephemeralPubKey, viewTag, metadata).
 */

import { Bytes } from "@graphprotocol/graph-ts";
import { Announcement as AnnouncementEvent } from "../generated/StealthAddressAnnouncer/StealthAddressAnnouncer";
import { Announcement } from "../generated/schema";

function viewTagFromMetadata(metadata: Bytes): i32 {
  const hex = metadata.toHexString();
  if (hex.length >= 4) return parseInt(hex.substring(2, 4), 16) as i32;
  return 0;
}

export function handleAnnouncement(event: AnnouncementEvent): void {
  const txHash = event.transaction.hash.toHex();
  const logIndex = event.logIndex.toI32();
  const id = txHash + "-" + logIndex.toString();

  const entity = new Announcement(id);
  entity.transactionHash = event.transaction.hash;
  entity.logIndex = logIndex;
  entity.etherealPublicKey = event.params.ephemeralPubKey;
  entity.metadata = event.params.metadata;
  entity.viewTag = viewTagFromMetadata(event.params.metadata);
  entity.blockNumber = event.block.number.toI32();
  entity.timestamp = event.block.timestamp;
  entity.stealthAddress = event.params.stealthAddress;

  entity.save();
}
