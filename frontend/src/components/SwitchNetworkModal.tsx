/**
 * Modal offering to switch to Sepolia or Paseo. Used when the user is on an unsupported chain.
 * If the wallet doesn't have the chain (error 4902), we add it via wallet_addEthereumChain then switch.
 */

import { useState, type ReactNode } from "react";
import { getChain } from "../lib/chain";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_HEX = "0xaa36a7";
const PASEO_CHAIN_ID = 420420417;
const PASEO_HEX = "0x190f1b41";

/** EIP-3085 params for wallet_addEthereumChain (used when wallet returns 4902). */
const ADD_CHAIN_PARAMS: Record<number, { chainId: string; chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[] }> = {
  [SEPOLIA_CHAIN_ID]: {
    chainId: SEPOLIA_HEX,
    chainName: "Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
  [PASEO_CHAIN_ID]: {
    chainId: PASEO_HEX,
    chainName: "Polkadot Hub TestNet",
    nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 18 },
    rpcUrls: ["https://eth-rpc-testnet.polkadot.io"],
    blockExplorerUrls: ["https://blockscout-testnet.polkadot.io"],
  },
};


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
  description = "Opaque supports Sepolia and Paseo (Polkadot Hub testnet). Choose a network to switch to.",
  onClose,
  showClose = false,
}: SwitchNetworkModalProps) {
  const [switchingTo, setSwitchingTo] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const handleSwitch = async (chainId: number) => {
    const hex = chainId === SEPOLIA_CHAIN_ID ? SEPOLIA_HEX : chainId === PASEO_CHAIN_ID ? PASEO_HEX : null;
    if (!hex) return;
    const ethereum = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!ethereum?.request) return;
    setSwitchingTo(chainId);
    setAddError(null);
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
      onClose?.();
    } catch (err) {
      if (isUnrecognizedChainError(err)) {
        const params = ADD_CHAIN_PARAMS[chainId];
        if (params) {
          try {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [params],
            });
            await ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: hex }],
            });
            onClose?.();
          } catch (addErr) {
            console.warn("[Opaque] Add/switch chain failed", addErr);
            setAddError(addErr instanceof Error ? addErr.message : "Failed to add or switch network");
          }
        } else {
          setAddError("Unsupported chain");
        }
      } else {
        console.warn("[Opaque] Switch network failed", err);
        setAddError(err instanceof Error ? err.message : "Failed to switch network");
      }
    } finally {
      setSwitchingTo(null);
    }
  };

  const sepoliaChain = getChain(SEPOLIA_CHAIN_ID);
  const paseoChain = getChain(PASEO_CHAIN_ID);

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
          onClick={() => handleSwitch(PASEO_CHAIN_ID)}
          disabled={switchingTo != null}
          className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-white border border-emerald-400/40 disabled:opacity-50 flex items-center justify-center gap-2 order-first"
        >
          {switchingTo === PASEO_CHAIN_ID ? (
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
          ) : null}
          Switch to {paseoChain.name}
          <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
            Recommended
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleSwitch(SEPOLIA_CHAIN_ID)}
          disabled={switchingTo != null}
          className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {switchingTo === SEPOLIA_CHAIN_ID ? (
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
