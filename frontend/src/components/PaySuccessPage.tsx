/**
 * Success receipt after a private payment: /pay/success?tx=0x…
 */

import { useSearchParams, useNavigate } from "react-router-dom";

export function PaySuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const txHash = searchParams.get("tx")?.trim() || null;
  const chainId = searchParams.get("chainId");
  const appChainId = import.meta.env.VITE_CHAIN_ID ? Number(import.meta.env.VITE_CHAIN_ID) : 31337;
  const explorerUrl = getExplorerTxUrl(chainId ? Number(chainId) : appChainId, txHash);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="card max-w-md w-full text-center border-neutral-800">
        <h1 className="text-xl font-semibold text-white mb-2">Transaction Sent</h1>
        <p className="text-neutral-500 text-sm mb-6">
          Your private payment was broadcast. The recipient can discover it using their stealth keys.
        </p>
        {txHash && (
          <div className="mb-6 p-3 rounded-lg bg-neutral-900 border border-border font-mono text-xs text-neutral-400 break-all">
            {txHash}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {explorerUrl && txHash && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-secondary text-center"
            >
              View on Explorer
            </a>
          )}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary"
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}

function getExplorerTxUrl(chainId: number, txHash: string | null): string | null {
  if (!txHash) return null;
  const urls: Record<number, string> = {
    1: "https://etherscan.io",
    11155111: "https://sepolia.etherscan.io",
    31337: "http://localhost:8545",
  };
  const base = urls[chainId];
  if (!base) return null;
  return `${base}/tx/${txHash}`;
}
