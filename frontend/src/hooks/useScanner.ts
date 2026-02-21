/**
 * useScanner — IndexedDB-backed announcement scanner.
 * - Primary: single GraphQL fetch to Subgraph (latest 1000 announcements). No getLogs in this path.
 * - Fallback: if Subgraph fetch fails, uses chunked RPC getLogs (adaptive range, halve on limit).
 * - Loads cached events first; incremental sync from lastScannedBlock when using RPC.
 * - Per-chain sync state; back-fill "Optimizing Vault... [%]" when cache empty (RPC path).
 * - WASM matching offloaded with requestIdleCallback; call markSyncComplete when done (indexer path).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { gql, ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
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
import { getTokensForChain } from "../lib/tokens";
import { ERC20_BALANCE_ABI } from "../lib/tokens";
import {
  getUserFacingSyncMessage,
  logSyncError,
} from "../lib/syncErrorUtils";
import { getStoredGhostEntries } from "../store/ghostAddressStore";

const SUBGRAPH_ANNOUNCEMENTS_LIMIT = 1000;

/** Fetch last 1000 announcements; fields required for WASM scan + cache id. */
const ANNOUNCEMENTS_QUERY = gql`
  query GetAnnouncements($first: Int!, $orderBy: String!, $orderDirection: String!) {
    announcements(first: $first, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      etherealPublicKey
      viewTag
      metadata
      blockNumber
      transactionHash
      logIndex
      stealthAddress
    }
  }
`;

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
  /** Addresses from "Pending Manual Receives" (ghost addresses) to check balance for manual sync */
  ghostAddresses?: `0x${string}`[];
  /** Watchlist addresses for state-polling fallback (manual/ghost). Fetched via multicall. */
  watchlistAddresses?: `0x${string}`[];
};

/** ETH + ERC20 balances for watchlist addresses (single RPC round-trip via multicall). */
export type WatchlistBalances = {
  eth: Record<string, bigint>;
  tokens: Record<string, Record<string, bigint>>;
};

export type UseScannerResult = {
  /** All cached + newly synced announcements for the chain (raw, not yet matched with WASM) */
  announcements: CachedAnnouncement[];
  progress: ScanProgress;
  /** Native balance per ghost/watchlist address (manual scan). Use for displaying/claiming manual receives. */
  ghostBalances: Record<string, bigint>;
  /** ERC20 balances per address and token (only set when using watchlistAddresses). */
  ghostTokenBalances: Record<string, Record<string, bigint>>;
  /** Whether we are in "back-fill" (cache was empty, scanning from START_BLOCK) */
  isBackfilling: boolean;
  /** Trigger a full rescan from deployment block (clears cache for this chain) */
  retrySync: () => Promise<void>;
  /** Re-run scan from lastScannedBlock+1 to latest (incremental) */
  refresh: () => Promise<void>;
  /** Call when WASM matching has finished (e.g. after indexer path) so progress can move to "done" */
  markSyncComplete: () => void;
};

function getStartBlock(chainId: number): bigint {
  const config = getConfigForChain(chainId);
  return BigInt(config?.deployedBlock ?? 0);
}

type SubgraphAnnouncement = {
  id: string;
  etherealPublicKey: string;
  viewTag: number;
  metadata: string;
  blockNumber: number | string;
  transactionHash: string;
  logIndex: number;
  stealthAddress: string;
};

/**
 * Fetch latest announcements from the Subgraph via Apollo Client. Returns null on failure (safe fallback to RPC).
 */
