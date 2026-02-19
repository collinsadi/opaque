import { useState, useEffect } from "react";
import { createPublicClient, http, formatEther, hexToBytes } from "viem";
import { getAppChain } from "../lib/chain";
import { deployedAddresses } from "../contracts/deployedAddresses";
import { STEALTH_ANNOUNCER_ABI } from "../lib/contracts";
import { useOpaqueWasm } from "../hooks/useOpaqueWasm";
import { useKeys } from "../context/KeysContext";
import type { MasterKeys } from "../lib/stealthLifecycle";
import type { OpaqueWasmModule } from "../hooks/useOpaqueWasm";

export type FoundTx = {
  id: string;
  address: string;
  balance: bigint;
  privateKey: string | undefined;
  txHash: string;
  blockNumber: number;
  timestamp?: number;
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

/** Fetch Announcement logs, then balances (parallel) and reconstruct private keys when keys/WASM available. */
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

  type LogRow = { id: string; stealthAddress: string; ephemeralPubKeyHex: string | undefined; blockNumber: number; txHash: string };
  const rows: LogRow[] = rawLogs.map((log, i) => ({
    id: `${log.transactionHash}-${log.logIndex ?? i}`,
    stealthAddress: log.args?.stealthAddress ?? "",
    ephemeralPubKeyHex: typeof log.args?.ephemeralPubKey === "string" ? log.args.ephemeralPubKey : undefined,
    blockNumber: Number(log.blockNumber ?? 0),
    txHash: log.transactionHash ?? "",
  }));

  const stealthAddresses = rows.map((r) => r.stealthAddress as `0x${string}`).filter(Boolean);
  const balances = await Promise.all(
    stealthAddresses.map((addr) => publicClient.getBalance({ address: addr }))
  );

  let masterKeys: MasterKeys | null = null;
  try {
    if (getMasterKeys) masterKeys = getMasterKeys();
  } catch {
    // Keys not set; we'll still show balances, privateKey will be undefined
  }

  const found: FoundTx[] = rows.map((row, i) => {
    const balance = balances[i] ?? 0n;
    let privateKey: string | undefined;
    if (wasm && masterKeys && row.ephemeralPubKeyHex) {
      try {
        const ephemeralPubKey = hexToBytes(row.ephemeralPubKeyHex);
        if (ephemeralPubKey.length === 33) {
          const stealthPrivKey = wasm.reconstruct_signing_key_wasm(
            masterKeys!.spendPrivKey,
            masterKeys!.viewPrivKey,
            ephemeralPubKey
          );
          privateKey =
            "0x" +
            Array.from(stealthPrivKey)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
          console.log("🔑 [Opaque] Recovered Private Key for", row.stealthAddress, ":", privateKey);
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
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { wasm, isReady: wasmReady } = useOpaqueWasm();
  const keysContext = useKeys();

  useEffect(() => {
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

    console.log("📥 [Opaque] PrivateBalance: loading data…");
    (async () => {
      setLoading(true);
      try {
        const [txs, status] = await Promise.all([
          fetchFoundTxs({ publicClient, wasm: wasm ?? null, getMasterKeys }),
          fetchScanningStatus(),
        ]);
        if (cancelled) return;
        setFound(txs);
        setScanning(status.scanning);
        setProgressPercent(status.progressPercent);
        setMessage(status.message ?? null);
        console.log("📥 [Opaque] PrivateBalance: loaded ✅", { txsCount: txs.length, scanning: status.scanning });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wasmReady, keysContext.isSetup]);

  return (
    <div className="glass-card max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-slate-200 mb-1">
        Private balance
      </h2>
      <p className="text-sm text-slate-400 mb-6">
        Stealth transactions found for your viewing key. Data is provided by the Opaque Cash indexer.
      </p>

      {/* Scanning status */}
      <div className="mb-6 p-4 rounded-xl bg-slate/80 border border-frost-border">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm text-slate-300">
            {scanning ? "Scanning" : "Idle"}
          </span>
          {scanning && (
            <span className="text-cyan text-sm font-mono">
              {progressPercent}%
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-charcoal overflow-hidden">
          <div
            className="h-full bg-cyan/70 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {message && (
          <p className="text-slate-500 text-xs mt-2">{message}</p>
        )}
      </div>

      {/* List of found txs */}
      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : found.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No stealth transactions found yet. Receiving a payment will show up here after the indexer scans the chain.
        </p>
      ) : (
        <ul className="space-y-3">
          {found.map((tx) => (
            <li
              key={tx.id}
              className={`p-4 rounded-xl font-mono text-sm border ${
                tx.balance > 0n
                  ? "bg-emerald-950/40 border-emerald-500/50"
                  : "bg-charcoal/80 border-frost-border"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <span className="text-cyan break-all">{tx.address}</span>
                <span className="text-slate-200 shrink-0">{formatEther(tx.balance)} ETH</span>
              </div>
              <div className="text-slate-500 text-xs mt-1 break-all">
                {tx.txHash}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
