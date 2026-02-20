/**
 * Universal payment page: /pay/:identifier
 * Handles Stealth Meta-Addresses (66-char hex) and Sub-ENS names (e.g. alice.opaque.eth).
 * Resolves identifier to meta-address, then shows asset selector, amount, and Send Privately flow.
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  type Hex,
  type EIP1193Provider,
} from "viem";
import { getChain } from "../lib/chain";
import { useWallet } from "../hooks/useWallet";
import { computeStealthAddressAndViewTag } from "../lib/stealth";
import { resolveMetaAddress } from "../lib/registry";
import { isEnsName, resolveEnsToAddress } from "../lib/ens";
import { STEALTH_ANNOUNCER_ABI, SCHEME_ID_SECP256K1 } from "../lib/contracts";
import { getSelectableAssets, ERC20_BALANCE_ABI } from "../lib/tokens";
import { getConfigForChain } from "../contracts/contract-config";
import type { TokenInfo } from "../lib/tokens";
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

const SIMPLE_TRANSFER_GAS = 21000n;

function bytesToHex(b: Uint8Array): string {
  return "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function isDirectMetaAddress(s: string): boolean {
  const t = s.trim().startsWith("0x") ? s.trim() : "0x" + s.trim();
  return t.length === 2 + 66 * 2 && (t.startsWith("0x02") || t.startsWith("0x03"));
}

/** Sub-ENS as-is; meta-address truncated to 0x02…last4 */
function formatRecipientDisplay(id: string): string {
  if (!id) return "";
  const trimmed = id.trim();
  const with0x = trimmed.startsWith("0x") ? trimmed : "0x" + trimmed;
  if (isDirectMetaAddress(with0x)) {
    return with0x.slice(0, 5) + "…" + with0x.slice(-4);
  }
  return trimmed;
}

type ResolveStatus = "idle" | "resolving" | "found" | "not_found";

