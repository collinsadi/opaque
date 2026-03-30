import { useEffect, useMemo, useRef, useState } from "react";
import {
  indexerAnnouncementsToScannerJson,
  OpaqueClient,
  type IndexerAnnouncement,
} from "@opaquecash/opaque";
import { CodeBlock } from "@/components/CodeBlock";
import {
  concatBytes,
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  hexToBytes,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import type { PublicClient, WalletClient } from "viem";
import { sepolia } from "viem/chains";

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

const SEPOLIA_CHAIN_ID = 11155111 as const;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

const OPAQUE_KEY_MESSAGE =
  "Sign this message to derive your Opaque Cash stealth keys. This does not approve any transaction.";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

type ActionLogLevel = "info" | "success" | "error";
type ActionLogEntry = {
  id: string;
  at: number;
  level: ActionLogLevel;
  action: string;
  detail?: string;
  data?: unknown;
};

type TokenChoice =
  | { kind: "native"; symbol: string; decimals: number }
  | { kind: "erc20"; symbol: string; decimals: number; address: Address };

type SubgraphAnnouncement = {
  stealthAddress: string;
  etherealPublicKey: string;
  viewTag: number;
  metadata: string;
  blockNumber: number | string;
  transactionHash: string;
  logIndex: number;
};

const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export function Playground() {
  useEffect(() => {
    // Opt-in: enable SDK/WASM boundary debug logs in browser console.
    (globalThis as any).__OPAQUE_DEBUG = true;
    console.log("[opaque.debug] enabled (set globalThis.__OPAQUE_DEBUG = true)");
  }, []);

  const [tab, setTab] = useState<Tab>("wasm");
  const [json, setJson] = useState(SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [normalized, setNormalized] = useState("");
  const [wasmResult, setWasmResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [currentAction, setCurrentAction] = useState<string | null>(null);

  const [rpcUrl, setRpcUrl] = useState("https://ethereum-sepolia-rpc.publicnode.com");
  const wasmSpecifier = "/pkg/cryptography.js";

  const [walletAddress, setWalletAddress] = useState<`0x${string}` | "">("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletSignature, setWalletSignature] = useState<`0x${string}` | "">("");

  const [clientReady, setClientReady] = useState(false);
  const clientRef = useRef<OpaqueClient | null>(null);

  const [recipientAddress, setRecipientAddress] = useState<`0x${string}` | "">("");
  const [recipientMetaHex, setRecipientMetaHex] = useState("");
  const [sendTokenKey, setSendTokenKey] = useState<string>("native");
  const [sendAmountUnits, setSendAmountUnits] = useState<string>("0.001");
  const [attestationId, setAttestationId] = useState("200");
  const [actionModule, setActionModule] = useState("example");
  const [actionId, setActionId] = useState("demo-1");
  const [txHashes, setTxHashes] = useState<Record<string, `0x${string}`>>({});

  const [indexerGraphqlUrl, setIndexerGraphqlUrl] = useState<string>("");
  const [indexerBearerToken, setIndexerBearerToken] = useState<string>("");
  const [indexerFirst, setIndexerFirst] = useState<string>("500");
  const [indexerRequestMode, setIndexerRequestMode] = useState<"graphql" | "json">(
    "graphql",
  );

  const chains = useMemo(() => OpaqueClient.supportedChainIds(), []);

  const defaultTokens = useMemo(() => {
    const dep: any = OpaqueClient.chainDeployment(SEPOLIA_CHAIN_ID) as any;
    const list = (dep?.defaultTrackedTokens ?? []) as any[];
    const native: TokenChoice = { kind: "native", symbol: "ETH", decimals: 18 };
    const erc20s: TokenChoice[] = list
      .map((t) => {
        const address = (t?.tokenAddress ?? t?.address) as string | undefined;
        const symbol = (t?.symbol ?? t?.name ?? "ERC20") as string;
        const decimals = Number(t?.decimals ?? 18);
        if (!address || typeof address !== "string" || !address.startsWith("0x")) return null;
        return {
          kind: "erc20",
          address: address as Address,
          symbol,
          decimals: Number.isFinite(decimals) ? decimals : 18,
        } satisfies TokenChoice;
      })
      .filter(Boolean) as TokenChoice[];
    return [native, ...erc20s];
  }, []);

  function getSendTokenChoice(): TokenChoice {
    if (sendTokenKey === "native") return { kind: "native", symbol: "ETH", decimals: 18 };
    const found = defaultTokens.find(
      (t) => t.kind === "erc20" && t.address.toLowerCase() === sendTokenKey,
    );
    if (!found) throw new Error("Pick a token from the dropdown.");
    return found;
  }

  function toIndexerRow(a: SubgraphAnnouncement): IndexerAnnouncement {
    return {
      blockNumber: String(a.blockNumber),
      etherealPublicKey: a.etherealPublicKey as `0x${string}`,
      logIndex: a.logIndex,
      metadata: a.metadata as `0x${string}`,
      stealthAddress: a.stealthAddress as `0x${string}`,
      transactionHash: a.transactionHash as `0x${string}`,
      viewTag:
        typeof (a as any).viewTag === "number"
          ? ((a as any).viewTag as number)
          : Number.parseInt(String((a as any).viewTag), 10),
    };
  }

  function metadataForAnnounce(prep: { metadata: Uint8Array }, token: TokenChoice): Uint8Array {
    if (token.kind !== "erc20") return prep.metadata;
    const tokenAddr = token.address.toLowerCase() as Hex;
    return concatBytes([prep.metadata, hexToBytes(tokenAddr)]);
  }

  function log(level: ActionLogLevel, action: string, detail?: string, data?: unknown) {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        at: Date.now(),
        level,
        action,
        detail,
        data,
      },
    ]);
    if (level === "info") setCurrentAction(action);
  }

  function getProvider(): Eip1193Provider | null {
    const anyWindow = window as unknown as { ethereum?: Eip1193Provider };
    return anyWindow.ethereum ?? null;
  }

  function getViemClients(): {
    walletClient: WalletClient;
    publicClient: PublicClient;
    provider: Eip1193Provider;
    account: `0x${string}`;
  } {
    const provider = getProvider();
    if (!provider) throw new Error("No injected wallet found (window.ethereum).");
    if (!walletAddress) throw new Error("Connect wallet first.");

    const walletClient = createWalletClient({
      chain: sepolia,
      transport: custom(provider),
    });
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });
    return { walletClient, publicClient, provider, account: walletAddress };
  }

  async function refreshWalletState() {
    const p = getProvider();
    if (!p) {
      setWalletAddress("");
      setWalletChainId(null);
      log("error", "wallet.refresh", "No injected wallet found.");
      return;
    }
    const [accounts, chainIdHex] = await Promise.all([
      p.request({ method: "eth_accounts" }) as Promise<unknown>,
      p.request({ method: "eth_chainId" }) as Promise<unknown>,
    ]);
    const a = Array.isArray(accounts) ? (accounts[0] as string | undefined) : undefined;
    const cid =
      typeof chainIdHex === "string" ? Number.parseInt(chainIdHex, 16) : null;
    setWalletAddress(a?.startsWith("0x") ? (a as `0x${string}`) : "");
    setWalletChainId(Number.isFinite(cid) ? cid : null);
    log("info", "wallet.refresh", undefined, { address: a, chainId: cid });
  }

  async function ensureSepoliaChain() {
    const p = getProvider();
    if (!p) throw new Error("No injected wallet found (window.ethereum).");
    const chainIdHex = (await p.request({ method: "eth_chainId" })) as unknown;
    if (chainIdHex === SEPOLIA_CHAIN_ID_HEX) return;
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (e) {
      throw new Error(
        "Please switch your wallet network to Sepolia (11155111) and retry.",
      );
    }
  }

  async function connectWallet() {
    setError(null);
    const p = getProvider();
    if (!p) {
      setError("No injected wallet found. Install a browser wallet (e.g. MetaMask).");
      log("error", "wallet.connect", "No injected wallet found.");
      return;
    }
    try {
      log("info", "wallet.connect", "Requesting accounts + Sepolia network.");
      await ensureSepoliaChain();
      const accounts = (await p.request({
        method: "eth_requestAccounts",
      })) as unknown;
      const a = Array.isArray(accounts) ? (accounts[0] as string | undefined) : undefined;
      if (!a?.startsWith("0x")) throw new Error("No wallet account returned.");
      setWalletAddress(a as `0x${string}`);
      await refreshWalletState();
      log("success", "wallet.connect", undefined, { address: a });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      log("error", "wallet.connect", e instanceof Error ? e.message : String(e));
    }
  }

  async function signOnce() {
    setError(null);
    const p = getProvider();
    if (!p) {
      setError("No injected wallet found.");
      log("error", "wallet.sign", "No injected wallet found.");
      return;
    }
    if (!walletAddress) {
      setError("Connect wallet first.");
      log("error", "wallet.sign", "Connect wallet first.");
      return;
    }
    if (walletSignature) return;
    setBusy(true);
    try {
      log("info", "wallet.sign", "Requesting personal_sign for Opaque key derivation.");
      await ensureSepoliaChain();
      const sig = (await p.request({
        method: "personal_sign",
        params: [OPAQUE_KEY_MESSAGE, walletAddress],
      })) as unknown;
      if (typeof sig !== "string" || !sig.startsWith("0x")) {
        throw new Error("Wallet did not return a hex signature.");
      }
      setWalletSignature(sig as `0x${string}`);
      log("success", "wallet.sign", "Signature cached in state.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      log("error", "wallet.sign", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ensureClient() {
    if (clientRef.current) return clientRef.current;
    if (!walletAddress) throw new Error("Connect wallet first.");
    if (!walletSignature) throw new Error("Sign once to derive Opaque keys.");
    log("info", "opaque.create", "Creating OpaqueClient (loads WASM).");
    const client = await OpaqueClient.create({
      chainId: SEPOLIA_CHAIN_ID,
      rpcUrl,
      walletSignature,
      ethereumAddress: walletAddress,
      wasmModuleSpecifier: new URL(wasmSpecifier, window.location.origin).href,
    });
    try {
      const meta = client.getMetaAddressHex();
      const metaBytes = hexToBytes(meta);
      const viewPubKey = metaBytes.slice(0, 33);
      const spendPubKey = metaBytes.slice(33, 66);
      console.groupCollapsed("[opaque.playground] client key diagnostics");
      console.log("walletAddress:", walletAddress);
      console.log("walletSignature chars:", walletSignature.length);
      console.log("metaAddressHex:", meta);
      console.log("metaAddressHex chars:", meta.length);
      console.log("metaAddress bytes:", metaBytes.length);
      console.log("viewPubKey bytes:", viewPubKey.length, "prefix:", `0x${viewPubKey[0]?.toString(16).padStart(2, "0")}`);
      console.log("spendPubKey bytes:", spendPubKey.length, "prefix:", `0x${spendPubKey[0]?.toString(16).padStart(2, "0")}`);
      console.groupEnd();
    } catch (e) {
      console.error("[opaque.playground] client key diagnostics failed", e);
    }
    clientRef.current = client;
    setClientReady(true);
    log("success", "opaque.create", "OpaqueClient ready.");
    return client;
  }

  function parseRows(): IndexerAnnouncement[] {
    console.groupCollapsed("[opaque.playground] parseRows");
    console.log("raw json chars:", json.length);
    let v: unknown;
    try {
      v = JSON.parse(json) as unknown;
    } catch (e) {
      console.error("JSON.parse failed", e);
      throw e;
    }
    if (!Array.isArray(v)) {
      console.error("parsed value is not an array", v);
      throw new Error("JSON must be an array");
    }
    const rows = v as IndexerAnnouncement[];
    console.log("rows:", rows.length);
    console.log("first row preview:", rows[0]);

    // Most playground actions rely on WASM scanning which requires 33-byte compressed pubkeys.
    // Validate early so users get a precise row index and tx hash.
    validateAnnouncementHex(rows);
    debugDumpAnnouncements(rows);
    console.groupEnd();
    return rows;
  }

  function validateAnnouncementHex(rows: IndexerAnnouncement[]) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const key = (r as any)?.etherealPublicKey as unknown;
      const metadata = (r as any)?.metadata as unknown;
      if (typeof key !== "string") {
        throw new Error(`Row ${i} etherealPublicKey must be a hex string.`);
      }
      if (typeof metadata !== "string") {
        throw new Error(`Row ${i} metadata must be a hex string.`);
      }

      // Validate as bytes (this matches what the WASM scanner ultimately consumes).
      let pkBytes: Uint8Array;
      try {
        pkBytes = hexToBytes(key as Hex);
      } catch (e) {
        console.error("hexToBytes(etherealPublicKey) failed", { i, key, row: r }, e);
        throw new Error(
          `Row ${i} etherealPublicKey is not valid hex. ` +
            `Got ${String(key).slice(0, 18)}… tx=${(r as any)?.transactionHash ?? "—"}`,
        );
      }
      if (pkBytes.length !== 33) {
        console.error("etherealPublicKey byte length mismatch", {
          i,
          key,
          keyChars: key.length,
          pkBytesLen: pkBytes.length,
          tx: (r as any)?.transactionHash,
          row: r,
        });
        throw new Error(
          `Row ${i} etherealPublicKey must decode to 33 bytes (compressed). ` +
            `Got ${pkBytes.length} bytes. tx=${(r as any)?.transactionHash ?? "—"}`,
        );
      }
      if (pkBytes[0] !== 0x02 && pkBytes[0] !== 0x03) {
        console.error("etherealPublicKey compression prefix invalid", {
          i,
          firstByte: pkBytes[0],
          key,
          tx: (r as any)?.transactionHash,
        });
        throw new Error(
          `Row ${i} etherealPublicKey must start with 0x02 or 0x03 (compressed). ` +
            `Got 0x${pkBytes[0].toString(16)}. tx=${(r as any)?.transactionHash ?? "—"}`,
        );
      }

      // Metadata can be any length, but it must be valid hex and decode cleanly.
      try {
        hexToBytes(metadata as Hex);
      } catch (e) {
        console.error("hexToBytes(metadata) failed", { i, metadata, row: r }, e);
        throw new Error(
          `Row ${i} metadata is not valid hex. ` +
            `Got ${String(metadata).slice(0, 18)}… tx=${(r as any)?.transactionHash ?? "—"}`,
        );
      }
    }
  }

  function debugDumpAnnouncements(rows: IndexerAnnouncement[]) {
    console.groupCollapsed("[opaque.playground] announcement byte diagnostics");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as any;
      const etherealPublicKey = r?.etherealPublicKey as Hex | undefined;
      const metadata = r?.metadata as Hex | undefined;
      const tx = (r?.transactionHash ?? "—") as string;
      const stealth = (r?.stealthAddress ?? "—") as string;
      const vt = r?.viewTag;

      let pkBytesLen: number | null = null;
      let pkPrefix: string | null = null;
      try {
        const b = etherealPublicKey ? hexToBytes(etherealPublicKey) : null;
        pkBytesLen = b ? b.length : null;
        pkPrefix = b ? `0x${b[0].toString(16).padStart(2, "0")}` : null;
      } catch {
        // handled in validation, keep logs flowing
      }

      let mdBytesLen: number | null = null;
      try {
        const b = metadata ? hexToBytes(metadata) : null;
        mdBytesLen = b ? b.length : null;
      } catch {
        // handled in validation
      }

      console.log(`[row ${i}]`, {
        tx,
        stealth,
        blockNumber: r?.blockNumber,
        logIndex: r?.logIndex,
        viewTag: vt,
        etherealPublicKey,
        etherealPublicKeyChars: typeof etherealPublicKey === "string" ? etherealPublicKey.length : null,
        etherealPublicKeyBytes: pkBytesLen,
        etherealPublicKeyPrefix: pkPrefix,
        metadata,
        metadataChars: typeof metadata === "string" ? metadata.length : null,
        metadataBytes: mdBytesLen,
      });
    }
    console.groupEnd();
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
    setBusy(true);
    try {
      const rows = parseRows();
      try {
        const scannerJson = indexerAnnouncementsToScannerJson(rows);
        const recs = JSON.parse(scannerJson) as any[];
        let badPk = 0;
        let badMeta = 0;
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i];
          const pkLen = Array.isArray(r?.ephemeralPubKey) ? r.ephemeralPubKey.length : null;
          const mdLen = Array.isArray(r?.metadata) ? r.metadata.length : null;
          if (pkLen !== 33) badPk++;
          if (mdLen === null) badMeta++;
        }
        console.groupCollapsed("[opaque.playground] scanner JSON sanity");
        console.log("records:", recs.length);
        console.log("ephemeralPubKey != 33 count:", badPk);
        console.log("metadata non-array count:", badMeta);
        console.log("first record:", recs[0]);
        console.groupEnd();
      } catch (e) {
        console.error("[opaque.playground] scanner JSON sanity failed", e);
      }
      const client = await ensureClient();
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
      console.error("[opaque.playground] runWasmScan error", e);
      if (e instanceof Error) console.error(e.stack);
    } finally {
      setBusy(false);
      setCurrentAction(null);
    }
  }

  async function fetchAnnouncementsFromIndexer(): Promise<IndexerAnnouncement[]> {
    const url = indexerGraphqlUrl.trim();
    if (!url) throw new Error("Enter your indexer URL first.");
    const first = Number.parseInt(indexerFirst, 10);
    if (!Number.isFinite(first) || first <= 0 || first > 5000) {
      throw new Error("Indexer 'first' must be a number between 1 and 5000.");
    }
    const bearer = indexerBearerToken.trim();

    const gqlQuery =
      `query GetAnnouncements($first: Int!, $orderBy: String!, $orderDirection: String!) {\n` +
      `  announcements(first: $first, orderBy: $orderBy, orderDirection: $orderDirection) {\n` +
      `    id\n` +
      `    etherealPublicKey\n` +
      `    viewTag\n` +
      `    metadata\n` +
      `    blockNumber\n` +
      `    transactionHash\n` +
      `    logIndex\n` +
      `    stealthAddress\n` +
      `    __typename\n` +
      `  }\n` +
      `}`;

    log("info", "indexer.fetchAnnouncements", `POST ${url}`, { first });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(
        indexerRequestMode === "graphql"
          ? {
              operationName: "GetAnnouncements",
              query: gqlQuery,
              variables: {
                first,
                orderBy: "blockNumber",
                orderDirection: "desc",
              },
            }
          : {
              first,
              orderBy: "blockNumber",
              orderDirection: "desc",
            },
      ),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Indexer responded ${res.status}: ${t.slice(0, 240)}`);
    }
    const payload = (await res.json()) as any;
    const raw =
      // Some indexers return the array directly
      (Array.isArray(payload) ? payload : null) ??
      // Some return { announcements: [...] }
      (Array.isArray(payload?.announcements) ? payload.announcements : null) ??
      // GraphQL-compatible fallbacks (if endpoint is actually GraphQL)
      (Array.isArray(payload?.data?.announcements) ? payload.data.announcements : null);

    if (!Array.isArray(raw)) {
      if (payload?.errors?.length) {
        throw new Error(
          `Indexer error: ${payload.errors[0]?.message ?? "unknown"} (mode=${indexerRequestMode})`,
        );
      }
      throw new Error(
        "Indexer payload missing announcements array (expected array, {announcements: [...]}, or {data:{announcements:[...]}}).",
      );
    }

    const rows = (raw as SubgraphAnnouncement[]).map(toIndexerRow);
    log("success", "indexer.fetchAnnouncements", undefined, { rows: rows.length });
    return rows;
  }

  async function run<T>(fn: () => Promise<T>) {
    setError(null);
    setWasmResult("");
    setBusy(true);
    try {
      const v = await fn();
      setWasmResult(
        JSON.stringify(
          v,
          (_, val) => (typeof val === "bigint" ? val.toString() : val),
          2,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      log("error", "action.failed", e instanceof Error ? e.message : String(e));
      console.error("[opaque.playground] action failed", e);
      if (e instanceof Error) console.error(e.stack);
    } finally {
      setBusy(false);
      setCurrentAction(null);
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 border-b border-ink-800/60 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-white md:text-4xl">
            Playground
          </h1>
          <p className="mt-2 max-w-3xl text-mist">
            Full-page SDK tester for Sepolia. Connect your wallet, set an RPC URL, then
            run any <code>OpaqueClient</code> method. WASM loads from{" "}
            <code className="text-glow">{wasmSpecifier}</code> (served by this docs site
            from <code className="text-glow">docs/public/pkg</code>).
          </p>
          <p className="mt-2 text-xs text-mist">
            Bundled chain IDs: {chains.join(", ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {busy ? (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs text-slate-200">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-600 border-t-glow" />
              <span className="font-mono">{currentAction ?? "working…"}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2 rounded-2xl border border-ink-700 bg-ink-950/30 p-1.5">
            {(
              [
                ["wasm", "SDK methods"],
                ["normalize", "Normalize JSON"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === id
                    ? "bg-glow-muted/30 text-glow"
                    : "text-mist hover:bg-ink-800 hover:text-white"
                }`}
                aria-current={tab === id ? "page" : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-ink-700 bg-gradient-to-b from-ink-900/60 to-ink-950/30 p-5 md:p-6">
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <p className="text-sm font-semibold text-white">Wallet session</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => void connectWallet()}
                className="w-full rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90"
              >
                {walletAddress ? "Wallet connected" : "Connect wallet"}
              </button>
              <button
                type="button"
                disabled={!walletAddress || busy}
                onClick={() => void signOnce()}
                className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40 disabled:opacity-50"
              >
                {walletSignature ? "Signed (cached)" : "Sign once"}
              </button>
              <button
                type="button"
                onClick={() => void refreshWalletState()}
                className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 grid gap-2 rounded-2xl border border-ink-700 bg-ink-950/40 p-4 text-xs text-mist sm:grid-cols-2">
              <div className="space-y-1">
                <div>
                  <span className="text-slate-300">chainId</span>{" "}
                  <span className="font-mono text-slate-200">
                    {walletChainId ?? "—"}
                  </span>{" "}
                  <span className="text-slate-400">(fixed: {SEPOLIA_CHAIN_ID})</span>
                </div>
                <div className="break-all">
                  <span className="text-slate-300">address</span>{" "}
                  <span className="font-mono text-slate-200">{walletAddress || "—"}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="break-all">
                  <span className="text-slate-300">signature</span>{" "}
                  <span className="font-mono text-slate-200">
                    {walletSignature ? `${walletSignature.slice(0, 20)}…` : "—"}
                  </span>
                </div>
                <div className="text-slate-400">Reused until refresh.</div>
              </div>
            </div>
          </div>

          <div className="xl:col-span-7">
            <p className="text-sm font-semibold text-white">Runtime config</p>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-mist">
                  RPC URL (user-provided)
                </label>
                <input
                  placeholder="https://…"
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                />
                <div className="mt-2 text-xs text-mist">
                  WASM module: <code className="text-glow">{wasmSpecifier}</code>{" "}
                  <span className="text-slate-400">(from `docs/public/pkg`)</span>
                </div>
                <div className="mt-1 text-xs text-mist">
                  Playground chainId: <code className="text-glow">{SEPOLIA_CHAIN_ID}</code>{" "}
                  <span className="text-slate-400">(unchangeable for now)</span>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-mist">Opaque client</label>
                <button
                  type="button"
                  disabled={busy || !walletAddress || !walletSignature}
                  onClick={() =>
                    void run(async () => {
                      const client = await ensureClient();
                      return {
                        metaAddress: client.getMetaAddressHex(),
                        contracts: client.getContracts(),
                      };
                    })
                  }
                  className="mt-1 w-full rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
                >
                  {clientReady ? "Show meta-address + contracts" : "Create client (loads WASM)"}
                </button>
                <p className="mt-2 text-xs text-mist">
                  {clientReady
                    ? "Client cached in memory; no re-signing needed."
                    : "Requires connected wallet + cached signature."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <div className="space-y-3">
          {tab === "normalize" ? (
            <>
              <label className="text-sm font-medium text-white">Announcements JSON</label>
              <textarea
                value={json}
                onChange={(e) => setJson(e.target.value)}
                className="h-[min(420px,50vh)] w-full resize-y rounded-xl border border-ink-600 bg-ink-900/80 p-4 font-mono text-[13px] text-slate-200 focus:border-glow/50 focus:outline-none"
                spellCheck={false}
              />
            </>
          ) : null}
          {tab === "normalize" ? (
            <button
              type="button"
              onClick={runNormalize}
              className="rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90"
            >
              Convert to scanner JSON
            </button>
          ) : (
            <div className="space-y-4 rounded-3xl border border-ink-700 bg-ink-900/40 p-4 md:p-5">
              <details className="rounded-xl border border-ink-700 bg-ink-950/40 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  Input: IndexerAnnouncement[] JSON
                </summary>
                <p className="mt-2 text-xs text-mist">
                  Used by scan/traits/balances and some PSR helpers. Paste your indexer
                  rows here (same shape as the docs “Indexer format” page).
                </p>
                <textarea
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  className="mt-3 h-[min(320px,38vh)] w-full resize-y rounded-xl border border-ink-600 bg-ink-900/80 p-4 font-mono text-[13px] text-slate-200 focus:border-glow/50 focus:outline-none"
                  spellCheck={false}
                />
              </details>

              <details open className="rounded-2xl border border-ink-700 bg-ink-950/25 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  Scan / traits
                </summary>
                <p className="mt-2 text-xs text-mist">
                  These actions reuse your cached signature and the locally-served WASM.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy || !walletSignature || !walletAddress}
                    onClick={runWasmScan}
                    className="w-full rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Running…" : "filterOwned + traits"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        log("info", "opaque.filterOwnedAnnouncements", "Scanning rows for owned outputs.");
                        const client = await ensureClient();
                        const rows = parseRows();
                        const owned = await client.filterOwnedAnnouncements(rows);
                        log("success", "opaque.filterOwnedAnnouncements", undefined, {
                          ownedCount: owned.length,
                        });
                        return { ownedCount: owned.length, owned };
                      })
                    }
                    className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40 disabled:opacity-50"
                  >
                    filterOwned only
                  </button>
                </div>
              </details>

              <details className="rounded-2xl border border-ink-700 bg-ink-950/25 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  Scan announcements (connected user)
                </summary>
                <p className="mt-2 text-xs text-mist">
                  Fetches the latest announcements from your GraphQL indexer (no trait filter),
                  then filters to outputs owned by your connected wallet using WASM scanning.
                  The fetched rows are also copied into the playground input JSON.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-mist">
                      Indexer URL
                    </label>
                    <input
                      placeholder="https://…"
                      value={indexerGraphqlUrl}
                      onChange={(e) => setIndexerGraphqlUrl(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-mist">
                      Request payload mode
                    </label>
                    <select
                      value={indexerRequestMode}
                      onChange={(e) =>
                        setIndexerRequestMode(e.target.value as "graphql" | "json")
                      }
                      className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-slate-200"
                    >
                      <option value="graphql">GraphQL (sends {"{ query, variables }"})</option>
                      <option value="json">
                        JSON (sends {"{ first, orderBy, orderDirection }"})
                      </option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-mist">
                      Bearer token (optional)
                    </label>
                    <input
                      placeholder="eyJhbGciOi…"
                      value={indexerBearerToken}
                      onChange={(e) => setIndexerBearerToken(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-medium text-mist">
                      Fetch count (first)
                    </label>
                    <input
                      value={indexerFirst}
                      onChange={(e) => setIndexerFirst(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                    />
                  </div>
                  <div className="sm:col-span-1 flex items-end">
                    <button
                      type="button"
                      disabled={busy || !walletAddress || !walletSignature}
                      onClick={() =>
                        void run(async () => {
                          const client = await ensureClient();
                          const rows = await fetchAnnouncementsFromIndexer();
                          setJson(JSON.stringify(rows, null, 2));
                          const owned = await client.filterOwnedAnnouncements(rows);
                          const ownedKey = new Set(
                            owned.map(
                              (o) => `${o.transactionHash.toLowerCase()}:${o.stealthAddress.toLowerCase()}`,
                            ),
                          );
                          const ownedAnnouncements = rows.filter((r) =>
                            ownedKey.has(
                              `${r.transactionHash.toLowerCase()}:${r.stealthAddress.toLowerCase()}`,
                            ),
                          );
                          log("success", "opaque.scanOwnedAnnouncements", undefined, {
                            fetched: rows.length,
                            ownedAnnouncements: ownedAnnouncements.length,
                          });
                          return { fetched: rows.length, ownedCount: owned.length, owned, ownedAnnouncements };
                        })
                      }
                      className="w-full rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
                    >
                      Fetch + scan owned announcements
                    </button>
                  </div>
                </div>
              </details>

              <details className="rounded-2xl border border-ink-700 bg-ink-950/25 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  Registry lookup
                </summary>
                <div className="mt-3 space-y-2">
                  <input
                    placeholder="recipientAddress (0x…)"
                    value={recipientAddress}
                    onChange={(e) =>
                      setRecipientAddress(e.target.value as `0x${string}`)
                    }
                    className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                  />
                  <button
                    type="button"
                    disabled={busy || !recipientAddress}
                    onClick={() =>
                      void run(async () => {
                        const client = await ensureClient();
                        if (!recipientAddress) throw new Error("Enter a recipientAddress.");
                        const r = await client.resolveRecipientMetaAddress(recipientAddress);
                        if (r?.metaAddressHex) setRecipientMetaHex(r.metaAddressHex);
                        return r;
                      })
                    }
                    className="w-full rounded-xl bg-glow/90 px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
                  >
                    resolveRecipientMetaAddress
                  </button>
                </div>
              </details>

              <details className="rounded-2xl border border-ink-700 bg-ink-950/25 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  Send flow (fund + announce)
                </summary>
                <p className="mt-2 text-xs text-mist">
                  Pick a default token, enter an amount in units, paste a recipient meta-address,
                  then the playground will fund the derived stealth address and announce.
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-medium text-mist">Token</label>
                    <select
                      value={sendTokenKey}
                      onChange={(e) => setSendTokenKey(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-slate-200"
                    >
                      {defaultTokens.map((t) => {
                        const key =
                          t.kind === "native" ? "native" : t.address.toLowerCase();
                        const label =
                          t.kind === "native"
                            ? `${t.symbol} (native)`
                            : `${t.symbol} (${t.address.slice(0, 6)}…${t.address.slice(-4)})`;
                        return (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-xs font-medium text-mist">Amount (units)</label>
                    <input
                      value={sendAmountUnits}
                      onChange={(e) => setSendAmountUnits(e.target.value)}
                      placeholder="0.01"
                      className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-mist">
                      Recipient meta-address
                    </label>
                    <input
                      placeholder="recipientMetaHex (st:eth… or 0x…)"
                      value={recipientMetaHex}
                      onChange={(e) => setRecipientMetaHex(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy || !recipientMetaHex}
                    onClick={() =>
                      void run(async () => {
                        log("info", "send.preview", "Preparing stealth send + building tx requests.");
                        const token = getSendTokenChoice();
                        const amountWei = parseUnits(sendAmountUnits || "0", token.decimals);
                        if (amountWei <= 0n) throw new Error("Amount must be positive.");
                        const client = await ensureClient();
                        const prep = await client.prepareStealthSend(recipientMetaHex as never);
                        const metadata = metadataForAnnounce(prep as any, token);
                        const ann = client.buildAnnounceTransactionRequest({
                          ...(prep as any),
                          metadata,
                        });
                        const fund =
                          token.kind === "native"
                            ? {
                                kind: "native",
                                to: (prep as any).stealthAddress,
                                value: amountWei,
                                data: "0x" as const,
                              }
                            : {
                                kind: "erc20",
                                to: token.address,
                                value: 0n,
                                data: encodeFunctionData({
                                  abi: erc20TransferAbi,
                                  functionName: "transfer",
                                  args: [(prep as any).stealthAddress, amountWei],
                                }),
                              };
                        log("success", "send.preview", undefined, {
                          stealthAddress: (prep as any).stealthAddress,
                          token,
                          amountWei: amountWei.toString(),
                        });
                        return { token, amountWei, prep, fund, announce: ann };
                      })
                    }
                    className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40 disabled:opacity-50"
                  >
                    Preview (build txs)
                  </button>

                  <button
                    type="button"
                    disabled={busy || !walletAddress || !walletSignature || !recipientMetaHex}
                    onClick={() =>
                      void run(async () => {
                        const token = getSendTokenChoice();
                        const amountWei = parseUnits(sendAmountUnits || "0", token.decimals);
                        if (amountWei <= 0n) throw new Error("Amount must be positive.");

                        log("info", "send.execute", "Preparing stealth send.");
                        const client = await ensureClient();
                        const prep = await client.prepareStealthSend(recipientMetaHex as never);

                        const { walletClient, publicClient, account } = getViemClients();

                        // 1) Fund stealth address
                        let fundHash: Hex;
                        if (token.kind === "native") {
                          log("info", "send.fund.native", "Sending native transfer to stealth address.");
                          fundHash = (await walletClient.sendTransaction({
                            account,
                            chain: sepolia,
                            to: (prep as any).stealthAddress,
                            value: amountWei,
                            data: "0x",
                          } as any)) as Hex;
                        } else {
                          log("info", "send.fund.erc20", "Sending ERC20 transfer to stealth address.", {
                            token: token.address,
                          });
                          const data = encodeFunctionData({
                            abi: erc20TransferAbi,
                            functionName: "transfer",
                            args: [(prep as any).stealthAddress, amountWei],
                          });
                          fundHash = (await walletClient.sendTransaction({
                            account,
                            chain: sepolia,
                            to: token.address,
                            value: 0n,
                            data,
                          } as any)) as Hex;
                        }
                        setTxHashes((prev) => ({
                          ...prev,
                          fund: fundHash as `0x${string}`,
                        }));
                        log("success", "send.fund", "Funding tx submitted.", { hash: fundHash });
                        await publicClient.waitForTransactionReceipt({
                          hash: fundHash as `0x${string}`,
                        });
                        log("success", "send.fund", "Funding tx confirmed.");

                        // 2) Announce
                        log("info", "send.announce", "Building announce calldata (metadata includes token for ERC20).");
                        const metadata = metadataForAnnounce(prep as any, token);
                        const ann = client.buildAnnounceTransactionRequest({
                          ...(prep as any),
                          metadata,
                        }) as any;

                        log("info", "send.announce", "Sending announce transaction.");
                        const annHash = (await walletClient.sendTransaction({
                          account,
                          chain: sepolia,
                          to: ann.to,
                          data: ann.data,
                          value: 0n,
                        } as any)) as Hex;
                        setTxHashes((prev) => ({
                          ...prev,
                          announce: annHash as `0x${string}`,
                        }));
                        log("success", "send.announce", "Announce tx submitted.", { hash: annHash });
                        await publicClient.waitForTransactionReceipt({
                          hash: annHash as `0x${string}`,
                        });
                        log("success", "send.announce", "Announce tx confirmed.");

                        return { token, amountWei, prep, fundHash, annHash, announce: ann };
                      })
                    }
                    className="w-full rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
                  >
                    Execute (fund + announce)
                  </button>
                </div>
              </details>

              <details className="rounded-2xl border border-ink-700 bg-ink-950/25 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  Write actions (wallet transactions)
                </summary>
                <p className="mt-2 text-xs text-mist">
                  Uses <code>viem</code> + the SDK’s calldata builders to prompt your wallet
                  to sign and submit transactions.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy || !walletAddress || !walletSignature}
                    onClick={() =>
                      void run(async () => {
                        log("info", "tx.registerMetaAddress", "Building register calldata.");
                        const client = await ensureClient();
                        const tx = client.buildRegisterMetaAddressTransaction() as any;
                        const { walletClient, publicClient, account } = getViemClients();
                        log("info", "tx.registerMetaAddress", "Requesting wallet signature for transaction.");
                        const hash = await walletClient.sendTransaction({
                          account,
                          chain: sepolia,
                          to: tx.to,
                          data: tx.data,
                          value: tx.value,
                        } as any);
                        setTxHashes((prev) => ({
                          ...prev,
                          registerMetaAddress: hash as `0x${string}`,
                        }));
                        log("success", "tx.registerMetaAddress", "Transaction submitted.", { hash });
                        const receipt = await publicClient.waitForTransactionReceipt({
                          hash: hash as `0x${string}`,
                        });
                        log("success", "tx.registerMetaAddress", "Transaction confirmed.", {
                          status: (receipt as any)?.status,
                          blockNumber: (receipt as any)?.blockNumber?.toString?.(),
                        });
                        return { tx, hash, receipt };
                      })
                    }
                    className="w-full rounded-xl bg-glow px-4 py-2.5 font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
                  >
                    Register meta-address
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const hashes = txHashes;
                        log("info", "tx.hashes", "Current tx hashes in state.", hashes);
                        return hashes;
                      })
                    }
                    className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40 disabled:opacity-50"
                  >
                    Show tx hashes
                  </button>
                </div>
              </details>

              <details className="rounded-2xl border border-ink-700 bg-ink-950/25 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  Balances
                </summary>
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const client = await ensureClient();
                        const rows = parseRows();
                        return client.getBalancesFromAnnouncements(rows);
                      })
                    }
                    className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40 disabled:opacity-50"
                  >
                    getBalancesFromAnnouncements(rows)
                  </button>
                </div>
              </details>

              <details className="rounded-2xl border border-ink-700 bg-ink-950/25 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  PSR helpers
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      placeholder="attestationId (u64)"
                      value={attestationId}
                      onChange={(e) => setAttestationId(e.target.value)}
                      className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                    />
                    <button
                      type="button"
                      disabled={busy || !attestationId}
                      onClick={() =>
                        void run(async () => {
                          const client = await ensureClient();
                          const rows = parseRows();
                          const viewTag = rows[0]?.viewTag;
                          if (typeof viewTag !== "number") {
                            throw new Error("Need at least 1 row to read viewTag.");
                          }
                          return client.encodeReputationMetadata(
                            viewTag,
                            BigInt(attestationId),
                          );
                        })
                      }
                      className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40 disabled:opacity-50"
                    >
                      encodeReputationMetadata
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      placeholder="scope module"
                      value={actionModule}
                      onChange={(e) => setActionModule(e.target.value)}
                      className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                    />
                    <input
                      placeholder="scope actionId"
                      value={actionId}
                      onChange={(e) => setActionId(e.target.value)}
                      className="w-full rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-white"
                    />
                    <button
                      type="button"
                      disabled={busy || !actionModule || !actionId}
                      onClick={() =>
                        void run(async () => {
                          const scope = OpaqueClient.buildReputationActionScope({
                            chainId: SEPOLIA_CHAIN_ID,
                            module: actionModule,
                            actionId,
                          });
                          const externalNullifier =
                            OpaqueClient.reputationExternalNullifierFromScope(scope);
                          return { scope, externalNullifier };
                        })
                      }
                      className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40 disabled:opacity-50 sm:col-span-2"
                    >
                      scope + externalNullifier
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const client = await ensureClient();
                        const latest = await client.fetchLatestValidReputationRoot();
                        const ok = await client.isReputationRootValid(latest);
                        const history = await client.fetchReputationRootHistory();
                        return {
                          latest,
                          latestIsValid: ok,
                          historyCount: history.length,
                          history,
                        };
                      })
                    }
                    className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-2.5 font-semibold text-slate-200 hover:border-glow/40 disabled:opacity-50"
                  >
                    Reputation roots (latest + history)
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
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
          {tab === "wasm" && !wasmResult && !error ? (
            <p className="text-sm text-mist">
              Connect + sign once, then run a method. Outputs appear here.
            </p>
          ) : null}
        </div>
      </div>

      <details className="sticky bottom-0 z-40 rounded-3xl border border-ink-700 bg-ink-950/95 backdrop-blur-md">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-white">Action log</p>
              <span className="rounded-full bg-ink-800 px-2.5 py-1 text-xs font-semibold text-slate-200">
                {logs.length}
              </span>
              <span className="text-xs text-mist">Collapse / expand</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLogs([]);
              }}
              className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-glow/40"
            >
              Clear
            </button>
          </div>
        </summary>
        <div className="border-t border-ink-800/60 px-5 pb-5">
          <div className="max-h-[320px] overflow-auto pt-4">
            {logs.length ? (
              <div className="space-y-2">
                {logs.slice(-120).map((l) => (
                  <div
                    key={l.id}
                    className="rounded-2xl border border-ink-800 bg-ink-900/30 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            l.level === "success"
                              ? "bg-emerald-500/15 text-emerald-200"
                              : l.level === "error"
                                ? "bg-red-500/15 text-red-200"
                                : "bg-slate-500/15 text-slate-200"
                          }`}
                        >
                          {l.level}
                        </span>
                        <span className="font-mono text-[12px] text-slate-200">
                          {l.action}
                        </span>
                      </div>
                      <span className="text-[11px] text-mist">
                        {new Date(l.at).toLocaleTimeString()}
                      </span>
                    </div>
                    {l.detail ? (
                      <div className="mt-1 text-xs text-mist">{l.detail}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-mist">
                Every interaction in the playground is logged here.
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
