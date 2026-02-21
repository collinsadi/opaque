/**
 * Per-chain transaction history (last 50): sent, received, manual ghost discoveries.
 * Stored in localStorage keyed by chainId.
 * Token-aware: each entry includes tokenSymbol, tokenAddress, and formatted amount.
 * Hydration guard: no setItem until rehydration has completed so we don't overwrite with [] on initial load.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Address } from "viem";

const MAX_ITEMS_PER_CHAIN = 50;
const STORAGE_KEY = "opaque-tx-history";

const hasRehydratedRef = { current: false };

export type TxHistoryKind = "sent" | "received" | "ghost";

export type TxHistoryEntry = {
  id: string;
  chainId: number;
  kind: TxHistoryKind;
  /** For sent: recipient meta or address; for received/ghost: sender or "Manual Ghost" */
  counterparty: string;
  amountWei: string;
  /** Token symbol for display (e.g. "USDC", "ETH") */
  tokenSymbol: string;
  /** Token contract address; null for native ETH */
  tokenAddress: Address | null;
  /** Human-readable amount string (e.g. "100.00", "0.5") */
  amount: string;
  txHash?: string;
  stealthAddress?: string;
  timestamp: number;
};

export type TxHistoryPushInput = Omit<TxHistoryEntry, "id" | "timestamp">;

type TxHistoryState = {
  /** Key: chainId */
  byChain: Record<number, TxHistoryEntry[]>;
  push: (entry: TxHistoryPushInput) => void;
  getForChain: (chainId: number) => TxHistoryEntry[];
  clearForChain: (chainId: number) => void;
  clear: () => void;
};

const txHistoryStorage = createJSONStorage<TxHistoryState>(() => ({
  getItem: (name: string): string | null => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string): void => {
    if (typeof localStorage === "undefined") return;
    if (!hasRehydratedRef.current) return;
    localStorage.setItem(name, value);
  },
  removeItem: (name: string): void => {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(name);
  },
}));

export const useTxHistoryStore = create<TxHistoryState>()(
  persist(
    (set, get) => ({
      byChain: {},

      push: (entry) =>
        set((state) => {
          const chainId = entry.chainId;
          const list = state.byChain[chainId] ?? [];
          if (entry.txHash) {
            const existingByTxHash = new Set(list.filter((e) => e.txHash).map((e) => e.txHash!.toLowerCase()));
            if (existingByTxHash.has(entry.txHash.toLowerCase())) return state;
          }
          const newEntry: TxHistoryEntry = {
            ...entry,
            tokenSymbol: entry.tokenSymbol ?? "ETH",
            tokenAddress: entry.tokenAddress ?? null,
            amount: entry.amount ?? "",
            id: `tx-${chainId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            timestamp: Date.now(),
          };
          const next = [newEntry, ...list];
          const trimmed = next.length > MAX_ITEMS_PER_CHAIN ? next.slice(0, MAX_ITEMS_PER_CHAIN) : next;
          return {
            byChain: { ...state.byChain, [chainId]: trimmed },
          };
        }),

      getForChain: (chainId) => {
        const byChain = get().byChain;
        if (byChain == null || typeof byChain !== "object") return [];
        const list = byChain[chainId];
        return Array.isArray(list) ? list.slice() : [];
      },

      clearForChain: (chainId) =>
        set((state) => ({
          byChain: { ...state.byChain, [chainId]: [] },
        })),

      clear: () => set({ byChain: {} }),
    }),
    {
      name: STORAGE_KEY,
      storage: txHistoryStorage,
      onRehydrateStorage: () => (_state, _err) => {
        hasRehydratedRef.current = true;
      },
    }
  )
);
