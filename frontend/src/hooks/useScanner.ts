/**
 * useScanner — IndexedDB-backed announcement scanner.
 * - Prefers Subgraph/GraphQL (latest 1000 announcements); falls back to chunked RPC getLogs on failure.
 * - Loads cached events first; incremental sync from lastScannedBlock when using RPC.
 * - Per-chain sync state; back-fill "Optimizing Vault... [%]" when cache empty (RPC path).
 * - WASM matching offloaded with requestIdleCallback to avoid UI lag.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { PublicClient } from "viem";
import { getConfigForChain, getSubgraphUrl } from "../contracts/contract-config";
import {
  getAnnouncementsForChain,
  getSyncState,
  setSyncState,
  putAnnouncements,
  clearChainCache,
  announcementId,
  type CachedAnnouncement,
} from "../lib/opaqueCache";
import { STEALTH_ANNOUNCER_ABI } from "../lib/contracts";

const SUBGRAPH_ANNOUNCEMENTS_LIMIT = 1000;

const ANNOUNCEMENTS_QUERY = `query GetAnnouncements($first: Int!, $orderBy: String!, $orderDirection: String!) {
  announcements(first: $first, orderBy: $orderBy, orderDirection: $orderDirection) {
    id
    blockNumber
    timestamp
    etherealPublicKey
    viewTag
    metadata
    stealthAddress
    logIndex
    transactionHash
  }
}`;

const INITIAL_CHUNK_SIZE = 50_000;
const MIN_CHUNK_SIZE = 500;

function isLimitExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const s = msg.toLowerCase();
  return (
    s.includes("limit") ||
    s.includes("exceeded") ||
    s.includes("range") ||
    s.includes("429") ||
    s.includes("too many")
  );
}

const ANNOUNCEMENT_EVENT = STEALTH_ANNOUNCER_ABI.find(
  (item): item is (typeof STEALTH_ANNOUNCER_ABI)[number] & { type: "event"; name: "Announcement" } =>
    item.type === "event" && item.name === "Announcement"
);
if (!ANNOUNCEMENT_EVENT) throw new Error("Announcement event not found in STEALTH_ANNOUNCER_ABI");

export type ScanProgress = {
  phase: "idle" | "loading-cache" | "indexer-fetch" | "indexer-fetched" | "syncing" | "backfilling" | "matching" | "done" | "error";
  /** 0–100 for backfilling/syncing */
  percent: number;
  message: string;
  fromBlock: bigint;
  toBlock: bigint;
  currentBlock: bigint;
  error: string | null;
};

export type UseScannerOptions = {
  chainId: number | null;
  publicClient: PublicClient | null;
  announcerAddress: `0x${string}` | null;
  enabled: boolean;
};

export type UseScannerResult = {
  /** All cached + newly synced announcements for the chain (raw, not yet matched with WASM) */
  announcements: CachedAnnouncement[];
  progress: ScanProgress;
  /** Whether we are in "back-fill" (cache was empty, scanning from START_BLOCK) */
  isBackfilling: boolean;
  /** Trigger a full rescan from deployment block (clears cache for this chain) */
  retrySync: () => Promise<void>;
  /** Re-run scan from lastScannedBlock+1 to latest (incremental) */
  refresh: () => Promise<void>;
};

function getStartBlock(chainId: number): bigint {
  const config = getConfigForChain(chainId);
  return BigInt(config?.deployedBlock ?? 0);
}

type SubgraphAnnouncement = {
  id: string;
  blockNumber: number;
  timestamp: string;
  etherealPublicKey: string;
  viewTag: number;
  metadata: string;
  stealthAddress: string;
  logIndex: number;
  transactionHash: string;
};

type SubgraphResponse = {
  data?: { announcements: SubgraphAnnouncement[] };
  errors?: Array<{ message: string }>;
};

/**
 * Fetch latest announcements from the Subgraph (GraphQL). Returns null on failure.
 */
async function fetchFromSubgraph(
  subgraphUrl: string,
  chainId: number
): Promise<CachedAnnouncement[] | null> {
  const res = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: ANNOUNCEMENTS_QUERY,
      variables: {
        first: SUBGRAPH_ANNOUNCEMENTS_LIMIT,
        orderBy: "blockNumber",
        orderDirection: "desc",
      },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as SubgraphResponse;
  if (json.errors?.length) return null;
  const list = json.data?.announcements;
  if (!Array.isArray(list)) return null;
  return list.map((a) => {
    const blockNumber = typeof a.blockNumber === "number" ? a.blockNumber : parseInt(String(a.blockNumber), 10);
    const logIndex = typeof a.logIndex === "number" ? a.logIndex : parseInt(String(a.logIndex), 10);
    return {
      id: announcementId(chainId, a.transactionHash, a.logIndex),
      chainId,
      blockNumber: Number.isFinite(blockNumber) ? blockNumber : 0,
      transactionHash: a.transactionHash ?? "",
      logIndex: Number.isFinite(logIndex) ? logIndex : 0,
      args: {
        stealthAddress: a.stealthAddress ?? "",
        ephemeralPubKey: a.etherealPublicKey ?? "",
        metadata: a.metadata ?? "",
      },
    };
  });
}