export function PayPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const { chainId, address, connect, isConnecting } = useWallet();
  const config = getConfigForChain(chainId);
  const chain = chainId != null ? getChain(chainId) : null;
  const assets = chainId != null ? getSelectableAssets(chainId) : [];
  const pushTx = useTxHistoryStore((s) => s.push);

  const [resolveStatus, setResolveStatus] = useState<ResolveStatus>("idle");
  const [resolvedMeta, setResolvedMeta] = useState<Hex | null>(null);
  const [displayName, setDisplayName] = useState<string>("");

  const [selectedAsset, setSelectedAsset] = useState<TokenInfo>(() => assets[0] ?? { symbol: "ETH", name: "Ether", decimals: 18, address: null });
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [activeBalance, setActiveBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [ethGasReserve, setEthGasReserve] = useState<bigint | null>(null);

  // Resolve identifier to meta-address
  useEffect(() => {
    const id = identifier?.trim();
    if (!id || chainId == null) {
      setResolveStatus(id ? "idle" : "not_found");
      setResolvedMeta(null);
      return;
    }
    setDisplayName(id);
    setResolveStatus("resolving");
    setResolvedMeta(null);
    let cancelled = false;

    (async () => {
      try {
        if (isEnsName(id)) {
          const controller = await resolveEnsToAddress(id, chainId);
          if (cancelled) return;
          if (!controller) {
            setResolveStatus("not_found");
            return;
          }
          const meta = await resolveMetaAddress(controller, chainId);
          if (cancelled) return;
          if (!meta) {
            setResolveStatus("not_found");
            return;
          }
          setResolvedMeta(meta);
          setResolveStatus("found");
        } else {
          const with0x = id.startsWith("0x") ? id : "0x" + id;
          if (isDirectMetaAddress(with0x)) {
            setResolvedMeta(with0x as Hex);
            setResolveStatus("found");
          } else {
            setResolveStatus("not_found");
          }
        }
      } catch {
        if (!cancelled) setResolveStatus("not_found");
      }
    })();
    return () => { cancelled = true; };
  }, [identifier, chainId]);

  // Keep selectedAsset in sync with assets
  useEffect(() => {
    if (assets.length > 0 && !assets.find((a) => a.symbol === selectedAsset.symbol)) {
      setSelectedAsset(assets[0]);
    }
  }, [assets, selectedAsset.symbol]);

  // Balance and gas reserve (same as SendView)
  useEffect(() => {
    if (chainId == null || !chain || !address) {
      setActiveBalance(null);
      return;
    }
    const rpcUrl = chain.rpcUrls?.default?.http?.[0];
    if (!rpcUrl) {
      setActiveBalance(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
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
        } else if (!cancelled) setActiveBalance(null);
      } catch {
        if (!cancelled) setActiveBalance(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chainId, chain, address, selectedAsset.symbol, selectedAsset.address]);

  useEffect(() => {
    if (chainId == null || !chain || selectedAsset.address !== null || !address) {
      setEthGasReserve(null);
      return;
    }
    const rpcUrl = chain.rpcUrls?.default?.http?.[0];
    if (!rpcUrl) {
      setEthGasReserve(null);
      return;
    }
    let cancelled = false;
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    publicClient.getGasPrice().then((gasPrice) => {
      if (!cancelled) setEthGasReserve(SIMPLE_TRANSFER_GAS * gasPrice);
    }).catch(() => {
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

  const formattedMaxBalance =
    maxSendableBalance != null ? formatUnits(maxSendableBalance, selectedAsset.decimals) : null;

  const handleMaxAmount = () => {
    if (maxSendableBalance == null || maxSendableBalance === 0n) return;
    setAmount(formattedMaxBalance ?? "0");
  };

  const handleSendPrivately = async () => {
    setError(null);
    if (!config || chainId == null || !chain || !resolvedMeta || !address) return;
    const isNative = selectedAsset.address === null;
    let value: bigint;
    try {
      value = isNative ? parseEther(amount) : parseUnits(amount, selectedAsset.decimals);
    } catch {
      setError("Invalid amount.");
      return;
    }
    if (value === 0n) {
      setError("Amount must be greater than 0.");
      return;
    }
    setSending(true);
    const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!ethereum?.request) {
      setError("No wallet found.");
      setSending(false);
      return;
    }
    const client = createWalletClient({ chain, transport: custom(ethereum) });
    const [from] = await client.requestAddresses();
    if (!from) {
      setError("No account selected.");
      setSending(false);
      return;
    }
    try {
      const { stealthAddress, ephemeralPubKey, metadata } = computeStealthAddressAndViewTag(resolvedMeta);
      let hash: Hex;
      if (isNative) {
        hash = await client.sendTransaction({
          account: from,
          to: stealthAddress,
          value,
          data: "0x",
        });
      } else {
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
      let metadataHex = bytesToHex(metadata) as Hex;
      if (!isNative && selectedAsset.address) {
        metadataHex = (metadataHex + selectedAsset.address.slice(2).toLowerCase()) as Hex;
      }
      await client.sendTransaction({
        account: from,
        to: config.announcer,
        data: encodeFunctionData({
          abi: STEALTH_ANNOUNCER_ABI,
          functionName: "announce",
          args: [SCHEME_ID_SECP256K1, stealthAddress, bytesToHex(ephemeralPubKey) as Hex, metadataHex],
        }),
        value: 0n,
      });
      const amountFormatted = isNative ? formatEther(value) : formatUnits(value, selectedAsset.decimals);
      pushTx({
        chainId,
        kind: "sent",
        counterparty: displayName.slice(0, 20) + (displayName.length > 20 ? "…" : ""),
        amountWei: value.toString(),
        tokenSymbol: selectedAsset.symbol,
        tokenAddress: selectedAsset.address,
        amount: amountFormatted,
        txHash: hash,
        stealthAddress,
      });
      const params = new URLSearchParams({ tx: hash });
      if (chainId != null) params.set("chainId", String(chainId));
      navigate(`/pay/success?${params.toString()}`, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  // User Not Found
  if (resolveStatus === "not_found") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <div className="card max-w-md w-full text-center border-neutral-800">
          <h1 className="text-xl font-semibold text-white mb-2">User Not Found</h1>
          <p className="text-neutral-500 text-sm mb-6">
            The identifier could not be resolved to a registered stealth meta-address. It may be invalid or the user may not have registered yet.
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (resolveStatus === "resolving" || resolveStatus === "idle") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden />
          <p className="text-sm text-neutral-500">Resolving recipient…</p>
        </div>
      </div>
    );
  }

  // Found: strict wallet connection — unconnected = connect CTA; connected = payment form
  const canSend = Boolean(address && chainId != null && config && resolvedMeta);
  const showConnectPrompt = !address;

  const recipientLabel = formatRecipientDisplay(displayName);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {showConnectPrompt ? (
          /* Default state: unconnected — minimal card, recipient, Encrypted Connection icon, Connect Wallet to Pay */
          <div className="card-glass text-center">
            <p className="text-neutral-500 text-sm mb-2">Pay</p>
            <p className="text-white font-mono text-lg mb-6 break-all">
              {recipientLabel}
            </p>
            <div className="flex justify-center mb-6" aria-hidden>
              <div
                className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5"
                title="Encrypted Connection"
              >
                <svg className="w-6 h-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
            </div>
            <button
              type="button"
              onClick={() => connect()}
              disabled={isConnecting}
              className="w-full py-3.5 px-4 rounded-lg text-base font-semibold btn-primary"
            >
              {isConnecting ? "Connecting…" : "Connect Wallet to Pay"}
            </button>
          </div>
        ) : (
          /* Post-connection: payment form with asset, amount, Max, Send Privately */
          <>
            <div className="card-glass space-y-4">
              <p className="text-neutral-500 text-sm">To</p>
              <p className="text-white font-mono text-base break-all">{recipientLabel}</p>
              <div>
                <label className="block text-sm text-neutral-500 mb-1.5">Asset</label>
                <select
                  value={selectedAsset.symbol}
                  onChange={(e) => {
                    const a = assets.find((x) => x.symbol === e.target.value);
                    if (a) setSelectedAsset(a);
                  }}
                  className="input-field w-full"
                >
                  {assets.map((a) => (
                    <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-neutral-500 mb-1.5">Amount ({selectedAsset.symbol})</label>
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 py-1 px-2 text-xs font-medium text-neutral-400 hover:text-white disabled:opacity-50"
                  >
                    MAX
                  </button>
                </div>
                {balanceLoading && <p className="mt-1.5 text-neutral-600 text-xs">Loading balance…</p>}
                {isInsufficientBalance && formattedMaxBalance != null && (
                  <p className="mt-1.5 text-red-400 text-xs">
                    Exceeds available balance ({formattedMaxBalance} {selectedAsset.symbol})
                  </p>
                )}
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="button"
                onClick={handleSendPrivately}
                disabled={sending || !canSend || isInsufficientBalance || !amount.trim()}
                className={`w-full py-3 px-4 rounded-lg text-sm font-medium btn-primary ${sending ? "loading" : ""}`}
              >
                {sending ? "Sending…" : "Send Privately"}
              </button>
            </div>
            <p className="mt-4 text-center">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-neutral-500 hover:text-neutral-400 text-sm"
              >
                ← Return to Home
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
