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
import { useTxHistoryStore } from "../store/txHistoryStore";

const ANNOUNCER: Address =
  (import.meta.env.VITE_ANNOUNCER_ADDRESS as Address) || DEFAULT_ANNOUNCER_ADDRESS;

function bytesToHex(b: Uint8Array): string {
  return "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function isEthAddress(s: string): boolean {
  const t = s.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(t);
}

function isDirectMetaAddress(s: string): boolean {
  const t = s.trim().startsWith("0x") ? s.trim() : "0x" + s.trim();
  return (t.length === 2 + 66 * 2) && (t.startsWith("0x02") || t.startsWith("0x03"));
}

export function SendView() {
  const { isSetup } = useKeys();
  const { push: logPush } = useProtocolLog();
  const pushTx = useTxHistoryStore((s) => s.push);
  const chainId = getAppChain().id;
  const [recipientMeta, setRecipientMeta] = useState("");
  const [resolvedMeta, setResolvedMeta] = useState<Hex | null>(null);
  const [resolving, setResolving] = useState(false);
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [steps, setSteps] = useState<ProtocolStep[]>([]);

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
    const value = parseEther(amount);
    if (value === 0n) {
      console.log("📤 [Opaque] Send validation: zero amount");
      setError("Amount must be greater than 0.");
      return;
    }

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
      const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!ethereum?.request) throw new Error("No wallet found.");
      const client = createWalletClient({
        chain: getAppChain(),
        transport: custom(ethereum),
      });
      const [from] = await client.requestAddresses();
      if (!from) throw new Error("No account selected.");

      // Fork 1: Stealth meta-address (66 bytes, 0x02/0x03…) — derive stealth and send + announce
      if (isDirectMetaAddress(with0x)) {
        const metaHex = with0x as Hex;
        console.log("📤 [Opaque] Send: using direct stealth meta-address");
        addStep("wait", "Generating ephemeral key pair…");
        logPush("wasm", "Generating ephemeral key pair");

        const { stealthAddress, ephemeralPubKey, metadata } =
          computeStealthAddressAndViewTag(metaHex);

        setLastStep("ok");
        addStep("ok", "Shared secret computed via ECDH.");
        addStep("ok", "One-time stealth address derived.", stealthAddress);
        logPush("wasm", `Stealth address derived: ${stealthAddress.slice(0, 14)}…`);

        addStep("wait", "Signing ETH transfer… (Await user)");
        logPush("blockchain", "Requesting wallet signature for ETH transfer");

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
        await client.sendTransaction({
          account: from,
          to: ANNOUNCER,
          data: announceCalldata,
          value: 0n,
        });

        setLastStep("ok");
        addStep("done", "Complete — privacy shield active.");
        logPush("blockchain", "Announcement published");
        pushTx({
          chainId,
          kind: "sent",
          counterparty: metaHex.slice(0, 10) + "…" + metaHex.slice(-8),
          amountWei: value.toString(),
          txHash: hash,
          stealthAddress,
        });
        return;
      }

      // Fork 2: Standard ETH address (42 chars) — use registry only if already resolved; else direct transfer (manual/ghost)
      if (isEthAddress(with0x)) {
        if (resolvedMeta) {
          // Resolved from registry: full stealth flow (derive + send + announce)
          const metaHex = resolvedMeta;
          console.log("📤 [Opaque] Send: using registry-resolved meta-address");
          addStep("wait", "Generating ephemeral key pair…");
          logPush("wasm", "Generating ephemeral key pair");

          const { stealthAddress, ephemeralPubKey, metadata } =
            computeStealthAddressAndViewTag(metaHex);

          setLastStep("ok");
          addStep("ok", "Shared secret computed via ECDH.");
          addStep("ok", "One-time stealth address derived.", stealthAddress);
          logPush("wasm", `Stealth address derived: ${stealthAddress.slice(0, 14)}…`);

          addStep("wait", "Signing ETH transfer… (Await user)");
          logPush("blockchain", "Requesting wallet signature for ETH transfer");

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
          await client.sendTransaction({
            account: from,
            to: ANNOUNCER,
            data: announceCalldata,
            value: 0n,
          });

          setLastStep("ok");
          addStep("done", "Complete — privacy shield active.");
          logPush("blockchain", "Announcement published");
          pushTx({
            chainId,
            kind: "sent",
            counterparty: with0x.slice(0, 10) + "…" + with0x.slice(-8),
            amountWei: value.toString(),
            txHash: hash,
            stealthAddress,
          });
          return;
        }

        // No meta-address in registry: treat as direct ETH transfer (e.g. manual ghost address)
        console.log("📤 [Opaque] Send: direct ETH transfer (no registry / manual ghost)");
        addStep("wait", "Signing ETH transfer… (Await user)");
        logPush("blockchain", "Direct ETH transfer to address");

        const hash = await client.sendTransaction({
          account: from,
          to: with0x as Address,
          value,
          data: "0x",
        });
        setTxHash(hash);
        setLastStep("ok");
        addStep("done", "Transfer sent. No on-chain announcement (direct transfer).");
        logPush("blockchain", `Transfer tx: ${hash.slice(0, 18)}…`);
        pushTx({
          chainId,
          kind: "sent",
          counterparty: with0x.slice(0, 10) + "…" + with0x.slice(-8),
          amountWei: value.toString(),
          txHash: hash,
        });
        return;
      }

      setError("Enter a 66-byte stealth meta-address (0x02/0x03…) or a standard ETH address (0x + 40 hex).");
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
      <div className="card max-w-lg mx-auto text-center text-neutral-500">
        Complete key setup first so you can receive as well.
      </div>
    );
  }

  return (
    <div className="card max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-white mb-1">Send</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Send ETH to a one-time stealth address. Enter a meta-address or an ETH address to resolve from the registry.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-500 mb-1.5">
            Recipient
          </label>
          <input
            type="text"
            value={recipientMeta}
            onChange={(e) => setRecipientMeta(e.target.value)}
            placeholder="0x… (meta-address or ETH address)"
            className="input-field"
          />
          {resolving && (
            <p className="mt-1.5 text-neutral-600 text-xs">Resolving from registry…</p>
          )}
          {!resolving && isEthAddress(recipientMeta.trim().startsWith("0x") ? recipientMeta.trim() : "0x" + recipientMeta.trim()) && (
            resolvedMeta ? (
              <p className="mt-1.5 text-neutral-400 text-xs font-mono">
                Resolved: {resolvedMeta.slice(0, 10)}…{resolvedMeta.slice(-8)}
              </p>
            ) : (
              <p className="mt-1.5 text-neutral-500 text-xs">
                Not in registry. Will send as direct ETH transfer (e.g. manual ghost address).
              </p>
            )
          )}
        </div>
        <div>
          <label className="block text-sm text-neutral-500 mb-1.5">Amount (ETH)</label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.01"
            className="input-field"
          />
        </div>
        {error && <p className="text-error text-sm">{error}</p>}
        {txHash && (
          <div className="p-3 rounded-lg bg-neutral-900 border border-border text-sm">
            <span className="text-success">Sent.</span>{" "}
            <span className="font-mono text-neutral-500 break-all text-xs">{txHash}</span>
          </div>
        )}
        {sending && steps.length > 0 && (
          <ProtocolStepper steps={steps} />
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary ${sending ? "loading" : ""}`}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
