/**
 * OpaqueCache — IndexedDB persistence for announcement logs and per-chain sync state.
 * Database: OpaqueCache
 * Stores: announcements (indexed by chainId, blockNumber), syncState (keyed by chainId)
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type CachedAnnouncement = {
  id: string;
  chainId: number;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  args: {
    stealthAddress?: string;
    ephemeralPubKey?: string;
    metadata?: string;
  };
};

export type SyncState = {
  chainId: number;
  lastScannedBlock: number;
};

interface OpaqueCacheDBSchema extends DBSchema {
  announcements: {
    key: string;
    value: CachedAnnouncement;
    indexes: { "by-chain": number; "by-block": number; "by-chain-block": [number, number] };
  };
  syncState: {
    key: number;
    value: SyncState;
  };
}

const DB_NAME = "OpaqueCache";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OpaqueCacheDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<OpaqueCacheDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OpaqueCacheDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("announcements")) {
          const announcements = db.createObjectStore("announcements", { keyPath: "id" });
          announcements.createIndex("by-chain", "chainId");
          announcements.createIndex("by-block", "blockNumber");
          announcements.createIndex("by-chain-block", ["chainId", "blockNumber"]);
        }
        if (!db.objectStoreNames.contains("syncState")) {
          db.createObjectStore("syncState", { keyPath: "chainId" });
        }
      },
    });
  }
  return dbPromise;
}

/** Generate unique id for an announcement log (chainId + txHash + logIndex) */
export function announcementId(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}-${txHash}-${logIndex}`;
}

/** Save announcement logs to the cache for a chain */
export async function putAnnouncements(
  chainId: number,
  logs: Array<{
    transactionHash?: string | null;
    logIndex?: number | null;
    blockNumber?: bigint | null;
    args?: { stealthAddress?: string; ephemeralPubKey?: string; metadata?: string };
  }>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("announcements", "readwrite");
  for (const log of logs) {
    const blockNumber = log.blockNumber != null ? Number(log.blockNumber) : 0;
    const id = announcementId(
      chainId,
      log.transactionHash ?? "",
      log.logIndex ?? 0
    );
    await tx.store.put({
      id,
      chainId,
      blockNumber,
      transactionHash: log.transactionHash ?? "",
      logIndex: log.logIndex ?? 0,
      args: log.args ?? {},
    });
  }
  await tx.done;
}

/** Get all cached announcements for a chain, sorted by blockNumber */
export async function getAnnouncementsForChain(chainId: number): Promise<CachedAnnouncement[]> {
  const db = await getDB();
  const index = db.transaction("announcements").store.index("by-chain-block");
  const range = IDBKeyRange.bound([chainId, 0], [chainId, Number.MAX_SAFE_INTEGER]);
  const all = await index.getAll(range);
  return all.sort((a, b) => a.blockNumber - b.blockNumber);
}

/** Get the maximum block number in the announcements cache for a chain */
export async function getMaxBlockForChain(chainId: number): Promise<number | null> {
  const db = await getDB();
  const index = db.transaction("announcements").store.index("by-chain");
  const all = await index.getAll(chainId);
  if (all.length === 0) return null;
  return Math.max(...all.map((a) => a.blockNumber));
}

/** Get sync state for a chain (lastScannedBlock) */
export async function getSyncState(chainId: number): Promise<SyncState | null> {
  const db = await getDB();
  const state = await db.get("syncState", chainId);
  return state ?? null;
}

/** Set sync state for a chain */
export async function setSyncState(chainId: number, lastScannedBlock: number): Promise<void> {
  const db = await getDB();
  await db.put("syncState", { chainId, lastScannedBlock });
}

/** Clear only sync state for a chain (e.g. when lastScannedBlock is ahead of chain head) */
export async function clearSyncState(chainId: number): Promise<void> {
  const db = await getDB();
  await db.delete("syncState", chainId);
}

/** Clear all cached announcements and sync state for a chain (e.g. Retry Sync) */
export async function clearChainCache(chainId: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("announcements", "readwrite");
  const index = tx.store.index("by-chain");
  const keys = await index.getAllKeys(chainId);
  for (const key of keys) await tx.store.delete(key);
  await tx.done;
  await db.delete("syncState", chainId);
}

/** Count cached announcements for a chain (for progress / empty check) */
export async function getAnnouncementCountForChain(chainId: number): Promise<number> {
  const db = await getDB();
  const index = db.transaction("announcements").store.index("by-chain");
  return index.count(chainId);
}
