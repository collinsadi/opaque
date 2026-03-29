import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const CALldata_OVERVIEW = `// Same OpaqueClient.create({ ... }) as register / send: signMessage → HKDF → keys.

import type { IndexerAnnouncement } from "@opaquecash/opaque";

// ── 1) Fetch announcements your indexer exposes (GraphQL, REST, etc.) ─────
// You need the same fields as StealthAddressAnnouncer emits + block/log ids.
// See /sdk/indexer for the IndexerAnnouncement shape.

// ── 2) Normalize subgraph rows if needed (blockNumber is a string in the SDK type)
function toIndexerRow(a: {
  stealthAddress: string;
  etherealPublicKey: string;
  viewTag: number;
  metadata: string;
  blockNumber: number | string;
  transactionHash: string;
  logIndex: number;
}): IndexerAnnouncement {
  return {
    blockNumber: String(a.blockNumber),
    etherealPublicKey: a.etherealPublicKey as \`0x\${string}\`,
    logIndex: a.logIndex,
    metadata: a.metadata as \`0x\${string}\`,
    stealthAddress: a.stealthAddress as \`0x\${string}\`,
    transactionHash: a.transactionHash as \`0x\${string}\`,
    viewTag: a.viewTag,
  };
}

// ── 3) Filter to outputs owned by THIS wallet (WASM scan) ─────────────────
const rows: IndexerAnnouncement[] = subgraphRows.map(toIndexerRow);

const owned = await client.filterOwnedAnnouncements(rows);
// owned: stealthAddress, transactionHash, blockNumber, ephemeralPublicKey, …

// ── 4) Sum native + configured ERC-20 balances across owned stealth addrs ─
// Uses rpcUrl from create(). Default tokens come from OpaqueClient.chainDeployment(chainId);
// pass trackedTokens in create() to add or override tokens.
const byToken = await client.getBalancesFromAnnouncements(rows);
// byToken: { tokenAddress, symbol, decimals, totalRaw }[] — totalRaw in wei / base units`;

const DEPS = `npm install wagmi viem @tanstack/react-query @opaquecash/opaque`;

const PROVIDERS_NOTE = `// Same WagmiProvider + QueryClient setup as the register guide.
// See that page for a full providers.tsx example.`;

