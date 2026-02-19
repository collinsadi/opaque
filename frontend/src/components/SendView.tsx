import { useState } from "react";
import {
  createWalletClient,
  custom,
  parseEther,
  encodeFunctionData,
  type Address,
  type Hex,
  type EIP1193Provider,
} from "viem";
import { getAppChain } from "../lib/chain";
import { useKeys } from "../context/KeysContext";
import { computeStealthAddressAndViewTag } from "../lib/stealth";
import {
  STEALTH_ANNOUNCER_ABI,
  SCHEME_ID_SECP256K1,
  DEFAULT_ANNOUNCER_ADDRESS,
} from "../lib/contracts";

const ANNOUNCER: Address =
  (import.meta.env.VITE_ANNOUNCER_ADDRESS as Address) || DEFAULT_ANNOUNCER_ADDRESS;

function bytesToHex(b: Uint8Array): string {
  return "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function SendView() {
  const { isSetup } = useKeys();
  const [recipientMeta, setRecipientMeta] = useState("");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setError(null);
    setTxHash(null);
    const meta = recipientMeta.trim();
    if (!meta || !amount) {
      console.log("📤 [Opaque] Send validation: missing meta or amount");
      setError("Enter recipient stealth meta-address and amount.");
      return;
    }
    let metaHex: Hex;
    try {
      metaHex = (meta.startsWith("0x") ? meta : "0x" + meta) as Hex;
      if (metaHex.length !== 2 + 66 * 2) {
        throw new Error("Stealth meta-address must be 66 bytes (132 hex chars).");
      }
    } catch {
      console.warn("⚠️ [Opaque] Send: invalid meta-address format");
      setError("Invalid stealth meta-address format.");
      return;
    }
    const value = parseEther(amount);
    if (value === 0n) {
      console.log("📤 [Opaque] Send validation: zero amount");
      setError("Amount must be greater than 0.");
      return;
    }

    console.log("📤 [Opaque] Send starting…", { amount, toMeta: metaHex.slice(0, 20) + "…" });
    setSending(true);
    try {
      const { stealthAddress, ephemeralPubKey, metadata } =
        computeStealthAddressAndViewTag(metaHex);
      console.log("📤 [Opaque] Stealth address derived", { stealth: stealthAddress.slice(0, 14) + "…" });

      const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!ethereum?.request) throw new Error("No wallet found.");
      const client = createWalletClient({
        chain: getAppChain(),
        transport: custom(ethereum),
      });
      const [from] = await client.requestAddresses();
      if (!from) throw new Error("No account selected.");
      console.log("📤 [Opaque] Wallet", { from: from.slice(0, 14) + "…" });

      const announceCalldata = encodeFunctionData({
        abi: STEALTH_ANNOUNCER_ABI,
        functionName: "announce",
        args: [
          SCHEME_ID_SECP256K1,
          stealthAddress,
          bytesToHex(ephemeralPubKey) as Hex,
          bytesToHex(metadata) as Hex,
        ],
      });

      // Option A: Two separate txs (announce then send). Simpler.
      // Option B: Multicall / single tx that does both. For now we do two txs so we don't need a multicall contract.
      const hash = await client.sendTransaction({
        account: from,
        to: stealthAddress,
        value,
        data: "0x",
      });
      setTxHash(hash);
      console.log("📤 [Opaque] Send tx sent ✅", { hash });

      // Then announce so the recipient's scanner can see it.
      await client.sendTransaction({
        account: from,
        to: ANNOUNCER,
        data: announceCalldata,
        value: 0n,
      });
      console.log("📤 [Opaque] Announce tx sent ✅");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      console.error("⚠️ [Opaque] Send failed", { error: msg });
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  if (!isSetup) {
    return (
      <div className="glass-card max-w-lg mx-auto text-center text-slate-400">
        Complete key setup first so you can receive as well.
      </div>
    );
  }

  return (
    <div className="glass-card max-w-lg mx-auto">
      <h2 className="text-xl font-semibold text-slate-200 mb-1">Send</h2>
      <p className="text-sm text-slate-400 mb-6">
        Enter the recipient&apos;s Stealth Meta-Address and amount. ETH is sent to a one-time stealth address and announced on-chain.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">
            Recipient Stealth Meta-Address
          </label>
          <input
            type="text"
            value={recipientMeta}
            onChange={(e) => setRecipientMeta(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 rounded-xl bg-charcoal/80 border border-frost-border font-mono text-address text-sm placeholder-slate-500 focus:border-cyan/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Amount (ETH)</label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.01"
            className="w-full px-4 py-3 rounded-xl bg-charcoal/80 border border-frost-border font-mono text-sm placeholder-slate-500 focus:border-cyan/50 focus:outline-none"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {txHash && (
          <p className="text-cyan text-sm">
            Sent. Tx: <span className="font-mono break-all">{txHash}</span>
          </p>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="w-full py-3 px-4 rounded-xl bg-slate-light border border-cyan/30 text-cyan font-medium hover:bg-cyan/10 hover:border-cyan/50 disabled:opacity-50 transition-colors"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
