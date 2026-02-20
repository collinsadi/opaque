/**
 * Success receipt after a private payment: /pay/success?tx=0x…
 */

import { useSearchParams, useNavigate } from "react-router-dom";
import { getExplorerTxUrl } from "../lib/explorer";

const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export function PaySuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const txHash = searchParams.get("tx")?.trim() || null;
  const chainIdParam = searchParams.get("chainId");
  const appChainId = import.meta.env.VITE_CHAIN_ID ? Number(import.meta.env.VITE_CHAIN_ID) : 31337;
  const chainId = chainIdParam ? Number(chainIdParam) : appChainId;
  const explorerUrl = getExplorerTxUrl(chainId, txHash);

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
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-secondary text-center inline-flex items-center justify-center gap-2"
            >
              <ExternalLinkIcon />
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
