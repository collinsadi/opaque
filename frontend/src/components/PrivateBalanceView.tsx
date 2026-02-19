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
import { useTxHistoryStore } from "../store/txHistoryStore";
import { useGhostAddressStore } from "../store/ghostAddressStore";
import { secp256k1 } from "@noble/curves/secp256k1";

export type FoundTx = {
  id: string;
  address: string;
  balance: bigint;
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
  wasm: OpaqueWasmModule | null;
  getMasterKeys: (() => MasterKeys) | null;
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
  const [ghostTxs, setGhostTxs] = useState<FoundTx[]>([]);
  const { wasm, isReady: wasmReady } = useOpaqueWasm();
  const keysContext = useKeys();
  const { address: mainWalletAddress } = useWallet();
  const { push: logPush } = useProtocolLog();
  const pushTx = useTxHistoryStore((s) => s.push);
  const chainId = getAppChain().id;
  const removeGhost = useGhostAddressStore((s) => s.remove);

  const setDestination = useCallback((txId: string, value: string) => {
    setDestinationByTxId((prev) => ({ ...prev, [txId]: value }));
  }, []);

  const activeTxs = [...found.filter((tx) => !tx.isSpent), ...ghostTxs];

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
      let step3Amount: string | null = null;
      const onStatus = (s: { tag: string; label: string; detail?: string }) => {
        if (s.detail?.includes("Sending ") && s.detail?.includes(" ETH ")) {
          const m = s.detail.match(/Sending ([\d.]+) ETH/);
          if (m) step3Amount = m[1];
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
          if (s.label.includes("Reconstructing")) {
            steps[0] = { ...steps[0], status: "ok" };
          }
          if (s.label.includes("Estimating") || s.label.includes("gas")) {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
          }
          if (step3Amount != null) {
            steps[2] = {
              ...steps[2],
              label: `[Step 3] Sweeping ${step3Amount} ETH to Destination`,
              status: steps[2].status,
            };
          }
          if (s.tag === "SIGN" || s.tag === "SEND") {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
          }
          if (s.tag === "DONE") {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
            steps[2] = {
              ...steps[2],
              status: "done",
              label: step3Amount
                ? `[Step 3] Sweeping ${step3Amount} ETH to Destination`
                : "[Step 3] Sweeping to Destination",
            };
          }
          return steps;
        });
      };
      try {
        await executeStealthWithdrawal(
          tx.privateKey as `0x${string}`,
          getAddress(trimmed),
          publicClient,
          onStatus
        );
        const isGhost = tx.id.startsWith("ghost-");
        pushTx({
          chainId,
          kind: isGhost ? "ghost" : "received",
          counterparty: isGhost ? "Manual Ghost" : tx.address.slice(0, 10) + "…",
          amountWei: tx.balance.toString(),
          txHash: undefined,
          stealthAddress: tx.address,
        });
        if (isGhost) {
          removeGhost(tx.address, chainId);
          setGhostTxs((prev) => prev.filter((t) => t.id !== tx.id));
        } else {
          setFound((prev) =>
            prev.map((t) => (t.id === tx.id ? { ...t, isSpent: true } : t))
          );
        }
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
    [chainId, pushTx, removeGhost]
  );

  useEffect(() => {
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

        const ghostEntries = useGhostAddressStore.getState().getForChain(chain.id);
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
              ghostFound.push({
                id: `ghost-${g.stealthAddress}`,
                address: g.stealthAddress,
                balance,
                privateKey,
                txHash: "",
                blockNumber: 0,
                isSpent: false,
              });
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
  }, [wasmReady, wasm, keysContext.isSetup]);

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
          Private balance
        </h2>
        <p className="text-sm text-neutral-500 mb-6">
          Stealth transactions found for your viewing key.
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

      {/* Content: loading / empty / card grid */}
      {!wasmReady ? (
        <div className="card max-w-md">
          <p className="text-neutral-600 text-sm">Initializing cryptography…</p>
        </div>
      ) : loading ? (
        <div className="card max-w-md">
          <p className="text-neutral-600 text-sm">Loading…</p>
        </div>
      ) : activeTxs.length === 0 ? (
        <div className="card max-w-md">
          <p className="text-neutral-400 text-sm">
            No incoming payments found yet.
          </p>
          <p className="text-neutral-600 text-xs mt-1">
            Payments sent to your stealth address will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 flex-1 min-h-0 content-start">
          {activeTxs.map((tx) => {
            const isNewDetection = newlyDetectedIds.includes(tx.id);
            return (
              <div
                key={tx.id}
                className={`card font-mono text-sm ${
                  isNewDetection ? "slide-in-decrypted detection-flash" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {tx.balance > 0n && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success border border-success/20">
                      Active
                    </span>
                  )}
                  <span className="text-neutral-600 text-xs">
                    Block #{tx.blockNumber}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-2 mb-1">
                  <span className="text-neutral-300 break-all text-xs">{tx.address}</span>
                  <span className="text-success font-semibold shrink-0">
                    {formatEther(tx.balance)} ETH
                  </span>
                </div>
                <div className="text-neutral-700 text-xs break-all">
                  {tx.txHash}
                </div>

                {/* Private key reveal */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {tx.privateKey != null && (
                    <>
                      {showKeyId === tx.id ? (
                        <>
                          <span className="text-neutral-500 text-xs break-all max-w-48 truncate">
                            {tx.privateKey}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyPrivateKey(tx.privateKey!)}
                            className="px-2 py-1 text-xs rounded-md btn-secondary"
                          >
                            Copy key
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowKeyId(null)}
                            className="px-2 py-1 text-xs rounded-md btn-secondary"
                          >
                            Hide
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowKeyId(tx.id)}
                          className="px-2 py-1 text-xs rounded-md bg-neutral-900 text-warning border border-warning/20 hover:border-warning/40 transition-colors"
                        >
                          Reveal key
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Claim section */}
                <div className="mt-4 pt-3 border-t border-border space-y-2">
                  <label className="block text-neutral-500 text-xs">Destination</label>
                  <input
                    type="text"
                    value={destinationByTxId[tx.id] ?? ""}
                    onChange={(e) => setDestination(tx.id, e.target.value)}
                    placeholder="0x… (use a fresh address)"
                    className="input-field text-sm"
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
                      <p className="text-warning text-xs">
                        Sending to your connected wallet will link your identity to this stealth transaction.
                      </p>
                    );
                  })()}
                  <div className="flex flex-wrap items-center gap-2">
                    {mainWalletAddress && (
                      <button
                        type="button"
                        onClick={() => setDestination(tx.id, mainWalletAddress)}
                        className="px-2 py-1 text-xs rounded-md btn-secondary"
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
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-white text-black disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-85 transition-opacity"
                    >
                      {claimingId === tx.id ? "Claiming…" : "Claim"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
