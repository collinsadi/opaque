/**
 * Faucet page: /faucet
 * Instant mint of 200 mUSDC / 200 mUSDT from MockERC20, plus protocol education.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  type EIP1193Provider,
} from "viem";
import { getChain } from "../lib/chain";
import { useWallet } from "../hooks/useWallet";
import { getConfigForChain, isChainSupported } from "../contracts/contract-config";
import { Layout } from "./Layout";
import { ProtocolLogPanel } from "./ProtocolLogPanel";

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

const SEPOLIA_HEX = "0xaa36a7";

type ClaimStatus = "idle" | "loading" | "success" | "error";

export function FaucetPage() {
  const { isConnected, address, chainId, connect, isConnecting, disconnect } = useWallet();
  const config = getConfigForChain(chainId);
  const chain = chainId != null ? getChain(chainId) : null;
  const supported = isChainSupported(chainId);

  const [usdcStatus, setUsdcStatus] = useState<ClaimStatus>("idle");
  const [usdtStatus, setUsdtStatus] = useState<ClaimStatus>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

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
      await client.sendTransaction({
        account: from,
        to: tokenAddress,
        value: 0n,
        data,
      });
      setStatus("success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setClaimError(msg);
      setStatus("error");
    }
  };

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

  return (
    <Layout
      tab="dashboard"
      onTabChange={() => {}}
      isConnected={isConnected}
      address={address ?? undefined}
      isConnecting={isConnecting}
      onConnect={connect}
      onDisconnect={disconnect}
      protocolLog={<ProtocolLogPanel />}
    >
      <div className="max-w-2xl mx-auto w-full">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white mb-2">
          Faucet
        </h1>
        <p className="text-neutral-400 text-sm mb-10">
          Get mock USDC and USDT for testing Opaque stealth payments.
        </p>

        {/* Switch Network notice */}
        {showSwitchNetwork && (
          <div className="card border-amber-500/30 bg-amber-500/5 mb-8">
            <h2 className="text-lg font-semibold text-amber-200 mb-2">Switch Network</h2>
            <p className="text-neutral-400 text-sm mb-4">
              The faucet is only available on supported testnets (e.g. Sepolia). Please switch to a supported network to claim mock tokens.
            </p>
            <button
              type="button"
              onClick={handleSwitchNetwork}
              disabled={switching}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary disabled:opacity-50"
            >
              {switching ? "Switching…" : "Switch to Supported Network"}
            </button>
          </div>
        )}

        {/* Instant Mint cards — only when chain supported and mock tokens available */}
        {!showSwitchNetwork && (
          <>
            {!isConnected ? (
              <div className="card mb-8">
                <p className="text-neutral-400 text-sm mb-4">
                  Connect your wallet to claim 200 mUSDC or 200 mUSDT instantly.
                </p>
                <button
                  type="button"
                  onClick={() => connect()}
                  disabled={isConnecting}
                  className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary disabled:opacity-50"
                >
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              </div>
            ) : showClaimButtons ? (
              <section className="mb-10">
                <h2 className="text-lg font-semibold text-white mb-3">Instant Mint</h2>
                <p className="text-neutral-500 text-sm mb-4">
                  Claim 200 mock tokens per click. Recipient: your connected wallet.
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
                    className="card hover:border-neutral-600 transition-colors text-left flex flex-col items-center justify-center min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {usdcStatus === "loading" && (
                      <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mb-2" aria-hidden />
                    )}
                    {usdcStatus === "success" && (
                      <span className="text-green-400 text-2xl mb-2" aria-hidden>✓</span>
                    )}
                    <span className="font-medium text-white">
                      {usdcStatus === "loading"
                        ? "Claiming…"
                        : usdcStatus === "success"
                          ? "Claimed"
                          : "Claim 200 mUSDC"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMint("USDT")}
                    disabled={usdcStatus === "loading" || usdtStatus === "loading"}
                    className="card hover:border-neutral-600 transition-colors text-left flex flex-col items-center justify-center min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {usdtStatus === "loading" && (
                      <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mb-2" aria-hidden />
                    )}
                    {usdtStatus === "success" && (
                      <span className="text-green-400 text-2xl mb-2" aria-hidden>✓</span>
                    )}
                    <span className="font-medium text-white">
                      {usdtStatus === "loading"
                        ? "Claiming…"
                        : usdtStatus === "success"
                          ? "Claimed"
                          : "Claim 200 mUSDT"}
                    </span>
                  </button>
                </div>
              </section>
            ) : isConnected && supported && !hasMockTokens && (
              <div className="card border-neutral-700 mb-8">
                <p className="text-neutral-400 text-sm">
                  Mock token faucet is not deployed on this network. Switch to Sepolia to claim.
                </p>
              </div>
            )}
          </>
        )}

        {/* How to test stepper */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">How to test</h2>
          <ol className="space-y-4">
            <li className="flex gap-4">
              <span className="shrink-0 w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sm font-medium text-neutral-300">
                1
              </span>
              <div>
                <span className="font-medium text-white">Claim</span>
                <p className="text-neutral-500 text-sm mt-0.5">
                  Get your 200 mock tokens here.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="shrink-0 w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sm font-medium text-neutral-300">
                2
              </span>
              <div>
                <span className="font-medium text-white">Initialize</span>
                <p className="text-neutral-500 text-sm mt-0.5">
                  Ensure your Opaque Vault is initialized.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="shrink-0 w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sm font-medium text-neutral-300">
                3
              </span>
              <div>
                <span className="font-medium text-white">Transact</span>
                <p className="text-neutral-500 text-sm mt-0.5">
                  Go to <Link to="/" className="text-white underline hover:no-underline">/pay</Link> or the Dashboard to send a stealth payment.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="shrink-0 w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sm font-medium text-neutral-300">
                4
              </span>
              <div>
                <span className="font-medium text-white">Discover</span>
                <p className="text-neutral-500 text-sm mt-0.5">
                  Watch the &quot;History&quot; tab as the stealth scanner finds your funds.
                </p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </Layout>
  );
}
