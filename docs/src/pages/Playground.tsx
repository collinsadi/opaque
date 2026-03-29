import { useMemo, useState } from "react";
import {
  indexerAnnouncementsToScannerJson,
  OpaqueClient,
  type IndexerAnnouncement,
} from "@opaquecash/opaque";
import { CodeBlock } from "@/components/CodeBlock";

const SAMPLE = `[
  {
    "__typename": "Announcement",
    "blockNumber": "10533630",
    "etherealPublicKey": "0x020a20e4152e08dec849db50d19527fb35fb000c4b7d2f8c25e63d2c4cbc4f7589",
    "id": "0x10fec5b1b6208541a127ea358534384b07fb3f8ceca96d69ae4c1036385c439c-161",
    "logIndex": 161,
    "metadata": "0xeaa70000000000000005",
    "stealthAddress": "0xb1d24e92fd00584f48d74d2ba838d96ed161ee48",
    "transactionHash": "0x10fec5b1b6208541a127ea358534384b07fb3f8ceca96d69ae4c1036385c439c",
    "viewTag": 234
  }
]`;

type Tab = "normalize" | "wasm";

export function Playground() {
  const [tab, setTab] = useState<Tab>("normalize");
  const [json, setJson] = useState(SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [normalized, setNormalized] = useState("");
  const [wasmResult, setWasmResult] = useState("");
  const [busy, setBusy] = useState(false);

  const [rpcUrl, setRpcUrl] = useState("https://ethereum-sepolia-rpc.publicnode.com");
  const [wasmPath, setWasmPath] = useState(
    "https://www.opaque.cash/pkg/cryptography.js",
  );
  const [signature, setSignature] = useState("");
  const [address, setAddress] = useState("");

  const chains = useMemo(() => OpaqueClient.supportedChainIds(), []);

  function parseRows(): IndexerAnnouncement[] {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) throw new Error("JSON must be an array");
    return v as IndexerAnnouncement[];
  }

  function runNormalize() {
    setError(null);
    setNormalized("");
    try {
      const rows = parseRows();
      const s = indexerAnnouncementsToScannerJson(rows);
      setNormalized(JSON.stringify(JSON.parse(s), null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runWasmScan() {
    setError(null);
    setWasmResult("");
    if (!signature.startsWith("0x") || signature.length < 130) {
      setError("Paste a real wallet signature (hex, 0x…).");
      return;
    }
    if (!address.startsWith("0x") || address.length !== 42) {
      setError("Paste checksummed/lowercase ethereumAddress (0x + 40 hex).");
      return;
    }
    setBusy(true);
    try {
      const rows = parseRows();
      const spec = wasmPath.startsWith("http")
        ? wasmPath
        : new URL(wasmPath, window.location.origin).href;
      const client = await OpaqueClient.create({
        chainId: 11155111,
        rpcUrl,
        walletSignature: signature as `0x${string}`,
        ethereumAddress: address as `0x${string}`,
        wasmModuleSpecifier: spec,
      });
      const owned = await client.filterOwnedAnnouncements(rows);
      const traits = await client.discoverTraits(rows);
      setWasmResult(
        JSON.stringify(
          { owned, traits, metaAddress: client.getMetaAddressHex() },
          (_, v) => (typeof v === "bigint" ? v.toString() : v),
          2,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Playground</h1>
        <p className="mt-2 max-w-2xl text-mist">
          Normalize subgraph rows without WASM, or run a full <code>scan_attestations</code>{" "}
          (default WASM entry:{" "}
          <code className="text-glow">https://www.opaque.cash/pkg/cryptography.js</code>
          ; use a path like <code>/pkg/cryptography.js</code> if you self-host, e.g. copy
          from <code>frontend/public/pkg</code>). RPC + signature must match a recipient
          for owned rows to appear.
        </p>
        <p className="mt-2 text-xs text-mist">
          Bundled chain IDs: {chains.join(", ")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-ink-700 pb-2">
        {(
          [
            ["normalize", "Normalize JSON"],
            ["wasm", "WASM scan"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-glow-muted/30 text-glow"
                : "text-mist hover:bg-ink-800 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="text-sm font-medium text-white">Announcements JSON</label>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            className="h-[min(420px,50vh)] w-full resize-y rounded-xl border border-ink-600 bg-ink-900/80 p-4 font-mono text-[13px] text-slate-200 focus:border-glow/50 focus:outline-none"
            spellCheck={false}
          />
          {tab === "normalize" ? (
            <button
              type="button"
              onClick={runNormalize}
              className="rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90"
            >
              Convert to scanner JSON
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-ink-600 bg-ink-900/40 p-4">
              <p className="text-xs text-mist">
                WASM tab needs keys derived from your signature — use a real Opaque
                wallet signature for the same address you paste below.
              </p>
              <input
                placeholder="RPC URL"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                className="w-full rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
              />
              <input
                placeholder="WASM URL or path"
                value={wasmPath}
                onChange={(e) => setWasmPath(e.target.value)}
                className="w-full rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
              />
              <input
                placeholder="walletSignature (0x…)"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                className="w-full rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
              />
              <input
                placeholder="ethereumAddress (0x…)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
              />
              <button
                type="button"
                disabled={busy}
                onClick={runWasmScan}
                className="w-full rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Running WASM…" : "Run scan + traits"}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {error ? (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
          {tab === "normalize" && normalized ? (
            <div>
              <p className="mb-2 text-sm font-medium text-white">Scanner payload</p>
              <CodeBlock title="json" language="json" code={normalized} />
            </div>
          ) : null}
          {tab === "wasm" && wasmResult ? (
            <div>
              <p className="mb-2 text-sm font-medium text-white">Result</p>
              <CodeBlock title="json" language="json" code={wasmResult} />
            </div>
          ) : null}
          {tab === "normalize" && !normalized && !error ? (
            <p className="text-sm text-mist">
              Click convert to see the shape expected by{" "}
              <code>scan_attestations_wasm</code>.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
