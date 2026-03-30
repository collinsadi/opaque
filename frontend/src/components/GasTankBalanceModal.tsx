/**
 * Modal showing Gas Tank balance (when user clicks Gas Tank button after initialization).
 */

import { useCallback, useState } from "react";
import { formatEther } from "viem";
import { ExplorerLink } from "./ExplorerLink";
import { getExplorerAddressUrl } from "../lib/explorer";
import { getChain } from "../lib/chain";
import { ModalShell } from "./ModalShell";

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
  const [copied, setCopied] = useState(false);
  const nativeSymbol = chainId != null ? getChain(chainId).nativeCurrency.symbol : "ETH";
  const balanceStr = formatEther(balanceWei);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tankAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }, [tankAddress]);

  const fundUrl = chainId != null ? getExplorerAddressUrl(chainId, tankAddress) : null;

  return (
    <ModalShell
      open
      title="Gas Tank"
      description="Balance used to pay gas for ERC-20 permit sweeps."
      onClose={onClose}
      maxWidthClassName="max-w-md"
    >
      <div className="mb-4 rounded-2xl border border-ink-700 bg-ink-950/40 p-4">
        <p className="font-display text-2xl font-bold text-white tabular-nums">
          {balanceStr} {nativeSymbol}
        </p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ExplorerLink
          chainId={chainId}
          value={tankAddress}
          type="address"
          className="text-mist text-xs font-mono"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-glow text-ink-950 hover:opacity-90"
        >
          {copied ? "Copied!" : "Copy address"}
        </button>
        {fundUrl && (
          <a
            href={fundUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl text-sm font-medium text-mist border border-ink-600 bg-ink-950/30 hover:border-glow/30 hover:text-white transition-colors inline-flex items-center gap-1"
          >
            Fund tank <span aria-hidden>↗</span>
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-sm font-medium text-mist border border-ink-600 bg-ink-950/30 hover:border-glow/30 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}
