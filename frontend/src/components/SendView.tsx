import { useState, useEffect } from "react";
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
import { resolveMetaAddress } from "../lib/registry";
import {
  STEALTH_ANNOUNCER_ABI,
  SCHEME_ID_SECP256K1,
  DEFAULT_ANNOUNCER_ADDRESS,
} from "../lib/contracts";
import { ProtocolStepper } from "./ProtocolStepper";
import type { ProtocolStep } from "./ProtocolStepper";
import { useProtocolLog } from "../context/ProtocolLogContext";

const ANNOUNCER: Address =
  (import.meta.env.VITE_ANNOUNCER_ADDRESS as Address) || DEFAULT_ANNOUNCER_ADDRESS;

function bytesToHex(b: Uint8Array): string {
  return "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Standard ETH address: 0x + 40 hex chars */
function isEthAddress(s: string): boolean {
  const t = s.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(t);
}

/** Direct 66-byte stealth meta-address (0x02 or 0x03 + 65 bytes = 132 hex chars) */
function isDirectMetaAddress(s: string): boolean {
  const t = s.trim().startsWith("0x") ? s.trim() : "0x" + s.trim();
  return (t.length === 2 + 66 * 2) && (t.startsWith("0x02") || t.startsWith("0x03"));
}

export function SendView() {
  const { isSetup } = useKeys();
  const { push: logPush } = useProtocolLog();
  const [recipientMeta, setRecipientMeta] = useState("");
  const [resolvedMeta, setResolvedMeta] = useState<Hex | null>(null);
  const [resolving, setResolving] = useState(false);
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [steps, setSteps] = useState<ProtocolStep[]>([]);

  // When user enters a 42-char ETH address, resolve their stealth meta-address from the Registry.
  useEffect(() => {
    const raw = recipientMeta.trim();
    const with0x = raw.startsWith("0x") ? raw : "0x" + raw;
    if (!isEthAddress(with0x)) {
      setResolvedMeta(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolvedMeta(null);
    resolveMetaAddress(with0x)
      .then((meta) => {
        if (!cancelled && meta) setResolvedMeta(meta);
      })
      .catch(() => {
        if (!cancelled) setResolvedMeta(null);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recipientMeta]);

  const handleSend = async () => {
    setError(null);
    setTxHash(null);
    const meta = recipientMeta.trim();
    if (!meta || !amount) {
      console.log("📤 [Opaque] Send validation: missing meta or amount");
      setError("Enter recipient (stealth meta-address or ETH address) and amount.");
      return;
    }
    const with0x = meta.startsWith("0x") ? meta : "0x" + meta;
    let metaHex: Hex;
    if (isDirectMetaAddress(with0x)) {
      metaHex = with0x as Hex;
    } else if (isEthAddress(with0x)) {
      if (!resolvedMeta) {
        setError(
          resolving
            ? "Resolving address…"
            : "No stealth meta-address registered for this address."
        );
        return;
      }
      metaHex = resolvedMeta;
    } else {
      setError("Enter a 66-byte stealth meta-address (0x02/0x03…) or a standard ETH address.");
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
    setSteps([]);
    setError(null);

    let stepIndex = 0;
    const addStep = (status: ProtocolStep["status"], label: string, detail?: string) => {
      stepIndex += 1;
      const id = `step-${stepIndex}-${Date.now()}`;
      setSteps((prev) => prev.concat([ { id, status, label, detail } ]));
    };
    const setLastStep = (status: ProtocolStep["status"], detail?: string) => {
      setSteps((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        return prev.slice(0, -1).concat([ { ...last, status, ...(detail != null ? { detail } : {}) } ]);
      });
    };

    try {
      addStep("wait", "Generating ephemeral key pair…");
      logPush("wasm", "Generating ephemeral key pair");

      const { stealthAddress, ephemeralPubKey, metadata } =
        computeStealthAddressAndViewTag(metaHex);

      setLastStep("ok");
      addStep("ok", "Shared secret computed via ECDH.");
      addStep("ok", "One-time stealth address derived.", stealthAddress);
      logPush("wasm", `Stealth address derived: ${stealthAddress.slice(0, 14)}…`);

      const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!ethereum?.request) throw new Error("No wallet found.");
      const client = createWalletClient({
        chain: getAppChain(),
        transport: custom(ethereum),
      });
      const [from] = await client.requestAddresses();
      if (!from) throw new Error("No account selected.");

      addStep("wait", "Signing ETH transfer… (Await user)");
      logPush("blockchain", "Requesting wallet signature for ETH transfer");

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

      const hash = await client.sendTransaction({
        account: from,
        to: stealthAddress,
        value,
        data: "0x",
      });
      setTxHash(hash);
      setLastStep("ok");
      addStep("ok", "Transfer broadcast.");
      logPush("blockchain", `Transfer tx: ${hash.slice(0, 18)}…`);

      addStep("wait", "Publishing announcement to Registry…");
      logPush("blockchain", "Publishing announcement (view tag + ephemeral key)");

      await client.sendTransaction({
        account: from,
        to: ANNOUNCER,
        data: announceCalldata,
        value: 0n,
      });

      setLastStep("ok");
      addStep("done", "Privacy Shield Active.");
      logPush("blockchain", "Announcement published");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      console.error("⚠️ [Opaque] Send failed", { error: msg });
      setError(msg);
      setSteps((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        return prev.slice(0, -1).concat([ { ...last, status: "error" as const, detail: msg } ]);
      });
      logPush("ui", `Send failed: ${msg}`);
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
        Enter the recipient&apos;s stealth meta-address (0x02/0x03…) or their standard ETH address to resolve from the registry. ETH is sent to a one-time stealth address and announced on-chain.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">
            Recipient (meta-address or ETH address)
          </label>
          <input
            type="text"
            value={recipientMeta}
            onChange={(e) => setRecipientMeta(e.target.value)}
            placeholder="0x… (66-byte meta or 42-char address)"
            className="w-full px-4 py-3 rounded-xl bg-charcoal/80 border border-frost-border font-mono text-address text-sm placeholder-slate-500 focus:border-cyan/50 focus:outline-none"
          />
          {resolving && (
            <p className="mt-1 text-slate-500 text-xs">Resolving from registry…</p>
          )}
          {!resolving && resolvedMeta && (
            <p className="mt-1 text-cyan/90 text-xs font-mono">
              Resolved meta-address: {resolvedMeta.slice(0, 10)}…{resolvedMeta.slice(-8)}
            </p>
          )}
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
        {sending && steps.length > 0 && (
          <div className="rounded-xl border border-frost-border bg-charcoal/80 p-3">
            <p className="text-xs text-slate-500 mb-2 font-mono">Live Protocol Feed</p>
            <ProtocolStepper steps={steps} />
          </div>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className={`w-full py-3 px-4 rounded-xl btn-cyber ${sending ? "loading" : ""}`}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
