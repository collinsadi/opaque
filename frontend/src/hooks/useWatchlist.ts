/**
 * Watchlist — addresses to poll for balances (state-polling fallback).
 * Manual imports and generated ghost addresses are added here so we can detect
 * direct transfers that don't appear in Announcement events.
 * Archived entries stay in the list but are excluded from RPC polling.
 */

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Address } from "viem";

export type WatchlistEntry = {
  chainId: number;
  address: Address;
  /** When true, we stop polling this address to keep RPC calls small. */
  archived: boolean;
  addedAt: number;
};

const STORAGE_KEY = "opaque-watchlist";

type WatchlistState = {
  entries: WatchlistEntry[];
  /** Add address (or un-archive if already present). Call when user manually imports or generates ghost. */
  add: (chainId: number, address: Address) => void;
  /** Stop polling this address (e.g. after user withdrew and wants to reduce RPC load). */
  archive: (chainId: number, address: string) => void;
  /** Un-archive so we start polling again. */
  unarchive: (chainId: number, address: string) => void;
  /** Addresses we should poll for the given chain (not archived). */
  getActiveAddresses: (chainId: number) => Address[];
  /** All entries for the chain (including archived). */
  getEntriesForChain: (chainId: number) => WatchlistEntry[];
};

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      entries: [],

      add: (chainId, address) =>
        set((state) => {
          const normalized = address.toLowerCase();
          const existing = state.entries.find(
            (e) => e.chainId === chainId && e.address.toLowerCase() === normalized
          );
          if (existing) {
            return {
              entries: state.entries.map((e) =>
                e === existing ? { ...e, archived: false } : e
              ),
            };
          }
          return {
            entries: [
              ...state.entries,
              { chainId, address: address as Address, archived: false, addedAt: Date.now() },
            ],
          };
        }),

      archive: (chainId, address) =>
        set((state) => {
          const normalized = address.toLowerCase();
          return {
            entries: state.entries.map((e) =>
              e.chainId === chainId && e.address.toLowerCase() === normalized
                ? { ...e, archived: true }
                : e
            ),
          };
        }),

      unarchive: (chainId, address) =>
        set((state) => {
          const normalized = address.toLowerCase();
          return {
            entries: state.entries.map((e) =>
              e.chainId === chainId && e.address.toLowerCase() === normalized
                ? { ...e, archived: false }
                : e
            ),
          };
        }),

      getActiveAddresses: (chainId) =>
        get().entries
          .filter((e) => e.chainId === chainId && !e.archived)
          .map((e) => e.address),

      getEntriesForChain: (chainId) =>
        get().entries.filter((e) => e.chainId === chainId),
    }),
    { name: STORAGE_KEY }
  )
);

/** Hook-friendly: returns active watchlist addresses for the given chain. Uses useMemo so the array reference is stable when the list content is unchanged (avoids infinite re-renders). */
export function useWatchlist(chainId: number | null): Address[] {
  const entries = useWatchlistStore((state) => state.entries);
  return useMemo(() => {
    if (chainId == null) return [];
    return entries
      .filter((e) => e.chainId === chainId && !e.archived)
      .map((e) => e.address);
  }, [chainId, entries]);
}
