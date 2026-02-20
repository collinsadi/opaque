import { useState, useEffect, useCallback, useMemo } from "react";
import { createPublicClient, http, formatEther, hexToBytes, getAddress, isAddress } from "viem";
import { getChain } from "../lib/chain";
import { getConfigForChain } from "../contracts/contract-config";
import { STEALTH_ANNOUNCER_ABI } from "../lib/contracts";
import { useOpaqueWasm } from "../hooks/useOpaqueWasm";
import { useKeys } from "../context/KeysContext";
import { useWallet } from "../hooks/useWallet";
import { executeStealthWithdrawal } from "../lib/stealthLifecycle";
import type { MasterKeys } from "../lib/stealthLifecycle";
import type { ProtocolStep } from "./ProtocolStepper";
import type { OpaqueWasmModule } from "../hooks/useOpaqueWasm";
import { ClaimModal } from "./ClaimModal";
import { useProtocolLog } from "../context/ProtocolLogContext";
import { useTxHistoryStore } from "../store/txHistoryStore";
import { useGhostAddressStore } from "../store/ghostAddressStore";
import { secp256k1 } from "@noble/curves/secp256k1";
import { getTokensForChain, ERC20_BALANCE_ABI } from "../lib/tokens";
import type { TokenInfo } from "../lib/tokens";
import { executeTokenWithdrawal } from "../lib/stealthLifecycle";

export type FoundTx = {
  id: string;
  address: string;
  balance: bigint;
  /** Token contract address -> raw balance (for ERC20) */
  tokenBalances: Record<string, bigint>;
  privateKey: string | undefined;
  txHash: string;
  blockNumber: number;
  timestamp?: number;
  isSpent?: boolean;
};

const ANNOUNCEMENT_EVENT = STEALTH_ANNOUNCER_ABI.find(
  (item): item is (typeof STEALTH_ANNOUNCER_ABI)[number] & { type: "event"; name: "Announcement" } =>
    item.type === "event" && item.name === "Announcement"
);
if (!ANNOUNCEMENT_EVENT) throw new Error("Announcement event not found in STEALTH_ANNOUNCER_ABI");

type FetchFoundTxsOpts = {
  publicClient: ReturnType<typeof createPublicClient>;
  announcerAddress: `0x${string}`;
  wasm: OpaqueWasmModule | null;
  getMasterKeys: (() => MasterKeys) | null;
  chainId: number;
};

function viewTagFromMetadata(metadata: string | undefined): number {
  if (!metadata || metadata.length < 2) return 0;
  return parseInt(metadata.slice(2, 4), 16);
}

function toHexBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex : `0x${hex}`;
  return hexToBytes(normalized as `0x${string}`);
}

