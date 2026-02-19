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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      <div
        className="card max-w-md w-full border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-1">
          Claim
        </h3>
        <p className="text-sm text-neutral-500 mb-5">
          Withdraw from your one-time stealth address.
        </p>

        <div className="mb-4 p-3 rounded-lg bg-neutral-900 border border-border font-mono text-xs text-neutral-400">
          <div className="flex justify-between items-center gap-2">
            <span className="text-neutral-300 break-all">{tx.address.slice(0, 10)}…{tx.address.slice(-8)}</span>
            <span className="text-success font-medium shrink-0">{formatEther(tx.balance)} ETH</span>
          </div>
        </div>

        <div className="space-y-2 mb-5 p-3 rounded-lg bg-neutral-950 border border-border font-mono text-xs text-neutral-500">
          <p className="text-neutral-400 font-medium">Protocol steps</p>
          <p>1. Reconstruct private key from spend key + shared secret</p>
          <p>2. Create independent transaction signed by stealth key</p>
          <p>3. On-chain sender = stealth address, no identity link</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-neutral-500 mb-1.5 font-mono">
            Destination
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => onDestinationChange(e.target.value)}
            placeholder="0x… (use a fresh address)"
            className="input-field text-sm"
          />
        </div>

        {/* Privacy meter */}
        <div className="mb-5">
          <p className="text-xs text-neutral-600 mb-1.5 font-mono">Privacy check</p>
          {isSameAsMain ? (
            <div className="p-3 rounded-lg bg-neutral-900 border border-warning/20 text-warning text-sm">
              Sending to your connected wallet links your identity to this transaction. Use a fresh address.
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-neutral-900 border border-success/20 text-success text-sm">
              Destination differs from connected wallet — good for privacy.
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-neutral-900 border border-error/30 text-error text-sm">
            {error}
          </div>
        )}

        {claiming && withdrawalSteps.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-neutral-600 mb-2 font-mono">Progress</p>
            <ProtocolStepper steps={withdrawalSteps} />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={claiming}
            className="px-4 py-2 rounded-lg text-sm btn-secondary disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={claiming || !destinationTrimmed}
            className={`px-4 py-2 rounded-lg text-sm font-medium btn-primary ${claiming ? "loading" : ""}`}
          >
            {claiming ? "Claiming…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
