import { getAppChain } from "../lib/chain";
import { getExplorerTxUrl } from "../lib/explorer";
import { useTxHistoryStore } from "../store/txHistoryStore";
import type { TxHistoryEntry } from "../store/txHistoryStore";
import { formatEther } from "viem";

function formatDate(ts: number): string {
  try {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function typeLabel(kind: TxHistoryEntry["kind"]): string {
  switch (kind) {
    case "sent": return "Sent";
    case "received": return "Received";
    case "ghost": return "Manual";
    default: return String(kind);
  }
}

function statusFor(entry: TxHistoryEntry): string {
  return entry.txHash ? "Confirmed" : "—";
}

/** Token symbol badge for list display (icon-style: symbol only). */
function TokenBadge({ symbol }: { symbol: string }) {
  return (
    <span
      className="inline-flex items-center justify-center min-w-9 px-1.5 py-0.5 rounded font-mono text-xs font-medium bg-neutral-800 text-neutral-300 border border-neutral-700"
      title={symbol}
    >
      {symbol}
    </span>
  );
}

function normalizeEntry(raw: unknown, index: number): TxHistoryEntry | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : `tx-fallback-${index}`;
  const chainId = typeof o.chainId === "number" ? o.chainId : getAppChain().id;
  const kind = o.kind === "sent" || o.kind === "received" || o.kind === "ghost" ? o.kind : "sent";
  const counterparty = typeof o.counterparty === "string" ? o.counterparty : "—";
  const amountWei = typeof o.amountWei === "string" ? o.amountWei : "0";
  const txHash = typeof o.txHash === "string" ? o.txHash : undefined;
  const stealthAddress = typeof o.stealthAddress === "string" ? o.stealthAddress : undefined;
  const timestamp = typeof o.timestamp === "number" ? o.timestamp : Date.now();
  const tokenSymbol = typeof o.tokenSymbol === "string" ? o.tokenSymbol : "ETH";
  const tokenAddress = o.tokenAddress != null && typeof o.tokenAddress === "string" ? (o.tokenAddress as TxHistoryEntry["tokenAddress"]) : null;
  const amount = typeof o.amount === "string" && o.amount !== "" ? o.amount : formatEther(BigInt(amountWei || "0"));
  return { id, chainId, kind, counterparty, amountWei, tokenSymbol, tokenAddress, amount, txHash, stealthAddress, timestamp };
}

export function TransactionHistoryView() {
  const chainId = getAppChain().id;
  const getForChain = useTxHistoryStore((s) => s.getForChain);
  const clear = useTxHistoryStore((s) => s.clear);

  let entries: TxHistoryEntry[] = [];
  try {
    const raw = getForChain(chainId);
    const arr = Array.isArray(raw) ? raw : [];
    entries = (arr ?? [])
      .map((item: unknown, i: number) => normalizeEntry(item, i))
      .filter((e): e is TxHistoryEntry => e != null);
  } catch {
    entries = [];
  }
  const safeEntries = Array.isArray(entries) ? entries : [];

  const handleClear = () => {
    if (typeof window !== "undefined" && window.confirm("Clear all transaction history? This cannot be undone.")) {
      clear();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-white mb-1">Transaction History</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Last 50 transactions on this chain (sent, received, manual ghost).
      </p>

      {!safeEntries?.length ? (
        <div className="card">
          <p className="text-neutral-500 text-sm">No transactions yet.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {safeEntries.map((tx) => (
              <li
                key={tx?.id ?? `tx-${tx?.timestamp ?? 0}`}
                className="card py-3 px-4 flex flex-wrap items-center gap-x-4 gap-y-2"
              >
                <span className="text-neutral-500 text-sm shrink-0 w-32">
                  {formatDate(tx.timestamp)}
                </span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                    tx.kind === "sent"
                      ? "bg-neutral-700 text-neutral-300"
                      : tx.kind === "received"
                        ? "bg-success/10 text-success"
                        : "bg-neutral-700 text-neutral-400"
                  }`}
                >
                  {typeLabel(tx.kind)}
                </span>
                <span className="flex items-center gap-2 text-white font-mono text-sm">
                  <TokenBadge symbol={tx.tokenSymbol} />
                  <span>{tx.amount} {tx.tokenSymbol}</span>
                </span>
                <span className="text-neutral-500 text-xs shrink-0">
                  {statusFor(tx)}
                </span>
                <span className="text-neutral-400 text-sm truncate max-w-[120px] md:max-w-[200px] ml-auto" title={tx.counterparty ?? ""}>
                  {tx.counterparty ?? "—"}
                </span>
                {tx.txHash && (() => {
                  const explorerUrl = getExplorerTxUrl(tx.chainId, tx.txHash);
                  return explorerUrl ? (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-500 hover:text-neutral-400 text-xs font-mono truncate max-w-[80px] inline-flex items-center gap-1"
                      title={tx.txHash}
                    >
                      Confirmed ↗
                    </a>
                  ) : (
                    <span className="text-neutral-500 text-xs">Confirmed</span>
                  );
                })()}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleClear}
            className="mt-4 px-4 py-2 rounded-lg text-sm btn-secondary"
          >
            Clear History
          </button>
        </>
      )}
    </div>
  );
}