const WAGMI_FLOW = `// useOpaqueReceiveBalances.ts
import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useSignMessage,
} from "wagmi";
import {
  OpaqueClient,
  type IndexerAnnouncement,
  type TokenBalanceSummary,
} from "@opaquecash/opaque";

const OPAQUE_KEY_MESSAGE =
  "Sign this message to derive your Opaque Cash stealth keys. This does not approve any transaction.";

type SubgraphAnnouncement = {
  stealthAddress: string;
  etherealPublicKey: string;
  viewTag: number;
  metadata: string;
  blockNumber: number | string;
  transactionHash: string;
  logIndex: number;
};

function toIndexerRow(a: SubgraphAnnouncement): IndexerAnnouncement {
  return {
    blockNumber: String(a.blockNumber),
    etherealPublicKey: a.etherealPublicKey as \`0x\${string}\`,
    logIndex: a.logIndex,
    metadata: a.metadata as \`0x\${string}\`,
    stealthAddress: a.stealthAddress as \`0x\${string}\`,
    transactionHash: a.transactionHash as \`0x\${string}\`,
    viewTag: a.viewTag,
  };
}

type UseOpaqueReceiveBalancesArgs = {
  rpcUrl: string;
  wasmModuleSpecifier: string;
  /** Your indexer: latest page of announcements (same chain as the wallet). */
  fetchAnnouncements: () => Promise<SubgraphAnnouncement[]>;
};

export function useOpaqueReceiveBalances({
  rpcUrl,
  wasmModuleSpecifier,
  fetchAnnouncements,
}: UseOpaqueReceiveBalancesArgs) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { chains } = useConfig();
  const chain = chains.find((c) => c.id === chainId);
  const { signMessageAsync } = useSignMessage();

  const [error, setError] = useState<string | null>(null);
  const [ownedCount, setOwnedCount] = useState<number | null>(null);
  const [balances, setBalances] = useState<TokenBalanceSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setOwnedCount(null);
    setBalances(null);
    if (!isConnected || !address || !chain) {
      setError("Connect the wallet on a configured chain.");
      return;
    }
    if (!OpaqueClient.supportedChainIds().includes(chainId)) {
      setError(\`Opaque has no bundled deployment for chain \${chainId}.\`);
      return;
    }
    setLoading(true);
    try {
      const walletSignature = await signMessageAsync({
        message: OPAQUE_KEY_MESSAGE,
      });
      const client = await OpaqueClient.create({
        chainId,
        rpcUrl,
        walletSignature,
        ethereumAddress: address,
        wasmModuleSpecifier,
      });

      const raw = await fetchAnnouncements();
      const rows = raw.map(toIndexerRow);

      const owned = await client.filterOwnedAnnouncements(rows);
      setOwnedCount(owned.length);

      const byToken = await client.getBalancesFromAnnouncements(rows);
      setBalances(byToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    address,
    chain,
    chainId,
    fetchAnnouncements,
    isConnected,
    rpcUrl,
    signMessageAsync,
    wasmModuleSpecifier,
  ]);

  return {
    refresh,
    error,
    ownedCount,
    balances,
    loading,
    isReady: Boolean(isConnected && address && chain),
  };
}

// PrivateBalanceButton.tsx — implement fetchAnnouncements with Apollo, fetch, etc.
import { useOpaqueReceiveBalances } from "./useOpaqueReceiveBalances";

export function PrivateBalanceButton() {
  const { refresh, error, ownedCount, balances, loading, isReady } =
    useOpaqueReceiveBalances({
      rpcUrl: import.meta.env.VITE_SEPOLIA_RPC_URL,
      wasmModuleSpecifier: "https://www.opaque.cash/pkg/cryptography.js",
      fetchAnnouncements: async () => {
        throw new Error("Replace with Apollo query or fetch to your subgraph");
      },
    });

  return (
    <div>
      <button type="button" disabled={!isReady || loading} onClick={() => void refresh()}>
        {loading ? "Scanning…" : "Refresh private balances"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {ownedCount != null ? <p>Owned outputs: {ownedCount}</p> : null}
      {balances
        ? balances.map((b) => (
            <p key={b.tokenAddress}>
              {b.symbol}: {b.totalRaw.toString()} (raw)
            </p>
          ))
        : null}
    </div>
  );
}`;

const SUBGRAPH_QUERY = `query GetAnnouncements($first: Int!) {
  announcements(first: $first, orderBy: blockNumber, orderDirection: desc) {
    stealthAddress
    etherealPublicKey
    viewTag
    metadata
    blockNumber
    transactionHash
    logIndex
  }
}`;

