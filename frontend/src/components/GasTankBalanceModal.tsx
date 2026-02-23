/**
 * Modal showing Gas Tank balance (when user clicks Gas Tank button after initialization).
 */

import { useCallback } from "react";
import { formatEther } from "viem";
import { ExplorerLink } from "./ExplorerLink";
import { getExplorerAddressUrl } from "../lib/explorer";
import { getChain } from "../lib/chain";

type GasTankBalanceModalProps = {
  tankAddress: string;
  balanceWei: bigint;
  chainId: number | null;
  onClose: () => void;
};

export function GasTankBalanceModal({
  tankAddress,
  balanceWei,
  chainId,
  onClose,
}: GasTankBalanceModalProps) {
  const nativeSymbol = chainId != null ? getChain(chainId).nativeCurrency.symbol : "ETH";
  const balanceStr = formatEther(balanceWei);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tankAddress);
    } catch {
      // ignore
    }
  }, [tankAddress]);

  const fundUrl = chainId != null ? getExplorerAddressUrl(chainId, tankAddress) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      <div
        className="card max-w-md w-full border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-1">Gas Tank</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Balance used to pay gas for ERC20 permit sweeps.
        </p>
        <div className="mb-4 p-4 rounded-lg bg-neutral-900 border border-border">
          <p className="text-2xl font-semibold text-white tabular-nums">
            {balanceStr} {nativeSymbol}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <ExplorerLink chainId={chainId} value={tankAddress} type="address" className="text-neutral-400 text-xs font-mono" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:opacity-90"
          >
            Copy address
          </button>
          {fundUrl && (
            <a
              href={fundUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg text-sm font-medium btn-secondary inline-flex items-center gap-1"
            >
              Fund tank
              <span aria-hidden>↗</span>
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
