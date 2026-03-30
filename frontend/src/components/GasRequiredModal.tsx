import { useState, useCallback } from "react";
import { ModalShell } from "./ModalShell";

type GasRequiredModalProps = {
  stealthAddress: string;
  onClose: () => void;
};

export function GasRequiredModal({ stealthAddress, onClose }: GasRequiredModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(stealthAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [stealthAddress]);

  return (
    <ModalShell
      open
      title="Gas required"
      description="Your stealth address needs a small amount of ETH to pay network fees for the withdrawal."
      onClose={onClose}
      maxWidthClassName="max-w-lg"
    >
        {/* Header with icon */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/10 border border-amber-500/30"
            aria-hidden
          >
            <svg
              className="w-5 h-5 text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-mist mt-1 leading-relaxed">
              To move assets out of a Stealth Address, the address itself needs a small amount of ETH to pay network fees (gas).
            </p>
            <p className="text-sm text-mist/80 mt-2 leading-relaxed">
              In a real-world scenario, you should fund this address from an independent &quot;Gas Tank&quot; wallet to maintain your privacy set.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-ink-950/40 border border-ink-700/60">
              <span className="text-xs text-mist">
                Opaque v2 will support Gasless Withdrawals via Paymasters, but for now, manual funding is required.
              </span>
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
                Coming Soon
              </span>
            </div>
          </div>
        </div>

        {/* Fund this Stealth Address */}
        <div className="mt-6 p-4 rounded-xl bg-ink-950/40 border border-ink-700/60">
          <p className="text-xs font-medium text-mist uppercase tracking-wider mb-3 font-mono">
            Fund this Stealth Address
          </p>
          <div className="p-3 rounded-xl bg-ink-950/30 border border-ink-700 font-mono text-xs text-slate-200 break-all">
            {stealthAddress}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-3 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-glow text-ink-950 hover:opacity-90 transition-opacity"
          >
            {copied ? "Copied!" : "Copy Stealth Address"}
          </button>
          <p className="text-xs text-mist/80 mt-3 leading-relaxed">
            Send a small amount of ETH (e.g., 0.005 ETH) to this address to enable the withdrawal.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-mist border border-ink-600 bg-ink-950/30 hover:border-glow/30 hover:text-white transition-colors"
          >
            Back to Vault
          </button>
        </div>
    </ModalShell>
  );
}
