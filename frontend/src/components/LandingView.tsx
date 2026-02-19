import { useState } from "react";
import { createWalletClient, custom, encodeFunctionData, type EIP1193Provider } from "viem";
import { getAppChain } from "../lib/chain";
import { useKeys } from "../context/KeysContext";
import { useWallet } from "../hooks/useWallet";
import { isRegistered, REGISTRY_ADDRESS, STEALTH_REGISTRY_ABI } from "../lib/registry";
import { SCHEME_ID_SECP256K1 } from "../lib/contracts";

const SETUP_MESSAGE =
  "Sign this message to derive your Opaque Cash stealth keys. This does not approve any transaction.";

type Phase = "idle" | "connecting" | "signing" | "checking" | "register" | "registering" | "done" | "error";

export function LandingView() {
  const { setFromSignature, isSetup, stealthMetaAddressHex } = useKeys();
  const { isConnected, address, isConnecting, connect } = useWallet();
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
        chain: getAppChain(),
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
      registered = await isRegistered(address);
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
    if (!stealthMetaAddressHex || !address) return;
    setError(null);
    setTxHash(null);
    setPhase("registering");
    try {
      const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!ethereum?.request) throw new Error("No wallet found.");
      const client = createWalletClient({
        chain: getAppChain(),
        transport: custom(ethereum),
      });
      const calldata = encodeFunctionData({
        abi: STEALTH_REGISTRY_ABI,
        functionName: "registerKeys",
        args: [SCHEME_ID_SECP256K1, stealthMetaAddressHex],
      });
      const hash = await client.sendTransaction({
        account: address,
        to: REGISTRY_ADDRESS,
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
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-3">
          Opaque
        </h1>
        <p className="text-neutral-500 text-sm md:text-base mb-4">
          Non-custodial stealth payment protocol.
        </p>
        <p className="text-neutral-600 text-xs md:text-sm mb-10 max-w-md mx-auto">
          Your keys never leave your browser. Privacy is mathematically guaranteed.
        </p>

        {phase === "idle" && (
          <button
            type="button"
            onClick={handleEnterVault}
            disabled={isConnecting}
            className="w-full max-w-sm mx-auto py-3.5 px-6 rounded-lg text-sm font-medium bg-white text-black hover:opacity-90 transition-opacity"
          >
            {!isConnected ? "Connect wallet & enter" : "Initialize Protocol"}
          </button>
        )}

        {(phase === "connecting" || phase === "signing") && (
          <p className="text-neutral-400 text-sm">
            {phase === "connecting" ? "Check your wallet to connect…" : "Sign the message in your wallet to derive keys…"}
          </p>
        )}

        {phase === "checking" && (
          <p className="text-neutral-400 text-sm">Checking registry…</p>
        )}

        {phase === "register" && (
          <div className="card text-left max-w-md mx-auto">
            <h2 className="text-lg font-semibold text-white mb-2">Register Privacy Keys</h2>
            <p className="text-sm text-neutral-500 mb-4">
              One-time on-chain registration so others can send to you by your ETH address.
            </p>
            {error && <p className="text-error text-sm mb-3">{error}</p>}
            <button
              type="button"
              onClick={handleRegister}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary"
            >
              Register
            </button>
          </div>
        )}

        {phase === "registering" && (
          <p className="text-neutral-400 text-sm">Confirm the transaction in your wallet…</p>
        )}

        {phase === "done" && (
          <p className="text-success text-sm">Setup complete. Entering dashboard…</p>
        )}

        {phase === "error" && error && (
          <div className="mt-4 p-3 rounded-lg bg-neutral-900 border border-error/30 text-error text-sm">
            {error}
          </div>
        )}

        {txHash && (
          <p className="mt-3 text-neutral-500 text-xs font-mono break-all">
            Tx: {txHash}
          </p>
        )}
      </div>
    </div>
  );
}
