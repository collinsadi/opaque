/**
 * Gas Tank intro modal (first time) and post-initialize view (address to copy, fund, close).
 */

import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ExplorerLink } from "./ExplorerLink";
import { getExplorerAddressUrl } from "../lib/explorer";
import { getChain } from "../lib/chain";

type GasTankModalProps = {
  /** Intro: what/why + Initialize. Initialized: address + fund + close. */
  mode: "intro" | "initialized";
  tankAddress: string | null;
  chainId: number | null;
  onInitialize: () => void;
  onClose: () => void;
  initializing?: boolean;
};

export function GasTankModal({
  mode,
  tankAddress,
  chainId,
  onInitialize,
  onClose,
  initializing = false,
}: GasTankModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!tankAddress) return;
    try {
      await navigator.clipboard.writeText(tankAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [tankAddress]);

  const fundUrl = chainId != null && tankAddress ? getExplorerAddressUrl(chainId, tankAddress) : null;
  const nativeSymbol = chainId != null ? getChain(chainId).nativeCurrency.symbol : "ETH";

  if (mode === "intro") {
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
            A Gas Tank is a stealth address generated for you to hold native {nativeSymbol} used only to pay network fees when sweeping ERC20 tokens that support permit (EIP-2612).
          </p>
          <p className="text-sm text-neutral-400 mb-4 leading-relaxed">
            Instead of funding each stealth address with gas from your main wallet—which can link your identity—you fund a single Gas Tank once. When you sweep an ERC20 from a stealth address, the tank can pay the gas so the stealth address does not need any {nativeSymbol}.
          </p>
          <p className="text-sm text-neutral-500 mb-4">
            <Link to="/gas-tank" className="text-white underline hover:no-underline" onClick={onClose}>
              Learn more →
            </Link>
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm btn-secondary"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onInitialize}
              disabled={initializing}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:opacity-90 disabled:opacity-50"
            >
              {initializing ? "Initializing…" : "Initialize tank"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      <div
        className="card max-w-md w-full border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-1">Gas Tank ready</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Send {nativeSymbol} to this address to pay for gas when sweeping ERC20s with permit.
        </p>
        {tankAddress && (
          <div className="mb-4 p-3 rounded-lg bg-neutral-900 border border-border font-mono text-xs text-neutral-300 break-all">
            {tankAddress}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {tankAddress && (
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:opacity-90"
            >
              {copied ? "Copied!" : "Copy address"}
            </button>
          )}
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
