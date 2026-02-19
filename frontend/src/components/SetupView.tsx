import { useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { getAppChain } from "../lib/chain";
import { useKeys } from "../context/KeysContext";

const SETUP_MESSAGE =
  "Sign this message to derive your Opaque Cash stealth keys. This does not approve any transaction.";

export function SetupView() {
  const { setFromSignature, stealthMetaAddressHex, isSetup } = useKeys();
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSign = async () => {
    setError(null);
    console.log("🔑 [Opaque] Setup: requesting signature…");
    setIsSigning(true);
    try {
      const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!ethereum?.request) {
        throw new Error("No wallet found. Install MetaMask or Rainbow.");
      }
      const client = createWalletClient({
        chain: getAppChain(),
        transport: custom(ethereum as EIP1193Provider),
      });
      const [address] = await client.requestAddresses();
      if (!address) throw new Error("No account selected.");
      console.log("🔑 [Opaque] Setup: wallet address", { address: address.slice(0, 14) + "…" });
      const sig = await client.signMessage({
        account: address,
        message: SETUP_MESSAGE,
      });
      setFromSignature(sig);
      console.log("🔑 [Opaque] Setup: signature received ✅");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to sign";
      console.error("⚠️ [Opaque] Setup failed", { error: msg });
      setError(msg);
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="glass-card max-w-lg mx-auto">
      <h2 className="text-xl font-semibold text-slate-200 mb-1">
        Key setup
      </h2>
      <p className="text-sm text-slate-400 mb-6">
        Sign with your wallet to derive your viewing and spending keys. Keys stay in this session only.
      </p>

      {!isSetup && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleSign}
            disabled={isSigning}
            className="w-full py-3 px-4 rounded-xl bg-slate-light border border-cyan/30 text-cyan font-medium hover:bg-cyan/10 hover:border-cyan/50 disabled:opacity-50 transition-colors"
          >
            {isSigning ? "Check your wallet…" : "Connect wallet & sign to derive keys"}
          </button>
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
        </div>
      )}

      {isSetup && stealthMetaAddressHex && (
        <div className="space-y-4">
          <p className="text-slate-300 text-sm">Your Stealth Meta-Address (share this to receive):</p>
          <div className="p-4 rounded-xl bg-charcoal/80 border border-frost-border font-mono text-address text-cyan break-all">
            {stealthMetaAddressHex}
          </div>
          <p className="text-slate-500 text-xs">
            Copy and share with senders. They will use it to generate a one-time stealth address for you.
          </p>
        </div>
      )}
    </div>
  );
}
