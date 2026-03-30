/**
 * Faucet tab content
 * Instant mint of 200 mUSDC / 200 mUSDT from MockERC20.
 */

import { useState } from "react";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  type EIP1193Provider,
} from "viem";
import { getChain } from "../lib/chain";
import { useWallet } from "../hooks/useWallet";
import { getConfigForChain, isChainSupported } from "../contracts/contract-config";
import { useToast } from "../context/ToastContext";
import { SwitchNetworkModal } from "./SwitchNetworkModal";

const MINT_DECIMALS = 6;
const MINT_AMOUNT_RAW = 200;
const MINT_AMOUNT_WEI = BigInt(MINT_AMOUNT_RAW) * 10n ** BigInt(MINT_DECIMALS);

const MOCK_ERC20_MINT_ABI = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

type ClaimStatus = "idle" | "loading" | "success" | "error";

export function FaucetPage() {
  const { isConnected, address, chainId, connect, isConnecting } = useWallet();
  const { showToast } = useToast();
  const config = getConfigForChain(chainId);
  const chain = chainId != null ? getChain(chainId) : null;
  const supported = isChainSupported(chainId);

  const [usdcStatus, setUsdcStatus] = useState<ClaimStatus>("idle");
  const [usdtStatus, setUsdtStatus] = useState<ClaimStatus>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const hasMockTokens =
    config?.tokens &&
    config.tokens.USDC !== "0x0000000000000000000000000000000000000000" &&
    config.tokens.USDT !== "0x0000000000000000000000000000000000000000";

  const showSwitchNetwork = isConnected && chainId != null && !supported;
  const showClaimButtons = isConnected && supported && hasMockTokens && address && chain;

  const handleMint = async (token: "USDC" | "USDT") => {
    if (!address || !chain || !config?.tokens) return;
    const tokenAddress = config.tokens[token];
    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") return;

    const setStatus = token === "USDC" ? setUsdcStatus : setUsdtStatus;
    setStatus("loading");
    setClaimError(null);

    const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!ethereum?.request) {
      setClaimError("No wallet found.");
      setStatus("idle");
      return;
    }

    const client = createWalletClient({ chain, transport: custom(ethereum) });
    const [from] = await client.requestAddresses();
    if (!from) {
      setClaimError("No account selected.");
      setStatus("idle");
      return;
    }

    try {
      const data = encodeFunctionData({
        abi: MOCK_ERC20_MINT_ABI,
        functionName: "mint",
        args: [address, MINT_AMOUNT_WEI],
      });
      const hash = await client.sendTransaction({
        account: from,
        to: tokenAddress,
        value: 0n,
        data,
      });
      setStatus("success");
      showToast("Transaction successful", {
        explorerTx: chainId != null ? { chainId, txHash: hash } : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setClaimError(msg);
      setStatus("error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full">
      <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">
        Faucet
      </h1>
      <p className="text-mist text-sm mb-3">
        Need test tokens? Mint mock USDC/USDT directly to your connected wallet.
      </p>
      <p className="text-mist/80 text-sm mb-8">
        This is only for testing on Sepolia. Claim a token, then use Send/Receive in Opaque to test private payment flows.
      </p>

      {/* Switch Network notice */}
      {showSwitchNetwork && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 mb-8">
          <h2 className="text-lg font-semibold text-amber-200 mb-2">Switch network</h2>
          <p className="text-amber-100/80 text-sm mb-4">
            Faucet claims are available on Sepolia only.
          </p>
          <button
            type="button"
            onClick={() => setShowSwitchModal(true)}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-glow text-ink-950 hover:opacity-90"
          >
            Switch to Sepolia
          </button>
          {showSwitchModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
              role="dialog"
              aria-modal="true"
              onClick={() => setShowSwitchModal(false)}
            >
              <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <SwitchNetworkModal
                  title="Switch network"
                  description="Switch to Sepolia to use the faucet."
                  showClose
                  onClose={() => setShowSwitchModal(false)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instant Mint cards — only when chain supported and mock tokens available */}
      {!showSwitchNetwork && (
        <>
          {!isConnected ? (
            <div className="rounded-2xl border border-ink-700 bg-ink-900/25 p-5 mb-8">
              <p className="text-mist text-sm mb-4">
                Connect your wallet to mint 200 mUSDC or 200 mUSDT.
              </p>
              <button
                type="button"
                onClick={() => connect()}
                disabled={isConnecting}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-glow text-ink-950 hover:opacity-90 disabled:opacity-50"
              >
                {isConnecting ? "Connecting…" : "Connect wallet"}
              </button>
            </div>
          ) : showClaimButtons ? (
            <section className="mb-10">
              <h2 className="font-display text-lg font-bold text-white mb-3">Instant mint</h2>
              <p className="text-mist text-sm mb-4">
                One click mints <span className="font-medium text-white">200</span> tokens to your connected wallet.
              </p>
              {claimError && (
                <p className="text-red-400 text-sm mb-4" role="alert">
                  {claimError}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleMint("USDC")}
                  disabled={usdcStatus === "loading" || usdtStatus === "loading"}
                  className="rounded-2xl border border-ink-700 bg-ink-900/25 p-6 transition-colors hover:border-glow/30 text-left flex flex-col items-center justify-center min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {usdcStatus === "loading" && (
                    <span className="w-6 h-6 border-2 border-ink-600 border-t-glow rounded-full animate-spin mb-2" aria-hidden />
                  )}
                  {usdcStatus === "success" && (
                    <span className="text-green-400 text-2xl mb-2" aria-hidden>✓</span>
                  )}
                  <span className="font-semibold text-white">
                    {usdcStatus === "loading"
                      ? "Minting…"
                      : usdcStatus === "success"
                        ? "Minted"
                        : "Mint 200 mUSDC"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMint("USDT")}
                  disabled={usdcStatus === "loading" || usdtStatus === "loading"}
                  className="rounded-2xl border border-ink-700 bg-ink-900/25 p-6 transition-colors hover:border-glow/30 text-left flex flex-col items-center justify-center min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {usdtStatus === "loading" && (
                    <span className="w-6 h-6 border-2 border-ink-600 border-t-glow rounded-full animate-spin mb-2" aria-hidden />
                  )}
                  {usdtStatus === "success" && (
                    <span className="text-green-400 text-2xl mb-2" aria-hidden>✓</span>
                  )}
                  <span className="font-semibold text-white">
                    {usdtStatus === "loading"
                      ? "Minting…"
                      : usdtStatus === "success"
                        ? "Minted"
                        : "Mint 200 mUSDT"}
                  </span>
                </button>
              </div>
            </section>
          ) : isConnected && supported && !hasMockTokens && (
            <div className="rounded-2xl border border-ink-700 bg-ink-900/25 p-5 mb-8">
              <p className="text-mist text-sm">
                Mock-token faucet is not deployed on this network. Switch to Sepolia to mint.
              </p>
            </div>
          )}
        </>
      )}

      <div className="rounded-2xl border border-ink-700 bg-ink-900/20 p-5">
        <h2 className="font-display text-lg font-bold text-white mb-2">What this tab is for</h2>
        <p className="text-sm text-mist leading-relaxed">
          The faucet gives you mock tokens for end-to-end testing. Mint tokens here,
          then go to Send/Receive to test private transfers and discovery flows inside
          the app.
        </p>
      </div>
    </div>
  );
}