/**
 * Chunked RPC getLogs: adaptive range, on LimitExceeded halve and retry.
 */
async function fetchLogsAdaptive(
  publicClient: PublicClient,
  announcerAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
  _chainId: number,
  onChunk: (from: bigint, to: bigint, logs: unknown[]) => Promise<void>
): Promise<void> {
  let rangeSize = INITIAL_CHUNK_SIZE;
  let current = fromBlock;

  while (current <= toBlock) {
    const end = current + BigInt(rangeSize) - 1n > toBlock ? toBlock : current + BigInt(rangeSize) - 1n;
    let success = false;

    while (!success) {
      try {
        const logs = await publicClient.getLogs({
          address: announcerAddress,
          event: ANNOUNCEMENT_EVENT,
          fromBlock: current,
          toBlock: end,
        });
        await onChunk(current, end, logs);
        success = true;
        current = end + 1n;
      } catch (err) {
        if (isLimitExceededError(err) && rangeSize > MIN_CHUNK_SIZE) {
          rangeSize = Math.floor(rangeSize / 2);
          continue;
        }
        throw err;
      }
    }
  }
}

/**
 * Process items in batches during idle time to avoid blocking the UI (e.g. WASM matching).
 * Export for use in PrivateBalanceView when matching many cached announcements.
 */
export function processInIdleBatches<T, R>(
  items: T[],
  batchSize: number,
  process: (batch: T[]) => R | Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let offset = 0;

  return new Promise((resolve, reject) => {
    function runBatch() {
      if (offset >= items.length) {
        resolve(results);
        return;
      }
      const batch = items.slice(offset, offset + batchSize);
      offset += batchSize;
      Promise.resolve(process(batch))
        .then((r) => {
          results.push(r);
          if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(runBatch, { timeout: 100 });
          } else {
            setTimeout(runBatch, 0);
          }
        })
        .catch(reject);
    }
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(runBatch, { timeout: 100 });
    } else {
      setTimeout(runBatch, 0);
    }
  });
}

