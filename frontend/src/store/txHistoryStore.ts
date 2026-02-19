/**
 * Per-chain transaction history (last 50): sent, received, manual ghost discoveries.
 * Stored in localStorage keyed by chainId.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_ITEMS_PER_CHAIN = 50;
const STORAGE_KEY = "opaque-tx-history";

export type TxHistoryKind = "sent" | "received" | "ghost";

export type TxHistoryEntry = {
  id: string;
  chainId: number;
  kind: TxHistoryKind;
  /** For sent: recipient meta or address; for received/ghost: sender or "Manual Ghost" */
  counterparty: string;
  amountWei: string;
  txHash?: string;
  stealthAddress?: string;
  timestamp: number;
};

type TxHistoryState = {
  /** Key: chainId */
  byChain: Record<number, TxHistoryEntry[]>;
  push: (entry: Omit<TxHistoryEntry, "id" | "timestamp">) => void;
  getForChain: (chainId: number) => TxHistoryEntry[];
  clearForChain: (chainId: number) => void;
  clear: () => void;
};

export const useTxHistoryStore = create<TxHistoryState>()(
  persist(
    (set, get) => ({
      byChain: {},

      push: (entry) =>
        set((state) => {
          const chainId = entry.chainId;
          const list = state.byChain[chainId] ?? [];
          const newEntry: TxHistoryEntry = {
            ...entry,
            id: `tx-${chainId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            timestamp: Date.now(),
          };
          const next = [newEntry, ...list].slice(0, MAX_ITEMS_PER_CHAIN);
          return {
            byChain: { ...state.byChain, [chainId]: next },
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
    { name: STORAGE_KEY }
  )
);
