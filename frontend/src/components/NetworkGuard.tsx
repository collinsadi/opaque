import type { ReactNode } from "react";
import { useWallet } from "../hooks/useWallet";
import { isChainSupported } from "../contracts/contract-config";
import { SwitchNetworkModal } from "./SwitchNetworkModal";

type NetworkGuardProps = {
  children: ReactNode;
};

export function NetworkGuard({ children }: NetworkGuardProps) {
  const { isConnected, chainId } = useWallet();
  const showUnsupported = isConnected && chainId != null && !isChainSupported(chainId);

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
        <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <SwitchNetworkModal
            title="Unsupported network"
            description="Opaque supports Sepolia and Paseo (Polkadot Hub testnet). Switch to one of these networks to continue."
          />
        </div>
      </div>
    </>
  );
}