async function fetchFoundTxs(opts: FetchFoundTxsOpts): Promise<FoundTx[]> {
  const { publicClient, announcerAddress, wasm, getMasterKeys } = opts;
  console.log("📥 [Opaque] PrivateBalance: fetchFoundTxs (getLogs)…");

  const rawLogs = await publicClient.getLogs({
    address: announcerAddress,
    event: ANNOUNCEMENT_EVENT,
    fromBlock: 0n,
    toBlock: "latest",
  });

  console.log("📥 [Opaque] PrivateBalance: getLogs raw result", {
    count: rawLogs.length,
    logs: rawLogs,
  });

  type LogWithArgs = (typeof rawLogs)[number] & {
    args?: { stealthAddress?: string; ephemeralPubKey?: string; metadata?: string };
  };
  type LogRow = {
    id: string;
    stealthAddress: string;
    ephemeralPubKeyHex: string | undefined;
    viewTag: number;
    blockNumber: number;
    txHash: string;
  };
  const rows: LogRow[] = rawLogs.map((log: LogWithArgs, i) => {
    const args = log.args;
    return {
      id: `${log.transactionHash}-${log.logIndex ?? i}`,
      stealthAddress: args?.stealthAddress ?? "",
      ephemeralPubKeyHex: typeof args?.ephemeralPubKey === "string" ? args.ephemeralPubKey : undefined,
      viewTag: viewTagFromMetadata(typeof args?.metadata === "string" ? args.metadata : undefined),
      blockNumber: Number(log.blockNumber ?? 0),
      txHash: log.transactionHash ?? "",
    };
  });

  if (!wasm || !getMasterKeys) {
    console.log("📥 [Opaque] PrivateBalance: no WASM or keys, returning no owned txs");
    return [];
  }
  let masterKeys: MasterKeys;
  try {
    masterKeys = getMasterKeys();
  } catch {
    console.log("📥 [Opaque] PrivateBalance: keys not set, returning no owned txs");
    return [];
  }

  const { viewPrivKey, spendPubKey } = masterKeys;
  const matched: LogRow[] = [];

  for (const row of rows) {
    try {
      if (!row.stealthAddress || !row.ephemeralPubKeyHex) continue;
      const ephemeralPubKey = toHexBytes(row.ephemeralPubKeyHex);
      if (ephemeralPubKey.length !== 33) continue;

      const viewTagResult = wasm.check_announcement_view_tag_wasm(
        row.viewTag,
        viewPrivKey,
        ephemeralPubKey
      );
      if (viewTagResult === "NoMatch") continue;

      const stealthAddressNormalized = getAddress(row.stealthAddress);
      let isOurs: boolean;
      try {
        isOurs = wasm.check_announcement_wasm(
          stealthAddressNormalized,
          row.viewTag,
          viewPrivKey,
          spendPubKey,
          ephemeralPubKey
        );
      } catch {
        isOurs = false;
      }
      if (!isOurs) continue;

      console.log("🎯 [Opaque] Match found for address:", row.stealthAddress);
      matched.push(row);
    } catch (err) {
      console.warn("🔑 [Opaque] Skipping malformed log:", row.id, err);
    }
  }

  const matchedAddresses = matched.map((r) => r.stealthAddress as `0x${string}`);
  const balances = await Promise.all(
    matchedAddresses.map((addr) => publicClient.getBalance({ address: addr }))
  );

  const { tokens } = getTokensForChain(opts.chainId);
  const found: FoundTx[] = matched.map((row, i) => {
    const balance = balances[i] ?? 0n;
    let privateKey: string | undefined;
    if (wasm && masterKeys && row.ephemeralPubKeyHex) {
      try {
        const ephemeralPubKey = toHexBytes(row.ephemeralPubKeyHex);
        if (ephemeralPubKey.length === 33) {
          const stealthPrivKeyBytes = wasm.reconstruct_signing_key_wasm(
            masterKeys.spendPrivKey,
            masterKeys.viewPrivKey,
            ephemeralPubKey
          );
          privateKey =
            "0x" +
            Array.from(stealthPrivKeyBytes)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
          console.log("🔑 [Opaque] Key Found:", privateKey);
        }
      } catch (err) {
        console.warn("🔑 [Opaque] Key reconstruction failed for", row.stealthAddress, err);
      }
    }
    return {
      id: row.id,
      address: row.stealthAddress,
      balance,
      tokenBalances: {},
      privateKey,
      txHash: row.txHash,
      blockNumber: row.blockNumber,
      isSpent: false,
    };
  });

  for (const tx of found) {
    for (const t of tokens) {
      if (!t.address || t.address === "0x0000000000000000000000000000000000000000") continue;
      try {
        const raw = await opts.publicClient.readContract({
          address: t.address,
          abi: ERC20_BALANCE_ABI as readonly unknown[],
          functionName: "balanceOf",
          args: [tx.address as `0x${string}`],
        });
        const balance = typeof raw === "bigint" ? raw : BigInt(String(raw));
        if (balance > 0n) tx.tokenBalances[t.address] = balance;
      } catch {
        // token not deployed or RPC error
      }
    }
  }

  const totalBalance = found.reduce((sum, tx) => sum + tx.balance, 0n);
  console.log("📥 [Opaque] PrivateBalance: fetchFoundTxs done", {
    count: found.length,
    totalBalanceWei: totalBalance.toString(),
    totalBalanceEth: formatEther(totalBalance),
  });

  return found;
}

async function fetchScanningStatus(chainId: number): Promise<{
  scanning: boolean;
  progressPercent: number;
  lastBlock: number;
  message?: string;
}> {
  console.log("📥 [Opaque] PrivateBalance: fetchScanningStatus…");
  const chain = getChain(chainId);
  const rpcUrl = chain.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) {
    return { scanning: false, progressPercent: 0, lastBlock: 0, message: "No RPC URL" };
  }
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  const lastBlock = await publicClient.getBlockNumber();
  const status = {
    scanning: true,
    progressPercent: 100,
    lastBlock: Number(lastBlock),
    message: "Scanning announcements…",
  };
  console.log("📥 [Opaque] PrivateBalance: scanning status", status);
  return status;
}

