import { useState, type ReactNode } from "react";
import { useWallet } from "../hooks/useWallet";
import { isChainSupported } from "../contracts/contract-config";

const SEPOLIA_HEX = "0xaa36a7";

type NetworkGuardProps = {
  children: ReactNode;
};

export function NetworkGuard({ children }: NetworkGuardProps) {
  const { isConnected, chainId } = useWallet();
  const [switching, setSwitching] = useState(false);
  const supported = isChainSupported(chainId);
  const showUnsupported = isConnected && chainId != null && !supported;

  const handleSwitchNetwork = async () => {
    const ethereum = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!ethereum?.request) return;
    setSwitching(true);
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_HEX }],
      });
    } catch (err) {
      console.warn("[Opaque] Switch network failed", err);
    } finally {
      setSwitching(false);
    }
  };

  if (!showUnsupported) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="network-guard-title"
      >
        <div
          className="max-w-md w-full rounded-2xl border border-white/10 p-8 shadow-2xl bg-neutral-900/90 backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="network-guard-title" className="text-xl font-semibold text-white mb-2">
            Network Not Supported
          </h2>
          <p className="text-neutral-400 text-sm mb-6">
            Opaque Cash currently supports Ethereum, Sepolia, and Hardhat. Please
            switch to a supported network to continue.
          </p>
          <button
            type="button"
            onClick={handleSwitchNetwork}
            disabled={switching}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary disabled:opacity-50"
          >
            {switching ? "Switching…" : "Switch to Supported Network"}
          </button>
          <p className="text-neutral-500 text-xs mt-4 text-center">
            Default: Sepolia testnet
          </p>
        </div>
      </div>
    </>
  );
}
