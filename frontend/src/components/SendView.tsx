import { useState, useEffect, useMemo } from "react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseEther,
  parseUnits,
  formatUnits,
  formatEther,
  encodeFunctionData,
  type Address,
  type Hex,
  type EIP1193Provider,
} from "viem";
import { getChain, getRpcUrl } from "../lib/chain";
import { useKeys } from "../context/KeysContext";
import { useWallet } from "../hooks/useWallet";
import { computeStealthAddressAndViewTag } from "../lib/stealth";
import { resolveMetaAddress } from "../lib/registry";
import { STEALTH_ANNOUNCER_ABI, SCHEME_ID_SECP256K1 } from "../lib/contracts";
import { getSelectableAssets, ERC20_BALANCE_ABI } from "../lib/tokens";
import { getConfigForChain } from "../contracts/contract-config";
import type { TokenInfo } from "../lib/tokens";
import { ProtocolStepper } from "./ProtocolStepper";
import type { ProtocolStep } from "./ProtocolStepper";
import { useProtocolLog } from "../context/ProtocolLogContext";
import { useTxHistoryStore } from "../store/txHistoryStore";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

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

/** Conservative gas limit for a simple ETH transfer (21k). */
const SIMPLE_TRANSFER_GAS = 21000n;

export function SendView() {
  const { isSetup } = useKeys();
  const { chainId, address } = useWallet();
  const { push: logPush } = useProtocolLog();
  const pushTx = useTxHistoryStore((s) => s.push);
  const currentConfig = getConfigForChain(chainId);
  const chain = chainId != null ? getChain(chainId) : null;
  const assets = chainId != null ? getSelectableAssets(chainId) : [];
  const [recipientMeta, setRecipientMeta] = useState("");
  const [resolvedMeta, setResolvedMeta] = useState<Hex | null>(null);
  const [resolving, setResolving] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<TokenInfo>(() => assets[0] ?? { symbol: "ETH", name: "Ether", decimals: 18, address: null });
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [steps, setSteps] = useState<ProtocolStep[]>([]);
  const [activeBalance, setActiveBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    const raw = recipientMeta.trim();
    const with0x = raw.startsWith("0x") ? raw : "0x" + raw;
    if (!isEthAddress(with0x) || chainId == null) {
      setResolvedMeta(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolvedMeta(null);
    resolveMetaAddress(with0x, chainId)
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
  }, [recipientMeta, chainId]);

  // Dynamic balance fetching when asset or wallet changes
  useEffect(() => {
    if (chainId == null || !chain || !address) {
      setActiveBalance(null);
      return;
    }
    const rpcUrl = getRpcUrl(chain);
    if (!rpcUrl) {
      setActiveBalance(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const isNative = selectedAsset.address === null;
    (async () => {
      try {
        if (isNative) {
          const bal = await publicClient.getBalance({ address });
          if (!cancelled) setActiveBalance(bal);
        } else if (selectedAsset.address) {
          const bal = await publicClient.readContract({
            address: selectedAsset.address,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf",
            args: [address],
          });
          if (!cancelled) setActiveBalance(bal);
        } else {
          if (!cancelled) setActiveBalance(null);
        }
      } catch {
        if (!cancelled) setActiveBalance(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chainId, chain, address, selectedAsset.symbol, selectedAsset.address]);

  // Gas reserve for ETH: max sendable = balance - estimated gas (conservative 21k * gasPrice)
  const [ethGasReserve, setEthGasReserve] = useState<bigint | null>(null);
  useEffect(() => {
    if (chainId == null || !chain || selectedAsset.address !== null || !address) {
      setEthGasReserve(null);
      return;
    }
    const rpcUrl = getRpcUrl(chain);
    if (!rpcUrl) {
      setEthGasReserve(null);
      return;
    }
    let cancelled = false;
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    publicClient.getGasPrice()
      .then((gasPrice) => {
        if (!cancelled) setEthGasReserve(SIMPLE_TRANSFER_GAS * gasPrice);
      })
      .catch(() => {
        if (!cancelled) setEthGasReserve(null);
      });
    return () => { cancelled = true; };
  }, [chainId, chain, address, selectedAsset.address]);

  const maxSendableBalance = useMemo(() => {
    if (activeBalance == null) return null;
    const isNative = selectedAsset.address === null;
    if (isNative && ethGasReserve != null) {
      return activeBalance > ethGasReserve ? activeBalance - ethGasReserve : 0n;
    }
    return activeBalance;
  }, [activeBalance, selectedAsset.address, ethGasReserve]);

  const inputAmountWei = useMemo(() => {
    const raw = amount.trim();
    if (!raw) return null;
    try {
      return selectedAsset.address === null
        ? parseEther(raw)
        : parseUnits(raw, selectedAsset.decimals);
    } catch {
      return null;
    }
  }, [amount, selectedAsset.address, selectedAsset.decimals]);

  const isInsufficientBalance = Boolean(
    maxSendableBalance != null &&
    inputAmountWei != null &&
    inputAmountWei > 0n &&
    inputAmountWei > maxSendableBalance
  );

  const formattedMaxBalance = maxSendableBalance != null
    ? formatUnits(maxSendableBalance, selectedAsset.decimals)
    : null;

  const handleMaxAmount = () => {
    if (maxSendableBalance == null || maxSendableBalance === 0n) return;
    setAmount(formattedMaxBalance ?? "0");
  };

  const handleSend = async () => {
    setError(null);
    setTxHash(null);
    if (!currentConfig || chainId == null || !chain) {
      setError("Unsupported network. Switch to a supported chain.");
      return;
    }
    const announcerAddress = currentConfig.announcer;
    const meta = recipientMeta.trim();
    if (!meta || !amount) {
      console.log("📤 [Opaque] Send validation: missing meta or amount");
      setError("Enter recipient (stealth meta-address or ETH address) and amount.");
      return;
    }
    const with0x = meta.startsWith("0x") ? meta : "0x" + meta;
    const isNative = selectedAsset.address === null;
    let value: bigint;
    try {
      value = isNative ? parseEther(amount) : parseUnits(amount, selectedAsset.decimals);
    } catch {
      setError("Invalid amount.");
      return;
    }
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
        chain,
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

        let hash: Hex;
        if (isNative) {
          addStep("wait", "Signing ETH transfer… (Await user)");
          logPush("blockchain", "Requesting wallet signature for ETH transfer");
          hash = await client.sendTransaction({
            account: from,
            to: stealthAddress,
            value,
            data: "0x",
          });
        } else {
          addStep("wait", `Signing ${selectedAsset.symbol} transfer… (Await user)`);
          logPush("blockchain", `Requesting wallet signature for ${selectedAsset.symbol} transfer`);
          const transferData = encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [stealthAddress, value],
          });
          hash = await client.sendTransaction({
            account: from,
            to: selectedAsset.address!,
            value: 0n,
            data: transferData,
          });
        }
        setTxHash(hash);
        setLastStep("ok");
        addStep("ok", "Transfer broadcast.");
        logPush("blockchain", `Transfer tx: ${hash.slice(0, 18)}…`);

        let metadataHex = bytesToHex(metadata) as Hex;
        if (!isNative && selectedAsset.address) {
          metadataHex = (metadataHex + selectedAsset.address.slice(2).toLowerCase()) as Hex;
        }
        addStep("wait", "Publishing announcement…");
        logPush("blockchain", "Publishing announcement (view tag + ephemeral key)");
        const announceCalldata = encodeFunctionData({
          abi: STEALTH_ANNOUNCER_ABI,
          functionName: "announce",
          args: [
            SCHEME_ID_SECP256K1,
            stealthAddress,
            bytesToHex(ephemeralPubKey) as Hex,
            metadataHex,
          ],
        });
        await client.sendTransaction({
          account: from,
          to: announcerAddress,
          data: announceCalldata,
          value: 0n,
        });

        setLastStep("ok");
        addStep("done", "Complete — privacy shield active.");
        logPush("blockchain", "Announcement published");
        const amountFormatted = isNative ? formatEther(value) : formatUnits(value, selectedAsset.decimals);
        pushTx({
          chainId,
          kind: "sent",
          counterparty: metaHex.slice(0, 10) + "…" + metaHex.slice(-8),
          amountWei: value.toString(),
          tokenSymbol: selectedAsset.symbol,
          tokenAddress: selectedAsset.address,
          amount: amountFormatted,
          txHash: hash,
          stealthAddress,
        });
        return;
      }

      // Fork 2: Standard ETH address (42 chars) — use registry only if already resolved; else direct transfer (manual/ghost)
      if (isEthAddress(with0x)) {
        if (resolvedMeta) {
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

          let hash: Hex;
          if (isNative) {
            addStep("wait", "Signing ETH transfer… (Await user)");
            logPush("blockchain", "Requesting wallet signature for ETH transfer");
            hash = await client.sendTransaction({
              account: from,
              to: stealthAddress,
              value,
              data: "0x",
            });
          } else {
            addStep("wait", `Signing ${selectedAsset.symbol} transfer… (Await user)`);
            const transferData = encodeFunctionData({
              abi: ERC20_TRANSFER_ABI,
              functionName: "transfer",
              args: [stealthAddress, value],
            });
            hash = await client.sendTransaction({
              account: from,
              to: selectedAsset.address!,
              value: 0n,
              data: transferData,
            });
          }
          setTxHash(hash);
          setLastStep("ok");
          addStep("ok", "Transfer broadcast.");
          logPush("blockchain", `Transfer tx: ${hash.slice(0, 18)}…`);

          let metadataHex = bytesToHex(metadata) as Hex;
          if (!isNative && selectedAsset.address) {
            metadataHex = (metadataHex + selectedAsset.address.slice(2).toLowerCase()) as Hex;
          }
          addStep("wait", "Publishing announcement…");
          const announceCalldata = encodeFunctionData({
            abi: STEALTH_ANNOUNCER_ABI,
            functionName: "announce",
            args: [
              SCHEME_ID_SECP256K1,
              stealthAddress,
              bytesToHex(ephemeralPubKey) as Hex,
              metadataHex,
            ],
          });
          await client.sendTransaction({
            account: from,
            to: announcerAddress,
            data: announceCalldata,
            value: 0n,
          });

          setLastStep("ok");
          addStep("done", "Complete — privacy shield active.");
          const amountFormattedReg = isNative ? formatEther(value) : formatUnits(value, selectedAsset.decimals);
          pushTx({
            chainId,
            kind: "sent",
            counterparty: with0x.slice(0, 10) + "…" + with0x.slice(-8),
            amountWei: value.toString(),
            tokenSymbol: selectedAsset.symbol,
            tokenAddress: selectedAsset.address,
            amount: amountFormattedReg,
            txHash: hash,
            stealthAddress,
          });
          return;
        }

        // No meta-address in registry: direct transfer
        console.log("📤 [Opaque] Send: direct transfer (no registry / manual ghost)");
        addStep("wait", isNative ? "Signing ETH transfer… (Await user)" : `Signing ${selectedAsset.symbol} transfer… (Await user)`);
        let hash: Hex;
        if (isNative) {
          hash = await client.sendTransaction({
            account: from,
            to: with0x as Address,
            value,
            data: "0x",
          });
        } else {
          const transferData = encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [with0x as Address, value],
          });
          hash = await client.sendTransaction({
            account: from,
            to: selectedAsset.address!,
            value: 0n,
            data: transferData,
          });
        }
        setTxHash(hash);
        setLastStep("ok");
        addStep("done", "Transfer sent. No on-chain announcement (direct transfer).");
        const amountFormattedDirect = isNative ? formatEther(value) : formatUnits(value, selectedAsset.decimals);
        pushTx({
          chainId,
          kind: "sent",
          counterparty: with0x.slice(0, 10) + "…" + with0x.slice(-8),
          amountWei: value.toString(),
          tokenSymbol: selectedAsset.symbol,
          tokenAddress: selectedAsset.address,
          amount: amountFormattedDirect,
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
            Asset
          </label>
          <select
            value={selectedAsset.symbol}
            onChange={(e) => {
              const a = assets.find((x) => x.symbol === e.target.value);
              if (a) setSelectedAsset(a);
            }}
            className="input-field w-full"
          >
            {assets.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol}
              </option>
            ))}
          </select>
        </div>
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
          <label className="block text-sm text-neutral-500 mb-1.5">
            Amount ({selectedAsset.symbol})
          </label>
          <div className="relative flex rounded-lg shadow-sm">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={selectedAsset.address === null ? "0.01" : "100"}
              className={`input-field flex-1 pr-14 ${isInsufficientBalance ? "border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20" : ""}`}
            />
            <button
              type="button"
              onClick={handleMaxAmount}
              disabled={maxSendableBalance == null || maxSendableBalance === 0n || balanceLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 py-1 px-2 text-xs font-medium text-neutral-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              MAX
            </button>
          </div>
          {balanceLoading && (
            <p className="mt-1.5 text-neutral-600 text-xs">Loading balance…</p>
          )}
          {isInsufficientBalance && formattedMaxBalance != null && (
            <p className="mt-1.5 text-red-400 text-xs">
              Exceeds available balance ({formattedMaxBalance} {selectedAsset.symbol})
            </p>
          )}
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
          disabled={sending || !currentConfig || isInsufficientBalance || !recipientMeta.trim() || !amount.trim()}
          className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary ${sending ? "loading" : ""}`}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
