/**
 * Gas Tank — deterministic stealth address used to pay gas for ERC20 permit sweeps.
 * Persisted locally: "initialized" flag and tank address (derived from keys, stored for display).
 */

import { create } from "zustand";
import type { Address } from "viem";

export const GAS_TANK_STORAGE_KEY = "opaque-gas-tank";

type GasTankState = {
  /** User has clicked "Initialize tank" and we have a tank address (stored locally). */
  initialized: boolean;
  /** Tank address (deterministic from keys; stored so we can show/copy without re-deriving). */
  tankAddress: Address | null;
  setInitialized: (address: Address) => void;
  /** Clear tank (e.g. on logout). */
  clear: () => void;
};

const STORAGE_KEY = GAS_TANK_STORAGE_KEY;

function loadStored(): { initialized: boolean; tankAddress: Address | null } {
  if (typeof localStorage === "undefined") return { initialized: false, tankAddress: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { initialized: false, tankAddress: null };
    const parsed = JSON.parse(raw) as { initialized?: boolean; tankAddress?: string };
    const addr = parsed?.tankAddress && typeof parsed.tankAddress === "string" && parsed.tankAddress.startsWith("0x")
      ? (parsed.tankAddress as Address)
      : null;
    return {
      initialized: !!parsed?.initialized && !!addr,
      tankAddress: addr,
    };
  } catch {
    return { initialized: false, tankAddress: null };
  }
}

export const useGasTankStore = create<GasTankState>()((set) => ({
  ...loadStored(),

  setInitialized: (address: Address) => {
    set({ initialized: true, tankAddress: address });
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ initialized: true, tankAddress: address }));
    }
  },

  clear: () => {
    set({ initialized: false, tankAddress: null });
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  },
}));

/** Rehydrate from localStorage on app load (e.g. after refresh). */
export function rehydrateGasTankFromStorage(): void {
  const stored = loadStored();
  useGasTankStore.setState(stored);
}
