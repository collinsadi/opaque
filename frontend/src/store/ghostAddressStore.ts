/**
 * Manual "ghost" receive addresses: ephemeral key + stealth address per chain.
 * Used for one-time receive without on-chain announcement; scanner/monitor can check balance.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Address } from "viem";

export type GhostEntry = {
  chainId: number;
  stealthAddress: Address;
  /** Hex 0x... 32-byte ephemeral private key for key reconstruction */
  ephemeralPrivKeyHex: string;
  createdAt: number;
};

const STORAGE_KEY = "opaque-ghost-addresses";

type GhostState = {
  entries: GhostEntry[];
  add: (entry: Omit<GhostEntry, "createdAt">) => void;
  remove: (stealthAddress: string, chainId: number) => void;
  getForChain: (chainId: number) => GhostEntry[];
};

export const useGhostAddressStore = create<GhostState>()(
  persist(
    (set, get) => ({
      entries: [],

      add: (entry) =>
        set((state) => ({
          entries: [
            ...state.entries,
            { ...entry, createdAt: Date.now() },
          ],
        })),

      remove: (stealthAddress, chainId) =>
        set((state) => ({
          entries: state.entries.filter(
            (e) =>
              e.chainId !== chainId ||
              e.stealthAddress.toLowerCase() !== stealthAddress.toLowerCase()
          ),
        })),

      getForChain: (chainId) =>
        get().entries.filter((e) => e.chainId === chainId),
    }),
    { name: STORAGE_KEY }
  )
);