export type PortfolioEntry = { tx: FoundTx; balanceRaw: bigint };

export function PrivateBalanceView() {
  const [found, setFound] = useState<FoundTx[]>([]);
  const [scanning, setScanning] = useState(true);
  const [progressPercent, setProgressPercent] = useState(0);
  const [lastBlock, setLastBlock] = useState<number>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [withdrawalSteps, setWithdrawalSteps] = useState<ProtocolStep[]>([]);
  const [destinationByTxId, setDestinationByTxId] = useState<Record<string, string>>({});
  const [newlyDetectedIds, setNewlyDetectedIds] = useState<string[]>([]);
  const [claimModalTx, setClaimModalTx] = useState<FoundTx | null>(null);
  const [claimAsset, setClaimAsset] = useState<TokenInfo | null>(null);
  const [ghostTxs, setGhostTxs] = useState<FoundTx[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<TokenInfo | null>(null);
  const { wasm, isReady: wasmReady } = useOpaqueWasm();
  const keysContext = useKeys();
  const { address: mainWalletAddress, chainId } = useWallet();
  const currentConfig = getConfigForChain(chainId);
  const { push: logPush } = useProtocolLog();
  const pushTx = useTxHistoryStore((s) => s.push);
  const chain = chainId != null ? getChain(chainId) : null;
  const removeGhost = useGhostAddressStore((s) => s.remove);

  const { native, tokens } =
    chainId != null ? getTokensForChain(chainId) : { native: { symbol: "ETH", name: "Ether", decimals: 18, address: null }, tokens: [] as TokenInfo[] };
  const allAssets = useMemo(() => [native, ...tokens], [native, tokens]);

  const portfolio = useMemo(() => {
    const activeTxs = [...found.filter((tx) => !tx.isSpent), ...ghostTxs];
    const result: { asset: TokenInfo; totalRaw: bigint; entries: PortfolioEntry[] }[] = [];
    for (const asset of allAssets) {
      let totalRaw = 0n;
      const entries: PortfolioEntry[] = [];
      for (const tx of activeTxs) {
        const balanceRaw = asset.address === null
          ? tx.balance
          : (tx.tokenBalances[asset.address] ?? 0n);
        if (balanceRaw > 0n) {
          totalRaw += balanceRaw;
          entries.push({ tx, balanceRaw });
        }
      }
      if (totalRaw > 0n || entries.length === 0) {
        result.push({ asset, totalRaw, entries });
      }
    }
    return result;
  }, [found, ghostTxs, allAssets]);

  const setDestination = useCallback((txId: string, value: string) => {
    setDestinationByTxId((prev) => ({ ...prev, [txId]: value }));
  }, []);

  const handleClaim = useCallback(
    async (tx: FoundTx, destination: string, asset: TokenInfo) => {
      const trimmed = destination.trim();
      if (!tx.privateKey) return;
      if (!chain || chainId == null) {
        setClaimError("Unsupported network.");
        return;
      }
      const isNative = asset.address === null;
      const amountRaw = isNative ? tx.balance : (tx.tokenBalances[asset.address!] ?? 0n);
      if (amountRaw <= 0n) return;
      if (!trimmed) {
        setClaimError("Please enter a destination address.");
        return;
      }
      if (!isAddress(trimmed)) {
        setClaimError("Invalid destination address.");
        return;
      }
      const rpcUrl = chain.rpcUrls?.default?.http?.[0];
      if (!rpcUrl) {
        setClaimError("No RPC URL configured.");
        return;
      }
      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });
      setClaimingId(tx.id);
      setClaimError(null);
      setWithdrawalSteps([]);
      logPush("wasm", "Reconstructing stealth key and signing claim tx…");
      const amountStr = isNative
        ? formatEther(amountRaw)
        : (Number(amountRaw) / 10 ** asset.decimals).toFixed(asset.decimals);
      logPush("blockchain", `Claim: ${amountStr} ${asset.symbol} → ${trimmed.slice(0, 10)}…`);
      let step3Label = `[Step 3] Sweeping to Destination`;
      const onStatus = (s: { tag: string; label: string; detail?: string }) => {
        if (s.detail?.includes("Sending ")) {
          const m = s.detail.match(/Sending ([\d.]+)/);
          if (m) step3Label = `[Step 3] Sweeping ${m[1]} ${asset.symbol} to Destination`;
        }
        setWithdrawalSteps((prev) => {
          const steps: ProtocolStep[] =
            prev.length >= 3
              ? [...prev]
              : [
                  { id: "wd-1", status: "wait", label: "[Step 1] Reconstructing key…" },
                  { id: "wd-2", status: "wait", label: "[Step 2] Estimating Gas…" },
                  { id: "wd-3", status: "wait", label: "[Step 3] Sweeping … to Destination" },
                ];
          if (s.label.includes("Reconstructing")) steps[0] = { ...steps[0], status: "ok" };
          if (s.label.includes("Estimating") || s.label.includes("gas")) {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
          }
          if (s.tag === "SIGN" || s.tag === "SEND") {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
            steps[2] = { ...steps[2], label: step3Label };
          }
          if (s.tag === "DONE") {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
            steps[2] = { ...steps[2], status: "done", label: step3Label };
          }
          return steps;
        });
      };
      try {
        if (isNative) {
          await executeStealthWithdrawal(
            tx.privateKey as `0x${string}`,
            getAddress(trimmed),
            publicClient,
            onStatus
          );
        } else {
          await executeTokenWithdrawal(
            tx.privateKey as `0x${string}`,
            asset.address!,
            getAddress(trimmed),
            publicClient,
            onStatus
          );
          setFound((prev) =>
            prev.map((t) =>
              t.id === tx.id
                ? { ...t, tokenBalances: { ...t.tokenBalances, [asset.address!]: 0n } }
                : t
            )
          );
          setGhostTxs((prev) =>
            prev.map((t) =>
              t.id === tx.id
                ? { ...t, tokenBalances: { ...t.tokenBalances, [asset.address!]: 0n } }
                : t
            )
          );
        }
        const isGhost = tx.id.startsWith("ghost-");
        pushTx({
          chainId,
          kind: isGhost ? "ghost" : "received",
          counterparty: isGhost ? "Manual Ghost" : tx.address.slice(0, 10) + "…",
          amountWei: amountRaw.toString(),
          txHash: undefined,
          stealthAddress: tx.address,
        });
        if (isGhost && isNative) {
          removeGhost(tx.address, chainId);
          setGhostTxs((prev) => prev.filter((t) => t.id !== tx.id));
        } else if (isNative) {
          setFound((prev) =>
            prev.map((t) => (t.id === tx.id ? { ...t, isSpent: true } : t))
          );
        }
        setClaimModalTx((prev) => (prev?.id === tx.id ? null : prev));
        setClaimAsset(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setClaimError(msg);
        setWithdrawalSteps((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          return prev.slice(0, -1).concat([{ ...last, status: "error" as const, detail: msg }]);
        });
      } finally {
        setClaimingId(null);
      }
    },
    [chainId, chain, pushTx, removeGhost]
  );

  useEffect(() => {
    if (!wasmReady || wasm === null || chainId == null || !currentConfig || !chain) {
      if (chainId == null || !currentConfig) setLoading(false);
      return;
    }

    let cancelled = false;
    const rpcUrl = chain.rpcUrls?.default?.http?.[0];
    if (!rpcUrl) {
      setLoading(false);
      return;
    }
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const getMasterKeys = keysContext.isSetup ? keysContext.getMasterKeys : null;
    const announcerAddress = currentConfig.announcer as `0x${string}`;

    logPush("blockchain", "Fetching announcement logs (getLogs)…");
    console.log("📥 [Opaque] PrivateBalance: loading data…");
    (async () => {
      setLoading(true);
      try {
        const [txs, status] = await Promise.all([
          fetchFoundTxs({ publicClient, announcerAddress, wasm, getMasterKeys, chainId }),
          fetchScanningStatus(chainId),
        ]);
        if (cancelled) return;
        setLastBlock(status.lastBlock);
        setFound((prev) => {
          const prevIds = new Set(prev.map((t) => t.id));
          const newIds = txs.filter((t) => !prevIds.has(t.id)).map((t) => t.id);
          if (newIds.length > 0) setNewlyDetectedIds((old) => [...old, ...newIds]);
          return txs;
        });
        setScanning(status.scanning);
        setProgressPercent(status.progressPercent);
        setMessage(status.message ?? null);
        logPush("wasm", `Scan complete: ${txs.length} owned announcement(s), block ${status.lastBlock}`);

        const ghostEntries = useGhostAddressStore.getState().getForChain(chainId);
        let ghostFound: FoundTx[] = [];
        if (wasm && getMasterKeys && ghostEntries.length > 0) {
          let masterKeys: MasterKeys | null = null;
          try {
            masterKeys = getMasterKeys();
          } catch {
            // keys not available
          }
          if (masterKeys) {
            for (const g of ghostEntries) {
              const balance = await publicClient.getBalance({ address: g.stealthAddress });
              if (balance === 0n) continue;
              const ephemeralPubKey = secp256k1.getPublicKey(toHexBytes(g.ephemeralPrivKeyHex), true);
              const stealthPrivKeyBytes = wasm.reconstruct_signing_key_wasm(
                masterKeys.spendPrivKey,
                masterKeys.viewPrivKey,
                ephemeralPubKey
              );
              const privateKey =
                "0x" +
                Array.from(stealthPrivKeyBytes)
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join("");
              const ghostTx: FoundTx = {
                id: `ghost-${g.stealthAddress}`,
                address: g.stealthAddress,
                balance,
                tokenBalances: {},
                privateKey,
                txHash: "",
                blockNumber: 0,
                isSpent: false,
              };
              const { tokens: ghostTokens } = getTokensForChain(chainId);
              for (const t of ghostTokens) {
                if (!t.address || t.address === "0x0000000000000000000000000000000000000000") continue;
                try {
                  const raw = await publicClient.readContract({
                    address: t.address,
                    abi: ERC20_BALANCE_ABI as readonly unknown[],
                    functionName: "balanceOf",
                    args: [g.stealthAddress as `0x${string}`],
                  });
                  const balance = typeof raw === "bigint" ? raw : BigInt(String(raw));
                  if (balance > 0n) ghostTx.tokenBalances[t.address] = balance;
                } catch {
                  /* ignore */
                }
              }
              ghostFound.push(ghostTx);
            }
          }
        }
        if (!cancelled) setGhostTxs(ghostFound);
        console.log("📥 [Opaque] PrivateBalance: loaded ✅", { txsCount: txs.length, ghostCount: ghostFound.length, scanning: status.scanning });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wasmReady, wasm, keysContext.isSetup, chainId, currentConfig, chain]);

  useEffect(() => {
    if (newlyDetectedIds.length === 0) return;
    const t = setTimeout(() => setNewlyDetectedIds([]), 2200);
    return () => clearTimeout(t);
  }, [newlyDetectedIds]);

  return (
    <div className="w-full h-full min-h-[calc(100vh-8rem)] flex flex-col">
      {/* Header card - full width */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">
          Portfolio
        </h2>
        <p className="text-sm text-neutral-500 mb-6">
          Total assets (ETH, USDC, USDT) across your stealth addresses. Click an asset to see addresses and withdraw.
        </p>

        {/* Scanning status */}
        <div
          className={`p-4 rounded-lg bg-neutral-900 border border-border ${
            scanning ? "scanner-pulse" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm text-neutral-400 font-mono">
              {scanning ? "Scanning" : "Idle"}
            </span>
            <span className="text-neutral-300 text-sm font-mono">
              {lastBlock > 0
                ? `Block ${lastBlock.toLocaleString()}`
                : scanning
                  ? "…"
                  : "—"}
            </span>
          </div>
          <div className="h-1 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-neutral-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {(message || (lastBlock > 0 && scanning)) && (
            <p className="text-neutral-600 text-xs mt-2 font-mono">
              {scanning && lastBlock > 0
                ? `Scanning block 0 … ${lastBlock.toLocaleString()}`
                : message ?? ""}
            </p>
          )}
        </div>
      </div>

      {/* Global claim error - full width */}
      {claimError && (
        <div className="mb-4 p-3 rounded-lg bg-neutral-900 border border-error/30 text-error text-sm">
          {claimError}
        </div>
      )}

      {/* Content: loading / empty / portfolio (Level 1) or drill-down (Level 2) */}
      {!wasmReady ? (
        <div className="card max-w-md">
          <p className="text-neutral-600 text-sm">Initializing cryptography…</p>
        </div>
      ) : loading ? (
        <div className="card max-w-md">
          <p className="text-neutral-600 text-sm">Loading…</p>
        </div>
      ) : portfolio.length === 0 || portfolio.every((p) => p.totalRaw === 0n) ? (
        <div className="card max-w-md">
          <p className="text-neutral-400 text-sm">
            No incoming payments found yet.
          </p>
          <p className="text-neutral-600 text-xs mt-1">
            Payments sent to your stealth address will appear here.
          </p>
        </div>
      ) : selectedAsset ? (
        /* Level 2: Drill-down — list of stealth addresses holding this asset */
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSelectedAsset(null)}
            className="text-sm text-neutral-500 hover:text-neutral-300"
          >
            ← Back to portfolio
          </button>
          <h3 className="text-lg font-semibold text-white">
            {selectedAsset.symbol} — Stealth addresses
          </h3>
          <div className="space-y-3">
            {portfolio
              .find((p) => p.asset.symbol === selectedAsset.symbol)
              ?.entries.filter((e) => e.balanceRaw > 0n)
              .map(({ tx, balanceRaw }) => {
                const amountStr =
                  selectedAsset.address === null
                    ? formatEther(balanceRaw)
                    : (Number(balanceRaw) / 10 ** selectedAsset.decimals).toFixed(selectedAsset.decimals);
                return (
                  <div
                    key={tx.id}
                    className="card flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-neutral-400 font-mono text-xs truncate">
                        {tx.address}
                      </p>
                      <p className="text-success font-semibold mt-0.5">
                        {amountStr} {selectedAsset.symbol}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={
                        !(destinationByTxId[tx.id] ?? "").trim() ||
                        !isAddress((destinationByTxId[tx.id] ?? "").trim()) ||
                        claimingId !== null
                      }
                      onClick={() => {
                        setClaimModalTx(tx);
                        setClaimAsset(selectedAsset);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-white text-black disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-85"
                    >
                      {claimingId === tx.id ? "Withdrawing…" : "Withdraw"}
                    </button>
                    <div className="w-full mt-2">
                      <input
                        type="text"
                        value={destinationByTxId[tx.id] ?? ""}
                        onChange={(e) => setDestination(tx.id, e.target.value)}
                        placeholder="Destination 0x…"
                        className="input-field text-sm"
                      />
                      {mainWalletAddress && (
                        <button
                          type="button"
                          onClick={() => setDestination(tx.id, mainWalletAddress)}
                          className="mt-1.5 px-2 py-1 text-xs rounded-md btn-secondary"
                        >
                          Use connected wallet
                        </button>
                      )}
                    </div>
                  </div>
                );
              }) ?? null}
          </div>
        </div>
      ) : (
        /* Level 1: Portfolio cards — total per asset */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolio
            .filter((p) => p.totalRaw > 0n)
            .map((p) => {
              const amountStr =
                p.asset.address === null
                  ? formatEther(p.totalRaw)
                  : (Number(p.totalRaw) / 10 ** p.asset.decimals).toFixed(p.asset.decimals);
              return (
                <button
                  key={p.asset.symbol}
                  type="button"
                  onClick={() => setSelectedAsset(p.asset)}
                  className="card text-left hover:border-neutral-600 transition-colors"
                >
                  <p className="text-neutral-500 text-sm">{p.asset.symbol}</p>
                  <p className="text-xl font-semibold text-white mt-1">
                    {amountStr}
                  </p>
                  <p className="text-neutral-600 text-xs mt-1">
                    {p.entries.length} address{p.entries.length !== 1 ? "es" : ""}
                  </p>
                </button>
              );
            })}
        </div>
      )}


      {claimModalTx && claimAsset && (
        <ClaimModal
          tx={claimModalTx}
          asset={claimAsset}
          destination={destinationByTxId[claimModalTx.id] ?? ""}
          mainWalletAddress={mainWalletAddress ?? undefined}
          claiming={claimingId === claimModalTx.id}
          error={claimError}
          onDestinationChange={(value: string) => setDestination(claimModalTx.id, value)}
          onConfirm={() =>
            handleClaim(claimModalTx, destinationByTxId[claimModalTx.id] ?? "", claimAsset)
          }
          onClose={() => {
            setClaimModalTx(null);
            setClaimAsset(null);
            setClaimError(null);
            setWithdrawalSteps([]);
          }}
          withdrawalSteps={withdrawalSteps}
        />
      )}
    </div>
  );
}
