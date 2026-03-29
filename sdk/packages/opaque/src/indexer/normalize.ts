import type { Hex } from "viem";
import type { AnnouncementJsonRecord } from "@opaquecash/stealth-core";
import type { IndexerAnnouncement } from "../types/indexer.js";

function hexToBytes(h: Hex): number[] {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 2) {
    out.push(Number.parseInt(s.slice(i, i + 2), 16));
  }
  return out;
}

/**
 * Map a subgraph/indexer row into the JSON record expected by `scan_attestations_wasm`.
 */
export function indexerAnnouncementToScannerRecord(
  row: IndexerAnnouncement,
): AnnouncementJsonRecord {
  const bn = Number.parseInt(row.blockNumber, 10);
  if (!Number.isFinite(bn)) {
    throw new Error(
      `Invalid blockNumber on announcement ${row.transactionHash}: ${row.blockNumber}`,
    );
  }
  return {
    stealthAddress: row.stealthAddress,
    viewTag: row.viewTag,
    ephemeralPubKey: hexToBytes(row.etherealPublicKey),
    metadata: hexToBytes(row.metadata),
    txHash: row.transactionHash,
    blockNumber: bn,
  };
}

/**
 * Batch-normalize indexer rows for WASM or playground inspection.
 */
export function indexerAnnouncementsToScannerJson(
  rows: IndexerAnnouncement[],
): string {
  return JSON.stringify(rows.map(indexerAnnouncementToScannerRecord));
}
