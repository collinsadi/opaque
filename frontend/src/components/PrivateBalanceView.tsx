import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, formatEther, hexToBytes, getAddress, isAddress } from "viem";
import { getAppChain } from "../lib/chain";
import { deployedAddresses } from "../contracts/deployedAddresses";
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

export type FoundTx = {
  id: string;
  address: string;
  balance: bigint;
  privateKey: string | undefined;
  txHash: string;
  blockNumber: number;
  timestamp?: number;
  /** Set to true after a successful claim so it no longer appears in active balance. */
  isSpent?: boolean;
};

/** Announcement event ABI matching StealthAddressAnnouncer.sol (indexed: schemeId, stealthAddress, caller). */
const ANNOUNCEMENT_EVENT = STEALTH_ANNOUNCER_ABI.find(
  (item): item is (typeof STEALTH_ANNOUNCER_ABI)[number] & { type: "event"; name: "Announcement" } =>
    item.type === "event" && item.name === "Announcement"
);
if (!ANNOUNCEMENT_EVENT) throw new Error("Announcement event not found in STEALTH_ANNOUNCER_ABI");

type FetchFoundTxsOpts = {
  publicClient: ReturnType<typeof createPublicClient>;
  wasm: OpaqueWasmModule | null;
  getMasterKeys: (() => MasterKeys) | null;
};

/** Parse view tag from announcement metadata (first byte of metadata bytes). */
function viewTagFromMetadata(metadata: string | undefined): number {
  if (!metadata || metadata.length < 2) return 0;
  return parseInt(metadata.slice(2, 4), 16);
}

/** Normalize hex string for viem (ensure 0x prefix). */
function toHexBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex : `0x${hex}`;
  return hexToBytes(normalized as `0x${string}`);
}

/** Fetch Announcement logs, filter by check_announcement (current wallet), then fetch balances and reconstruct keys for matches only. */
async function fetchFoundTxs(opts: FetchFoundTxsOpts): Promise<FoundTx[]> {
  const { publicClient, wasm, getMasterKeys } = opts;
  console.log("📥 [Opaque] PrivateBalance: fetchFoundTxs (getLogs)…");
  const announcerAddress = deployedAddresses.StealthAddressAnnouncer as `0x${string}`;

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

  // Mandatory: only show txs belonging to the connected wallet; require WASM + keys
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

      // 1) View-tag check first (skip expensive EC math when tag doesn't match)
      const viewTagResult = wasm.check_announcement_view_tag_wasm(
        row.viewTag,
        viewPrivKey,
        ephemeralPubKey
      );
      if (viewTagResult === "NoMatch") continue;

      // 2) Full check: announcement belongs to this wallet
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
      privateKey,
      txHash: row.txHash,
      blockNumber: row.blockNumber,
      isSpent: false,
    };
  });

  const totalBalance = found.reduce((sum, tx) => sum + tx.balance, 0n);
  console.log("📥 [Opaque] PrivateBalance: fetchFoundTxs done", {
    count: found.length,
    totalBalanceWei: totalBalance.toString(),
    totalBalanceEth: formatEther(totalBalance),
  });

  return found;
}

