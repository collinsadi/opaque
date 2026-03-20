/**
 * Ghost manual receives that have been published on-chain via StealthAddressAnnouncer.
 * Used to hide the "Announce onchain" CTA after a successful run.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "opaque-ghost-announced";

export function ghostAnnouncementEntryKey(chainId: number, stealthAddress: string): string {
  return `${chainId}:${stealthAddress.toLowerCase()}`;
}

type State = {
  keys: Record<string, true>;
  markAnnounced: (chainId: number, stealthAddress: string) => void;
  isAnnounced: (chainId: number, stealthAddress: string) => boolean;
};

export const useGhostAnnouncementStore = create<State>()(
  persist(
    (set, get) => ({
      keys: {},
      markAnnounced: (chainId, stealthAddress) =>
        set((s) => ({
          keys: { ...s.keys, [ghostAnnouncementEntryKey(chainId, stealthAddress)]: true },
        })),
      isAnnounced: (chainId, stealthAddress) =>
        !!get().keys[ghostAnnouncementEntryKey(chainId, stealthAddress)],
    }),
    { name: STORAGE_KEY }
  )
);
