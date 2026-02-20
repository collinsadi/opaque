/**
 * Entry Gate — Bold minimalist initialization screen.
 * Shown when user clicks "Enter the Vault" and is not yet initialized.
 */

import { useState } from "react";
import { createWalletClient, custom, encodeFunctionData, type EIP1193Provider } from "viem";
import { getAppChain, getChain } from "../lib/chain";
import { useKeys } from "../context/KeysContext";
import { useWallet } from "../hooks/useWallet";
import { isRegistered, getRegistryAddress, STEALTH_REGISTRY_ABI } from "../lib/registry";
import { SCHEME_ID_SECP256K1 } from "../lib/contracts";
import { getConfigForChain } from "../contracts/contract-config";

const SETUP_MESSAGE =
  "Sign this message to derive your Opaque Cash stealth keys. This does not approve any transaction.";

type Phase = "idle" | "connecting" | "signing" | "checking" | "register" | "registering" | "done" | "error";

export function LandingView() {
  const { setFromSignature, isSetup, stealthMetaAddressHex } = useKeys();
  const { isConnected, address, chainId, isConnecting, connect } = useWallet();
  const currentConfig = getConfigForChain(chainId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleEnterVault = async () => {
    setError(null);
    setTxHash(null);

    if (!isConnected || !address) {
      setPhase("connecting");
      try {
        await connect();
        if (!(window as unknown as { ethereum?: EIP1193Provider }).ethereum?.request) {
          throw new Error("No wallet found.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to connect");
        setPhase("error");
        return;
      }
      setPhase("idle");
      return;
    }

    setPhase("signing");
    try {
      const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!ethereum?.request) throw new Error("No wallet found.");
      const client = createWalletClient({
        chain: chainId != null ? getChain(chainId) : getAppChain(),
        transport: custom(ethereum as EIP1193Provider),
      });
      const [acc] = await client.requestAddresses();
      if (!acc) throw new Error("No account selected.");
      const sig = await client.signMessage({ account: acc, message: SETUP_MESSAGE });
      setFromSignature(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signature failed");
      setPhase("error");
      return;
    }

    setPhase("checking");
    let registered: boolean;
    try {
      registered = await isRegistered(address, chainId);
    } catch (e) {
      setError("Failed to check registration.");
      setPhase("error");
      return;
    }

    if (registered) {
      setPhase("done");
      return;
    }

    setPhase("register");
  };

  const handleRegister = async () => {
    if (!stealthMetaAddressHex || !address || chainId == null || !currentConfig) return;
    const registryAddress = getRegistryAddress(chainId);
    if (!registryAddress) return;
    setError(null);
    setTxHash(null);
    setPhase("registering");
    try {
      const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!ethereum?.request) throw new Error("No wallet found.");
      const client = createWalletClient({
        chain: getChain(chainId),
        transport: custom(ethereum),
      });
      const calldata = encodeFunctionData({
        abi: STEALTH_REGISTRY_ABI,
        functionName: "registerKeys",
        args: [SCHEME_ID_SECP256K1, stealthMetaAddressHex],
      });
      const hash = await client.sendTransaction({
        account: address,
        to: registryAddress,
        data: calldata,
        value: 0n,
      });
      setTxHash(hash);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
      setPhase("register");
    }
  };

  if (isSetup) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 py-16">
      <div className="w-full max-w-md mx-auto text-center">
        {/* Large Opaque heading */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white mb-12">
          Opaque
        </h1>

        {/* Security Assurance Box */}
        <div className="mb-10 p-5 rounded-xl border border-white/10 bg-white/2 text-left">
          <p className="text-sm text-neutral-400 leading-relaxed">
            By initializing, you generate your stealth keys locally. These keys never touch our
            servers.
          </p>
        </div>

        {/* Primary CTA */}
        {phase === "idle" && (
          <button
            type="button"
            onClick={handleEnterVault}
            disabled={isConnecting}
            className="w-full py-4 px-6 rounded-xl text-sm font-medium bg-white text-black hover:opacity-90 disabled:opacity-50 transition-opacity border-0"
          >
            {!isConnected ? "Connect wallet & Initialize Protocol" : "Initialize Protocol"}
          </button>
        )}

        {(phase === "connecting" || phase === "signing") && (
          <p className="text-neutral-500 text-sm">
            {phase === "connecting"
              ? "Check your wallet to connect…"
              : "Sign the message in your wallet to derive keys…"}
          </p>
        )}

        {phase === "checking" && (
          <p className="text-neutral-500 text-sm">Checking registry…</p>
        )}

        {phase === "register" && (
          <div className="text-left rounded-xl border border-white/10 bg-white/2 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Register Privacy Keys</h2>
            <p className="text-sm text-neutral-500 mb-4">
              One-time on-chain registration so others can send to you by your ETH address.
            </p>
            {error && <p className="text-error text-sm mb-3">{error}</p>}
            <button
              type="button"
              onClick={handleRegister}
              disabled={!currentConfig}
              className="w-full py-3.5 px-6 rounded-xl text-sm font-medium bg-white text-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Register
            </button>
          </div>
        )}

        {phase === "registering" && (
          <p className="text-neutral-500 text-sm">Confirm the transaction in your wallet…</p>
        )}

        {phase === "done" && (
          <p className="text-neutral-400 text-sm">Setup complete. Entering dashboard…</p>
        )}

        {phase === "error" && error && (
          <div className="mt-4 p-4 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-sm text-left">
            {error}
          </div>
        )}

        {txHash && (
          <p className="mt-4 text-neutral-600 text-xs font-mono break-all">{txHash}</p>
        )}
      </div>
    </div>
  );
}