/** Real chain status: current block from RPC (no mock block height). */
async function fetchScanningStatus(): Promise<{
  scanning: boolean;
  progressPercent: number;
  lastBlock: number;
  message?: string;
}> {
  console.log("📥 [Opaque] PrivateBalance: fetchScanningStatus…");
  const chain = getAppChain();
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

export function PrivateBalanceView() {
  const [found, setFound] = useState<FoundTx[]>([]);
  const [scanning, setScanning] = useState(true);
  const [progressPercent, setProgressPercent] = useState(0);
  const [lastBlock, setLastBlock] = useState<number>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showKeyId, setShowKeyId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [withdrawalSteps, setWithdrawalSteps] = useState<ProtocolStep[]>([]);
  const [destinationByTxId, setDestinationByTxId] = useState<Record<string, string>>({});
  const [newlyDetectedIds, setNewlyDetectedIds] = useState<string[]>([]);
  const [claimModalTx, setClaimModalTx] = useState<FoundTx | null>(null);
  const { wasm, isReady: wasmReady } = useOpaqueWasm();
  const keysContext = useKeys();
  const { address: mainWalletAddress } = useWallet();
  const { push: logPush } = useProtocolLog();

  const setDestination = useCallback((txId: string, value: string) => {
    setDestinationByTxId((prev) => ({ ...prev, [txId]: value }));
  }, []);

  const activeTxs = found.filter((tx) => !tx.isSpent);

  function copyPrivateKey(key: string) {
    navigator.clipboard.writeText(key);
  }

  const handleClaim = useCallback(
    async (tx: FoundTx, destination: string) => {
      const trimmed = destination.trim();
      if (!tx.privateKey || tx.balance <= 0n) return;
      if (!trimmed) {
        setClaimError("Please enter a destination address.");
        return;
      }
      if (!isAddress(trimmed)) {
        setClaimError("Invalid destination address.");
        return;
      }
      const chain = getAppChain();
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
      logPush("blockchain", `Claim: ${formatEther(tx.balance)} ETH → ${trimmed.slice(0, 10)}…`);
      const onStatus = (s: { tag: string; label: string; detail?: string }) => {
        setWithdrawalSteps((prev) => {
          const next = [...prev];
          if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], status: "ok" };
          const status: ProtocolStep["status"] = s.tag === "DONE" ? "done" : "wait";
          return next.concat([
            { id: `wd-${Date.now()}-${prev.length}`, status, label: `[ ${s.tag} ] ${s.label}`, detail: s.detail },
          ]);
        });
      };
      try {
        await executeStealthWithdrawal(
          tx.privateKey as `0x${string}`,
          getAddress(trimmed),
          publicClient,
          onStatus
        );
        setFound((prev) =>
          prev.map((t) => (t.id === tx.id ? { ...t, isSpent: true } : t))
        );
        setClaimModalTx((prev) => (prev?.id === tx.id ? null : prev));
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
    []
  );

  useEffect(() => {
    // Do not run any logic that may call WASM until the module is ready
    if (!wasmReady || wasm === null) {
      return;
    }

    let cancelled = false;
    const chain = getAppChain();
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

    logPush("blockchain", "Fetching announcement logs (getLogs)…");
    console.log("📥 [Opaque] PrivateBalance: loading data…");
    (async () => {
      setLoading(true);
      try {
        const [txs, status] = await Promise.all([
          fetchFoundTxs({ publicClient, wasm, getMasterKeys }),
          fetchScanningStatus(),
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
        console.log("📥 [Opaque] PrivateBalance: loaded ✅", { txsCount: txs.length, scanning: status.scanning });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wasmReady, wasm, keysContext.isSetup]);

  useEffect(() => {
    if (newlyDetectedIds.length === 0) return;
    const t = setTimeout(() => setNewlyDetectedIds([]), 2200);
    return () => clearTimeout(t);
  }, [newlyDetectedIds]);

  return (
    <div className="glass-card max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-slate-200 mb-1">
        Private balance
      </h2>
      <p className="text-sm text-slate-400 mb-6">
        Stealth transactions found for your viewing key. Data is provided by the Opaque Cash indexer.
      </p>

      {/* Scanning status — pulse when scanning, block counter */}
      <div
        className={`mb-6 p-4 rounded-xl bg-slate/80 border border-frost-border transition-all ${
          scanning ? "scanner-pulse" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm text-slate-300 font-mono">
            {scanning ? "Scanning" : "Idle"}
          </span>
          <span className="text-cyan text-sm font-mono">
            {lastBlock > 0
              ? `Block 0 / ${lastBlock.toLocaleString()}`
              : scanning
                ? "…"
                : "—"}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-charcoal overflow-hidden">
          <div
            className="h-full bg-cyan/70 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {(message || (lastBlock > 0 && scanning)) && (
          <p className="text-slate-500 text-xs mt-2 font-mono">
            {scanning && lastBlock > 0
              ? `Scanning block 0 … ${lastBlock.toLocaleString()}`
              : message ?? ""}
          </p>
        )}
      </div>

      {/* List of found txs — only after WASM is ready */}
      {!wasmReady ? (
        <p className="text-slate-500 text-sm">Initializing cryptography…</p>
      ) : loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : activeTxs.length === 0 ? (
        <div className="rounded-xl bg-slate/80 border border-frost-border p-4">
          <p className="text-slate-300 text-sm">
            Scanning for incoming private payments…
          </p>
          <p className="text-slate-500 text-xs mt-1">
            Payments sent to your stealth address will appear here. Only transactions belonging to your connected wallet are shown.
          </p>
        </div>
      ) : (
        <>
          {claimError && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-500/50 text-red-200 text-sm">
              {claimError}
            </div>
          )}
          <ul className="space-y-3">
            {activeTxs.map((tx) => {
              const isNewDetection = newlyDetectedIds.includes(tx.id);
              return (
              <li
                key={tx.id}
                className={`p-4 rounded-xl font-mono text-sm border ${
                  tx.balance > 0n
                    ? "bg-emerald-950/40 border-emerald-500/50"
                    : "bg-charcoal/80 border-frost-border"
                } ${isNewDetection ? "slide-in-decrypted detection-flash" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan/20 text-cyan border border-cyan/40">
                    Found
                  </span>
                  {isNewDetection && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">
                      Decrypted
                    </span>
                  )}
                  <span className="text-slate-500 text-xs">
                    Block #{tx.blockNumber}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-cyan break-all">{tx.address}</span>
                  <span className="text-emerald-400 font-semibold shrink-0">
                    {formatEther(tx.balance)} ETH
                  </span>
                </div>
                <div className="text-slate-500 text-xs mt-1 break-all">
                  {tx.txHash}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {tx.privateKey != null && (
                    <>
                      {showKeyId === tx.id ? (
                        <>
                          <span className="text-slate-400 text-xs break-all max-w-48 truncate">
                            {tx.privateKey}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyPrivateKey(tx.privateKey!)}
                            className="px-2 py-1 text-xs rounded bg-charcoal text-cyan border border-frost-border hover:border-cyan/70"
                          >
                            Copy Private Key
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowKeyId(null)}
                            className="px-2 py-1 text-xs rounded bg-charcoal text-slate-400 border border-frost-border hover:text-slate-200"
                          >
                            Hide
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowKeyId(tx.id)}
                          className="px-2 py-1 text-xs rounded bg-charcoal text-amber-400 border border-amber-500/50 hover:border-amber-400/70"
                        >
                          Show
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  <label className="block text-slate-400 text-xs">Destination address</label>
                  <input
                    type="text"
                    value={destinationByTxId[tx.id] ?? ""}
                    onChange={(e) => setDestination(tx.id, e.target.value)}
                    placeholder="0x… (use a fresh address for privacy)"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-charcoal border border-frost-border text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan/50"
                  />
                  {mainWalletAddress && (() => {
                    const dest = (destinationByTxId[tx.id] ?? "").trim();
                    if (!dest || !isAddress(dest)) return null;
                    try {
                      if (getAddress(dest) !== getAddress(mainWalletAddress)) return null;
                    } catch {
                      return null;
                    }
                    return (
                      <p className="text-amber-400 text-xs">
                        Sending to your connected wallet will link your identity to this stealth transaction.
                      </p>
                    );
                  })()}
                  <div className="flex flex-wrap items-center gap-2">
                    {mainWalletAddress && (
                      <button
                        type="button"
                        onClick={() => setDestination(tx.id, mainWalletAddress)}
                        className="px-2 py-1 text-xs rounded bg-charcoal text-slate-400 border border-frost-border hover:text-slate-200"
                      >
                        Use connected wallet
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={
                        tx.balance <= 0n ||
                        !(destinationByTxId[tx.id] ?? "").trim() ||
                        !isAddress((destinationByTxId[tx.id] ?? "").trim()) ||
                        claimingId !== null
                      }
                      onClick={() => setClaimModalTx(tx)}
                      className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 text-white border border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-emerald-500"
                    >
                      {claimingId === tx.id ? "Claiming…" : "Claim"}
                    </button>
                  </div>
                </div>
              </li>
            );
            })}
          </ul>
        </>
      )}

      {claimModalTx && (
        <ClaimModal
          tx={claimModalTx}
          destination={destinationByTxId[claimModalTx.id] ?? ""}
          mainWalletAddress={mainWalletAddress ?? undefined}
          claiming={claimingId === claimModalTx.id}
          error={claimError}
          onDestinationChange={(value: string) => setDestination(claimModalTx.id, value)}
          onConfirm={() => handleClaim(claimModalTx, destinationByTxId[claimModalTx.id] ?? "")}
          onClose={() => {
            setClaimModalTx(null);
            setClaimError(null);
            setWithdrawalSteps([]);
          }}
          withdrawalSteps={withdrawalSteps}
        />
      )}
    </div>
  );
}
