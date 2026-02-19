import { getAddress, formatEther } from "viem";
import type { FoundTx } from "./PrivateBalanceView";
import { ProtocolStepper } from "./ProtocolStepper";
import type { ProtocolStep } from "./ProtocolStepper";

type ClaimModalProps = {
  tx: FoundTx;
  destination: string;
  mainWalletAddress: string | undefined;
  claiming: boolean;
  error: string | null;
  withdrawalSteps?: ProtocolStep[];
  onDestinationChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function ClaimModal({
  tx,
  destination,
  mainWalletAddress,
  claiming,
  error,
  withdrawalSteps = [],
  onDestinationChange,
  onConfirm,
  onClose,
}: ClaimModalProps) {
  const destinationTrimmed = destination.trim();
  const isSameAsMain =
    !!mainWalletAddress &&
    destinationTrimmed.length > 0 &&
    (() => {
      try {
        return getAddress(destinationTrimmed) === getAddress(mainWalletAddress);
      } catch {
        return false;
      }
    })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card max-w-md w-full shadow-xl border-cyan/20"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-200 mb-1 font-mono">
          Secure Claim
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Unlinkable withdrawal from your one-time stealth address.
        </p>

        <div className="mb-3 p-2 rounded-lg bg-slate/50 border border-frost-border font-mono text-xs text-slate-400">
          <span className="text-slate-500">Stealth address:</span>{" "}
          <span className="text-cyan break-all">{tx.address.slice(0, 10)}…{tx.address.slice(-8)}</span>
          {" · "}
          <span className="text-emerald-400">{formatEther(tx.balance)} ETH</span>
        </div>

        <div className="space-y-3 mb-4 p-3 rounded-xl bg-charcoal/80 border border-frost-border font-mono text-xs text-slate-400">
          <p className="text-slate-300">Protocol steps:</p>
          <p>1. Reconstructing private key from spend key + shared secret (ECDH).</p>
          <p>2. Creating independent transaction signed by stealth key only.</p>
          <p>3. On-chain &quot;from&quot; = stealth address → no link to your identity.</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1 font-mono">
            Destination address
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => onDestinationChange(e.target.value)}
            placeholder="0x… (use a fresh address for privacy)"
            className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-charcoal border border-frost-border text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan/50"
          />
        </div>

        {/* Privacy Meter */}
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-1 font-mono">Privacy meter</p>
          {isSameAsMain ? (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-200 text-sm font-mono">
              ⚠ Sending to your connected wallet will link your identity to this stealth transaction. Use a fresh address for better privacy.
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-200 text-sm font-mono">
              ✓ Destination differs from connected wallet — good for privacy.
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-500/50 text-red-200 text-sm font-mono">
            {error}
          </div>
        )}

        {claiming && withdrawalSteps.length > 0 && (
          <div className="mb-4 rounded-xl border border-frost-border bg-charcoal/80 p-3">
            <p className="text-xs text-slate-500 mb-2 font-mono">Withdrawal progress</p>
            <ProtocolStepper steps={withdrawalSteps} />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={claiming}
            className="px-4 py-2 rounded-xl font-mono text-sm border border-frost-border text-slate-300 hover:bg-slate/50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={claiming || !destinationTrimmed}
            className={`px-4 py-2 rounded-xl font-mono text-sm btn-cyber ${claiming ? "loading" : ""}`}
          >
            {claiming ? "Claiming…" : "Confirm Claim"}
          </button>
        </div>
      </div>
    </div>
  );
}