export function GuideReceive() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">
        Receive & balances
      </h1>
      <p className="text-mist">
        After someone completes a{" "}
        <Link
          to="/guides/send"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          send + announce
        </Link>
        , indexers record each <code>Announcement</code> (stealth address, ephemeral
        pubkey, metadata). Your app fetches that list, passes it to the SDK with the{" "}
        <strong>recipient&apos;s</strong> usual setup: the same{" "}
        <code>OPAQUE_KEY_MESSAGE</code> signature and{" "}
        <code>OpaqueClient.create</code> as in{" "}
        <Link
          to="/guides/register"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Register
        </Link>
        . WASM filters rows to outputs owned by those derived keys;{" "}
        <code>rpcUrl</code> then reads native and ERC-20 balances per unique stealth
        address and aggregates by token.
      </p>
      <p className="text-mist">
        The Opaque web app uses a cached subgraph + RPC scanner (
        <code>useScanner</code>) and matches in the UI with the same WASM primitives.
        For a minimal integration you only need: <strong>fetch announcement rows</strong>{" "}
        → <strong>normalize to </strong>
        <Link
          to="/sdk/indexer"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>IndexerAnnouncement</code>
        </Link>
        → <strong>filter + balance</strong> on <code>OpaqueClient</code>. For
        receive addresses generated <strong>without</strong> an on-chain announcement
        first, see the{" "}
        <Link
          to="/guides/ghost"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Manual ghost receive
        </Link>{" "}
        guide (<code>prepareGhostReceive</code>).
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        SDK responsibilities
      </h2>
      <ul className="list-disc space-y-2 pl-5 text-sm text-mist">
        <li>
          <code>filterOwnedAnnouncements(rows)</code> — runs the stealth ownership
          scan (<code>scan_attestations</code> JSON bridge + WASM). Returns{" "}
          <code>OwnedStealthOutput[]</code> (stealth address, tx hash, block, ephemeral
          pubkey, optional PSR attestation id).
        </li>
        <li>
          <code>getBalancesFromAnnouncements(rows)</code> — calls{" "}
          <code>filterOwnedAnnouncements</code>, dedupes by stealth address, then for
          each tracked token: <code>eth_getBalance</code> or ERC-20{" "}
          <code>balanceOf</code> via the configured <code>PublicClient</code>.
        </li>
        <li>
          Tracked tokens: defaults from{" "}
          <code>OpaqueClient.chainDeployment(chainId).defaultTrackedTokens</code>; merge
          or override with <code>trackedTokens</code> in{" "}
          <Link
            to="/sdk/configuration"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            <code>OpaqueClient.create</code>
          </Link>{" "}
          (native uses sentinel <code>NATIVE_TOKEN_ADDRESS</code>).
        </li>
        <li>
          <strong>Spend / sweep:</strong>{" "}
          <code>getStealthSignerPrivateKey</code> (from an{" "}
          <code>OwnedStealthOutput</code>) or{" "}
          <code>getStealthSignerPrivateKeyFromEphemeralPrivateKey</code> (ghost storage)
          returns the 32-byte key for that one-time address — see{" "}
          <Link
            to="/guides/sweep"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            Spend &amp; sweep
          </Link>
          . You still build and broadcast the transfer (viem/ethers); gas and custody are
          yours. The WASM primitive is also available as{" "}
          <code>@opaquecash/stealth-wasm</code> <code>reconstructSigningKey</code>.
        </li>
        <li>
          PSR-only: <code>discoverTraits(rows)</code> builds reputation traits from the
          same announcement array — see{" "}
          <Link
            to="/guides/psr"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            PSR guide
          </Link>
          .
        </li>
      </ul>

      <CodeBlock
        title="Step-by-step (types + filter + balances)"
        language="ts"
        code={CALldata_OVERVIEW}
      />

      <h2 className="font-display text-xl font-semibold text-white">
        Full flow with wagmi
      </h2>
      <p className="text-mist">
        Mirror the register and send guides: connect wallet, sign{" "}
        <code>OPAQUE_KEY_MESSAGE</code>, <code>OpaqueClient.create</code> with{" "}
        <code>ethereumAddress</code> equal to the connected account (the recipient).
        Implement <code>fetchAnnouncements</code> against your subgraph or API; keep
        field names compatible with{" "}
        <Link
          to="/sdk/indexer"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          IndexerAnnouncement
        </Link>{" "}
        (GraphQL often names the ephemeral field <code>etherealPublicKey</code>).
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-mist">
        <li>
          User is the <strong>recipient</strong>; they must have used the same signing
          message elsewhere so viewing/spending keys match their registered
          meta-address.
        </li>
        <li>
          Fetch a slice of announcements for the chain (ordering, pagination, and
          freshness are your policy).
        </li>
        <li>
          Map each row to <code>IndexerAnnouncement</code> — coerce{" "}
          <code>blockNumber</code> with <code>String(...)</code> if the API returns a
          number.
        </li>
        <li>
          <code>filterOwnedAnnouncements</code> for detail;{" "}
          <code>getBalancesFromAnnouncements</code> for per-token totals.
        </li>
        <li>
          Large announcement sets and many owned outputs imply many RPC reads (one
          balance query per stealth address per token); consider multicall or caching
          for production.
        </li>
      </ol>
      <CodeBlock title="Dependencies" language="bash" code={DEPS} />
      <CodeBlock title="Providers" language="tsx" code={PROVIDERS_NOTE} />
      <CodeBlock
        title="Hook + button (placeholder fetch)"
        language="tsx"
        code={WAGMI_FLOW}
      />
      <p className="text-sm text-mist">
        Typical subgraph query (fields must match{" "}
        <Link
          to="/sdk/indexer"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          IndexerAnnouncement
        </Link>
        ); use <code>@apollo/client</code> or plain <code>fetch</code> to your
        endpoint.
      </p>
      <CodeBlock title="GraphQL (The Graph–style)" language="graphql" code={SUBGRAPH_QUERY} />
    </div>
  );
}
