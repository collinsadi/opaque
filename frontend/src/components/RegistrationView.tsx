import { useState, useEffect } from "react";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  type EIP1193Provider,
} from "viem";
import { getAppChain } from "../lib/chain";
import { useKeys } from "../context/KeysContext";
import { useWallet } from "../hooks/useWallet";
import {
  isRegistered,
  REGISTRY_ADDRESS,
  STEALTH_REGISTRY_ABI,
} from "../lib/registry";
import { SCHEME_ID_SECP256K1 } from "../lib/contracts";

export function RegistrationView() {
  const { isSetup, stealthMetaAddressHex } = useKeys();
  const { isConnected, address } = useWallet();
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setRegistered(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    isRegistered(address)
      .then(setRegistered)
      .catch(() => setRegistered(null))
      .finally(() => setChecking(false));
  }, [address]);

  const handleRegister = async () => {
    if (!stealthMetaAddressHex || !address) return;
    setError(null);
    setTxHash(null);
    setRegistering(true);
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
      setRegistered(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  if (!isSetup) {
    return (
      <div className="glass-card max-w-lg mx-auto text-center text-slate-400">
        Complete key setup first so you have a stealth meta-address to register.
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="glass-card max-w-lg mx-auto text-center text-slate-400">
        Connect your wallet to register your stealth meta-address on-chain.
      </div>
    );
  }

  return (
    <div className="glass-card max-w-lg mx-auto">
      <h2 className="text-xl font-semibold text-slate-200 mb-1">Register</h2>
      <p className="text-sm text-slate-400 mb-6">
        Save your derived stealth meta-address on the Registry so others can send to you using your standard ETH address.
      </p>

      <div className="space-y-4">
        {checking && (
          <p className="text-slate-500 text-sm">Checking registration…</p>
        )}
        {!checking && registered === true && (
          <p className="text-cyan text-sm">You&apos;re already registered. Others can use your ETH address to resolve your stealth meta-address.</p>
        )}
        {!checking && registered === false && (
          <>
            <p className="text-slate-300 text-sm">
              Your meta-address (from Setup) will be stored on-chain for address <span className="font-mono text-cyan/90">{address.slice(0, 6)}…{address.slice(-4)}</span>.
            </p>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {txHash && (
              <p className="text-cyan text-sm">
                Registered. Tx: <span className="font-mono break-all">{txHash}</span>
              </p>
            )}
            <button
              type="button"
              onClick={handleRegister}
              disabled={registering}
              className="w-full py-3 px-4 rounded-xl bg-slate-light border border-cyan/30 text-cyan font-medium hover:bg-cyan/10 hover:border-cyan/50 disabled:opacity-50 transition-colors"
            >
              {registering ? "Registering…" : "Register"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
