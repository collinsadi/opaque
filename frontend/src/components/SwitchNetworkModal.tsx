/**
 * Modal offering to switch to Sepolia. Used when the user is on an unsupported chain.
 * If the wallet doesn't have the chain (error 4902), we add it via wallet_addEthereumChain then switch.
 */

import { useState, type ReactNode } from "react";
import { getChain } from "../lib/chain";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_HEX = "0xaa36a7";

/** EIP-3085 params for wallet_addEthereumChain (used when wallet returns 4902). */
const ADD_SEPOLIA = {
  chainId: SEPOLIA_HEX,
  chainName: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.sepolia.org"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
} as const;

export type SwitchNetworkModalProps = {
  title?: string;
  description?: ReactNode;
  onClose?: () => void;
  /** When true, show a close/cancel control (e.g. when opened from a "Switch" button). */
  showClose?: boolean;
};

function isUnrecognizedChainError(err: unknown): boolean {
  const code = err && typeof err === "object" && "code" in err ? (err as { code: number }).code : undefined;
  return code === 4902;
}

export function SwitchNetworkModal({
  title = "Switch network",
  description = "Opaque supports Sepolia (testnet) only. Switch to Sepolia to continue.",
  onClose,
  showClose = false,
}: SwitchNetworkModalProps) {
  const [switching, setSwitching] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleSwitchSepolia = async () => {
    const ethereum = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!ethereum?.request) return;
    setSwitching(true);
    setAddError(null);
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_HEX }],
      });
      onClose?.();
    } catch (err) {
      if (isUnrecognizedChainError(err)) {
        try {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [ADD_SEPOLIA],
          });
          await ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SEPOLIA_HEX }],
          });
          onClose?.();
        } catch (addErr) {
          console.warn("[Opaque] Add/switch chain failed", addErr);
          setAddError(addErr instanceof Error ? addErr.message : "Failed to add or switch network");
        }
      } else {
        console.warn("[Opaque] Switch network failed", err);
        setAddError(err instanceof Error ? err.message : "Failed to switch network");
      }
    } finally {
      setSwitching(false);
    }
  };

  const sepoliaChain = getChain(SEPOLIA_CHAIN_ID);

  return (
    <div
      className="rounded-2xl border border-white/10 p-6 shadow-2xl bg-neutral-900/95 backdrop-blur-xl space-y-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description != null && (
            <div className="text-neutral-400 text-sm mt-1">{description}</div>
          )}
        </div>
        {showClose && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1 -m-1 rounded"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSwitchSepolia}
          disabled={switching}
          className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {switching ? (
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
          ) : null}
          Switch to {sepoliaChain.name}
        </button>
      </div>
      {addError && (
        <p className="text-sm text-red-400 mt-2" role="alert">
          {addError}
        </p>
      )}
    </div>
  );
}
