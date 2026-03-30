/**
 * Gas Tank intro modal (first time) and post-initialize view (address to copy, fund, close).
 */

import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getExplorerAddressUrl } from "../lib/explorer";
import { getChain } from "../lib/chain";
import { ModalShell } from "./ModalShell";

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
      <ModalShell
        open
        title="Gas Tank"
        description={
          <>
            A dedicated stealth address that holds native {nativeSymbol} to pay fees for
            ERC-20 permit sweeps.
          </>
        }
        onClose={onClose}
        maxWidthClassName="max-w-md"
      >
        <p className="text-sm text-mist mb-4 leading-relaxed">
            A Gas Tank is a stealth address generated for you to hold native {nativeSymbol} used only to pay network fees when sweeping ERC20 tokens that support permit (EIP-2612).
          </p>
        <p className="text-sm text-mist mb-4 leading-relaxed">
            Instead of funding each stealth address with gas from your main wallet—which can link your identity—you fund a single Gas Tank once. When you sweep an ERC20 from a stealth address, the tank can pay the gas so the stealth address does not need any {nativeSymbol}.
          </p>
        <p className="text-sm text-mist mb-5">
            <Link to="/gas-tank" className="text-glow underline decoration-glow/40 underline-offset-2 hover:decoration-glow" onClick={onClose}>
              Learn more →
            </Link>
          </p>
        <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-mist border border-ink-600 bg-ink-950/30 hover:border-glow/30 hover:text-white transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onInitialize}
              disabled={initializing}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-glow text-ink-950 hover:opacity-90 disabled:opacity-50"
            >
              {initializing ? "Initializing…" : "Initialize tank"}
            </button>
          </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open
      title="Gas Tank ready"
      description={`Send ${nativeSymbol} here to pay gas for permit sweeps.`}
      onClose={onClose}
      maxWidthClassName="max-w-md"
    >
        <p className="text-sm text-mist mb-4">
          Send {nativeSymbol} to this address to pay for gas when sweeping ERC20s with permit.
        </p>
        {tankAddress && (
          <div className="mb-4 p-3 rounded-xl bg-ink-950/40 border border-ink-700 font-mono text-xs text-slate-200 break-all">
            {tankAddress}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {tankAddress && (
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-glow text-ink-950 hover:opacity-90"
            >
              {copied ? "Copied!" : "Copy address"}
            </button>
          )}
          {fundUrl && (
            <a
              href={fundUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl text-sm font-medium text-mist border border-ink-600 bg-ink-950/30 hover:border-glow/30 hover:text-white transition-colors inline-flex items-center gap-1"
            >
              Fund tank
              <span aria-hidden>↗</span>
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