export function useScanner(opts: UseScannerOptions): UseScannerResult {
  const { chainId, publicClient, announcerAddress, enabled } = opts;
  const [announcements, setAnnouncements] = useState<CachedAnnouncement[]>([]);
  const [progress, setProgress] = useState<ScanProgress>({
    phase: "idle",
    percent: 0,
    message: "",
    fromBlock: 0n,
    toBlock: 0n,
    currentBlock: 0n,
    error: null,
  });
  const [isBackfilling, setIsBackfilling] = useState(false);
  const refreshKeyRef = useRef(0);

  const runChunkedRpcSync = useCallback(
    async (
      publicClient: NonNullable<typeof opts.publicClient>,
      announcerAddress: `0x${string}`,
      fromBlock: bigint,
      toBlock: bigint,
      cacheEmpty: boolean,
      startBlock: bigint
    ) => {
      await fetchLogsAdaptive(
        publicClient,
        announcerAddress,
        fromBlock,
        toBlock,
        chainId!,
        async (_from, end, logs) => {
          await putAnnouncements(chainId!, logs as Parameters<typeof putAnnouncements>[1]);
          await setSyncState(chainId!, Number(end));
          const totalBlocks = Number(toBlock - (cacheEmpty ? startBlock : fromBlock) + 1n);
          const doneBlocks = Number(end - (cacheEmpty ? startBlock : fromBlock) + 1n);
          const percent = totalBlocks > 0 ? Math.min(100, Math.round((doneBlocks / totalBlocks) * 100)) : 100;
          setProgress((p) => ({
            ...p,
            phase: cacheEmpty ? "backfilling" : "syncing",
            percent,
            message: cacheEmpty ? `Optimizing Vault… [${percent}%]` : `Syncing… ${percent}%`,
            currentBlock: end,
          }));
        }
      );
    },
    [chainId]
  );

  const runScan = useCallback(
    async (clearCache: boolean) => {
      if (chainId == null || !publicClient || !announcerAddress || !enabled) return;

      const startBlock = getStartBlock(chainId);
      const subgraphUrl = getSubgraphUrl(chainId);

      if (clearCache) {
        await clearChainCache(chainId);
        setAnnouncements([]);
      }

      setProgress((p) => ({ ...p, phase: "loading-cache", message: "Loading cache…", error: null }));

      const cached = await getAnnouncementsForChain(chainId);
      const sync = await getSyncState(chainId);
      const lastScanned = sync?.lastScannedBlock ?? null;
      const toBlock = await publicClient.getBlockNumber();
      const fromBlock =
        clearCache || lastScanned == null
          ? startBlock
          : BigInt(Math.max(lastScanned + 1, Number(startBlock)));
      const cacheEmpty = cached.length === 0 && lastScanned == null;

      if (subgraphUrl) {
        setProgress((p) => ({
          ...p,
          phase: "indexer-fetch",
          message: "Fetching from indexer…",
          error: null,
        }));
        try {
          const list = await fetchFromSubgraph(subgraphUrl, chainId);
          if (list != null && list.length >= 0) {
            await clearChainCache(chainId);
            await putAnnouncements(chainId, list.map((a) => ({
              transactionHash: a.transactionHash,
              logIndex: a.logIndex,
              blockNumber: BigInt(a.blockNumber),
              args: a.args,
            })));
            const maxBlock = list.length > 0 ? Math.max(...list.map((a) => a.blockNumber)) : 0;
            await setSyncState(chainId, maxBlock);
            const updated = await getAnnouncementsForChain(chainId);
            setAnnouncements(updated);
            setProgress({
              phase: "indexer-fetched",
              percent: 100,
              message: "Data Fetched from Indexer",
              fromBlock: startBlock,
              toBlock,
              currentBlock: toBlock,
              error: null,
            });
            setIsBackfilling(false);
            requestAnimationFrame(() => {
              setProgress((p) => ({
                ...p,
                phase: "done",
                message: "Up to date",
              }));
            });
            return;
          }
        } catch {
          // Fall through to chunked RPC fallback
        }
      }

      if (cacheEmpty && !clearCache) {
        setIsBackfilling(true);
        setProgress({
          phase: "backfilling",
          percent: 0,
          message: "Optimizing Vault… [0%]",
          fromBlock: startBlock,
          toBlock,
          currentBlock: startBlock,
          error: null,
        });
      } else {
        setAnnouncements(cached);
        if (fromBlock > toBlock) {
          setProgress({
            phase: "done",
            percent: 100,
            message: "Up to date",
            fromBlock,
            toBlock,
            currentBlock: toBlock,
            error: null,
          });
          setIsBackfilling(false);
          return;
        }
        setProgress((p) => ({
          ...p,
          phase: "syncing",
          percent: 0,
          message: "Syncing new blocks…",
          fromBlock,
          toBlock,
          currentBlock: fromBlock,
        }));
      }

      try {
        await runChunkedRpcSync(publicClient, announcerAddress, fromBlock, toBlock, cacheEmpty, startBlock);
        const updated = await getAnnouncementsForChain(chainId);
        setAnnouncements(updated);
        setProgress({
          phase: "done",
          percent: 100,
          message: "Up to date",
          fromBlock,
          toBlock,
          currentBlock: toBlock,
          error: null,
        });
        setIsBackfilling(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setProgress((p) => ({
          ...p,
          phase: "error",
          error: msg,
          message: "Sync failed",
        }));
        setIsBackfilling(false);
      }
    },
    [chainId, publicClient, announcerAddress, enabled, runChunkedRpcSync]
  );

  useEffect(() => {
    if (!enabled || chainId == null || !publicClient || !announcerAddress) {
      setProgress((p) => ({ ...p, phase: "idle" }));
      return;
    }

    let cancelled = false;
    setProgress((p) => ({ ...p, phase: "loading-cache", message: "Loading cache…" }));

    (async () => {
      const cached = await getAnnouncementsForChain(chainId);
      if (cancelled) return;
      setAnnouncements(cached);

      const sync = await getSyncState(chainId);
      const toBlock = await publicClient.getBlockNumber();
      const startBlock = getStartBlock(chainId);
      const lastScanned = sync?.lastScannedBlock ?? null;
      const fromBlock =
        lastScanned == null ? startBlock : BigInt(Math.max(lastScanned + 1, Number(startBlock)));

      if (fromBlock > toBlock) {
        setProgress({
          phase: "done",
          percent: 100,
          message: "Up to date",
          fromBlock,
          toBlock,
          currentBlock: toBlock,
          error: null,
        });
        return;
      }

      await runScan(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, enabled, publicClient, announcerAddress]);

  const retrySync = useCallback(async () => {
    if (chainId == null) return;
    refreshKeyRef.current += 1;
    await runScan(true);
  }, [chainId, runScan]);

  const refresh = useCallback(async () => {
    await runScan(false);
  }, [runScan]);

  return {
    announcements,
    progress,
    isBackfilling,
    retrySync,
    refresh,
  };
}