async function fetchFromSubgraph(
  subgraphUrl: string,
  chainId: number
): Promise<CachedAnnouncement[] | null> {
  const graphAuth = (import.meta.env.VITE_GRAPH_AUTH as string | undefined)?.trim();
  const headers: Record<string, string> = {};
  if (graphAuth) headers["Authorization"] = `Bearer ${graphAuth}`;

  const apolloClient = new ApolloClient({
    link: new HttpLink({ uri: subgraphUrl, headers }),
    cache: new InMemoryCache(),
  });
  try {
    const result = await apolloClient.query<{ announcements: SubgraphAnnouncement[] }>({
      query: ANNOUNCEMENTS_QUERY,
      variables: {
        first: SUBGRAPH_ANNOUNCEMENTS_LIMIT,
        orderBy: "blockNumber",
        orderDirection: "desc",
      },
    });
    const list = result.data?.announcements;
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
  } catch {
    return null;
  }
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
 * Fetch ETH + ERC20 balances for watchlist addresses in one multicall (tokens) + parallel getBalance (ETH).
 */
async function checkWatchlistBalances(
  publicClient: PublicClient,
  watchlist: `0x${string}`[],
  chainId: number
): Promise<WatchlistBalances> {
  const { tokens } = getTokensForChain(chainId);
  const tokenContracts = tokens.filter(
    (t): t is typeof t & { address: `0x${string}` } =>
      t.address != null && t.address !== "0x0000000000000000000000000000000000000000"
  );

  const ethBalances = await Promise.all(
    watchlist.map((addr) => publicClient.getBalance({ address: addr }))
  );
  const eth: Record<string, bigint> = {};
  watchlist.forEach((addr, i) => {
    eth[addr.toLowerCase()] = ethBalances[i] ?? 0n;
  });

  if (tokenContracts.length === 0) {
    return { eth, tokens: Object.fromEntries(watchlist.map((a) => [a.toLowerCase(), {}])) };
  }

  const contracts = watchlist.flatMap((addr) =>
    tokenContracts.map((t) => ({
      address: t.address,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf" as const,
      args: [addr] as const,
    }))
  );
  const results = await publicClient.multicall({
    contracts: contracts as Parameters<PublicClient["multicall"]>[0]["contracts"],
  });
  const tokensOut: Record<string, Record<string, bigint>> = {};
  watchlist.forEach((addr) => {
    tokensOut[addr.toLowerCase()] = {};
  });
  let idx = 0;
  for (const addr of watchlist) {
    const key = addr.toLowerCase();
    for (const t of tokenContracts) {
      const res = results[idx];
      idx += 1;
      if (res?.status === "success" && typeof res.result === "bigint") {
        if (res.result > 0n) tokensOut[key][t.address] = res.result;
      }
    }
  }
  return { eth, tokens: tokensOut };
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
  const { chainId, publicClient, announcerAddress, enabled, ghostAddresses = [], watchlistAddresses = [] } = opts;
  const [announcements, setAnnouncements] = useState<CachedAnnouncement[]>([]);
  const [ghostBalances, setGhostBalances] = useState<Record<string, bigint>>({});
  const [ghostTokenBalances, setGhostTokenBalances] = useState<Record<string, Record<string, bigint>>>({});
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
          message: "Syncing with Indexer…",
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
            // Pass announcements directly so WASM scanning loop runs immediately (no cache read).
            setAnnouncements(list);
            setProgress({
              phase: "indexer-fetched",
              percent: 100,
              message: "Scanning Vault…",
              fromBlock: startBlock,
              toBlock,
              currentBlock: toBlock,
              error: null,
            });
            setIsBackfilling(false);
            return;
          }
        } catch {
          // Fall through to chunked RPC fallback (safe mode)
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
        const msg = getUserFacingSyncMessage(err);
        logSyncError(err, "Sync failed");
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

  const markSyncComplete = useCallback(() => {
    setProgress((p) => {
      if (p.phase !== "indexer-fetched") return p;
      return { ...p, phase: "done", message: "Up to date" };
    });
  }, []);

  // State-polling: check watchlist + ghost addresses + opaque-ghost-addresses (current chain only; skip local when on Sepolia)
  useEffect(() => {
    if (!publicClient || chainId == null) {
      setGhostBalances({});
      setGhostTokenBalances({});
      return;
    }
    // Only use stored entries for current chain (ignores 31337 when wallet is on Sepolia)
    const stored = getStoredGhostEntries().filter((e) => e.chainId === chainId);
    const storedAddresses = stored.map((e) => e.stealthAddress as `0x${string}`);
    const combined: `0x${string}`[] = [...watchlistAddresses, ...ghostAddresses, ...storedAddresses];
    const seen = new Set<string>();
    const addressesToPoll = combined.filter((addr) => {
      const key = addr.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (addressesToPoll.length === 0) {
      setGhostBalances({});
      setGhostTokenBalances({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (watchlistAddresses.length > 0 && chainId != null) {
          const { eth, tokens } = await checkWatchlistBalances(
            publicClient,
            addressesToPoll,
            chainId
          );
          if (cancelled) return;
          setGhostBalances(eth);
          setGhostTokenBalances(tokens);
        } else {
          const results = await Promise.all(
            addressesToPoll.map((addr) => publicClient.getBalance({ address: addr }))
          );
          if (cancelled) return;
          const next: Record<string, bigint> = {};
          addressesToPoll.forEach((addr, i) => {
            next[addr.toLowerCase()] = results[i] ?? 0n;
          });
          setGhostBalances(next);
          setGhostTokenBalances({});
        }
      } catch {
        if (!cancelled) {
          setGhostBalances({});
          setGhostTokenBalances({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, chainId, ghostAddresses.join(","), watchlistAddresses.join(",")]);

  return {
    announcements,
    progress,
    ghostBalances,
    ghostTokenBalances,
    isBackfilling,
    retrySync,
    refresh,
    markSyncComplete,
  };
}
