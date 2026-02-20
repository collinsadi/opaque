/**
 * Checks whether the connected wallet has a stealth meta-address registered on the current chain.
 * Re-runs automatically when address or chainId changes (e.g. user switches chain).
 */

import { useState, useEffect } from "react";
import { isRegistered } from "../lib/registry";

export type RegistrationStatus = {
  /** True if the current address is registered on the current chain */
  isRegistered: boolean;
  /** True while the registry check is in progress */
  isLoading: boolean;
};

export function useRegistrationStatus(
  address: string | null,
  chainId: number | null
): RegistrationStatus {
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address || chainId == null) {
      setIsRegisteredOnChain(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    isRegistered(address, chainId)
      .then((registered) => {
        if (!cancelled) {
          setIsRegisteredOnChain(registered);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsRegisteredOnChain(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return { isRegistered: isRegisteredOnChain, isLoading };
}
