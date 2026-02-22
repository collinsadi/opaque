import { useState } from "react";
import type { Tab } from "./Layout";
import { ExplorerLink } from "./ExplorerLink";
import { getChain } from "../lib/chain";
import { isChainSupported } from "../contracts/contract-config";
import { SwitchNetworkModal } from "./SwitchNetworkModal";

type DashboardViewProps = {
  onNavigate: (t: Tab) => void;
  address?: string;
  chainId: number | null;
};

export function DashboardView({ onNavigate, address, chainId }: DashboardViewProps) {
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const canChangeNetwork = chainId != null && isChainSupported(chainId);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-white">Dashboard</h2>
        {address && (
          <ExplorerLink chainId={chainId} value={address} type="address" className="shrink-0 text-neutral-400" />
        )}
      </div>
      <p className={`text-sm text-neutral-500 ${canChangeNetwork ? "mb-2" : "mb-8"}`}>
        Send or receive with privacy.
      </p>
      {canChangeNetwork && (
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="text-sm text-neutral-500">Network: {getChain(chainId).name}</span>
          <button
            type="button"
            onClick={() => setShowSwitchModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-white border border-white/20 hover:border-white/40 transition-colors"
          >
            Change network
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onNavigate("send")}
          className="card flex flex-col items-center justify-center min-h-[140px] hover:border-neutral-600 transition-colors"
        >
          <span className="text-3xl mb-2" aria-hidden>↑</span>
          <span className="text-lg font-semibold text-white">Send</span>
          <span className="text-xs text-neutral-500 mt-1">Stealth transfer</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("receive")}
          className="card flex flex-col items-center justify-center min-h-[140px] hover:border-neutral-600 transition-colors"
          data-tour="receive"
        >
          <span className="text-3xl mb-2" aria-hidden>↓</span>
          <span className="text-lg font-semibold text-white">Receive</span>
          <span className="text-xs text-neutral-500 mt-1">Payment link or ghost address</span>
        </button>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onNavigate("balance")}
          className="px-4 py-2 rounded-lg text-sm btn-secondary"
          data-tour="vault"
        >
          Private balance
        </button>
        <button
          type="button"
          onClick={() => onNavigate("history")}
          className="px-4 py-2 rounded-lg text-sm btn-secondary"
        >
          Transaction history
        </button>
      </div>

      {showSwitchModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-switch-network-title"
          onClick={() => setShowSwitchModal(false)}
        >
          <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <SwitchNetworkModal
              title="Change network"
              description="Choose Sepolia or Paseo. Your balance, history, and registration are per network and will refresh."
              showClose
              onClose={() => setShowSwitchModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
