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
      <div className="card max-w-lg mx-auto text-center text-neutral-500">
        Complete key setup first so you have a stealth meta-address to register.
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="card max-w-lg mx-auto text-center text-neutral-500">
        Connect your wallet to register your stealth meta-address on-chain.
      </div>
    );
  }

  return (
    <div className="card max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-white mb-1">Register</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Save your stealth meta-address on the registry so others can send to you using your ETH address.
      </p>

      <div className="space-y-4">
        {checking && (
          <p className="text-neutral-600 text-sm">Checking registration…</p>
        )}
        {!checking && registered === true && (
          <div className="p-3 rounded-lg bg-neutral-900 border border-border text-sm text-success">
            Already registered. Others can resolve your stealth meta-address from your ETH address.
          </div>
        )}
        {!checking && registered === false && (
          <>
            <p className="text-neutral-400 text-sm">
              Your meta-address will be stored on-chain for{" "}
              <span className="font-mono text-neutral-300">{address.slice(0, 6)}…{address.slice(-4)}</span>.
            </p>
            {error && <p className="text-error text-sm">{error}</p>}
            {txHash && (
              <p className="text-success text-sm">
                Registered. Tx: <span className="font-mono break-all text-neutral-400">{txHash}</span>
              </p>
            )}
            <button
              type="button"
              onClick={handleRegister}
              disabled={registering}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary"
            >
              {registering ? "Registering…" : "Register"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
