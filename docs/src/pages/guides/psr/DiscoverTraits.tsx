import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const SCAN = `import { OpaqueClient, type IndexerAnnouncement } from "@opaquecash/opaque";

const client = await OpaqueClient.create({ /* recipient keys + wasm */ });

// Same indexer rows as receive/balance: announcements on this chain (GraphQL, REST, …)
const rows: IndexerAnnouncement[] = await fetchIndexerRowsNormalized();

// Alias of discoverTraits — name reflects reputation UX
const traits = await client.getReputationTraitsFromAnnouncements(rows);
// DiscoveredTrait[] — each item is an owned PSR attestation the WASM scan decoded.

// Fields include attestation id and material needed later for proofs (see stealth signer guide).`;

const VS_FILTER = `// filterOwnedAnnouncements(rows) — balances / “which outputs are mine?”
// getReputationTraitsFromAnnouncements(rows) — PSR trait list + attestation linkage

// Both use the same WASM pipeline over indexer JSON; keep IndexerAnnouncement shape
// identical to /sdk/indexer (blockNumber as string, etherealPublicKey hex, …).`;

const DISCOVER = `// discoverTraits(rows) is the underlying implementation; getReputationTraitsFromAnnouncements
// simply delegates. Prefer the reputation name in PSR-only code for clarity.`;

const DEPS = `npm install wagmi viem @tanstack/react-query @opaquecash/opaque`;

const NORMALIZE = `import type { IndexerAnnouncement } from "@opaquecash/opaque";

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
}`;

const WAGMI_TRAITS = `// usePsrTraits.ts — same wallet + OpaqueClient.create pattern as /guides/receive
import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useSignMessage,
} from "wagmi";
import { OpaqueClient, type IndexerAnnouncement } from "@opaquecash/opaque";

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

type UsePsrTraitsArgs = {
  rpcUrl: string;
  wasmModuleSpecifier: string;
  fetchAnnouncements: () => Promise<SubgraphAnnouncement[]>;
};

export function usePsrTraits({
  rpcUrl,
  wasmModuleSpecifier,
  fetchAnnouncements,
}: UsePsrTraitsArgs) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { chains } = useConfig();
  const chain = chains.find((c) => c.id === chainId);
  const { signMessageAsync } = useSignMessage();

  const [error, setError] = useState<string | null>(null);
  const [traits, setTraits] = useState<Awaited<
    ReturnType<OpaqueClient["getReputationTraitsFromAnnouncements"]
  > | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setTraits(null);
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
      const list = await client.getReputationTraitsFromAnnouncements(rows);
      setTraits(list);
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
    traits,
    loading,
    isReady: Boolean(isConnected && address && chain),
  };
}`;

export function GuidePsrDiscoverTraits() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        Discover traits
      </h1>
      <p className="text-mist">
        Recipients pass the same <code>IndexerAnnouncement[]</code> they use for{" "}
        <Link
          to="/guides/receive"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          receive &amp; balances
        </Link>
        . The client runs the WASM attestation scan (<code>scan_attestations</code>) and
        maps results to <code>DiscoveredTrait[]</code>: programmable traits bound to your
        keys via PSR metadata in each announcement.
      </p>
      <p className="text-mist">
        This method is an <strong>alias</strong> of <code>discoverTraits</code>; use
        whichever name fits your module boundaries.
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        Integration checklist
      </h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-mist">
        <li>
          User is the <strong>recipient</strong>; they must sign{" "}
          <code>OPAQUE_KEY_MESSAGE</code> so viewing keys match their registered meta-address (
          <Link
            to="/guides/register"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            register guide
          </Link>
          ).
        </li>
        <li>
          Fetch announcements for the chain (same query shape as receive — see{" "}
          <Link
            to="/guides/receive"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            Receive
          </Link>{" "}
          GraphQL example).
        </li>
        <li>
          Normalize each row to <code>IndexerAnnouncement</code> (
          <code>blockNumber</code> as string).
        </li>
        <li>
          <code>OpaqueClient.create</code> with <code>ethereumAddress</code> = connected account.
        </li>
        <li>
          <code>getReputationTraitsFromAnnouncements(rows)</code> — empty array if nothing PSR-owned
          in the batch.
        </li>
      </ol>

      <h2 className="font-display text-xl font-semibold text-white">
        Trait discovery
      </h2>
      <CodeBlock title="Recipient scan" language="ts" code={SCAN} />
      <CodeBlock title="Normalize subgraph rows" language="ts" code={NORMALIZE} />
      <CodeBlock title="vs filterOwnedAnnouncements" language="ts" code={VS_FILTER} />
      <CodeBlock title="discoverTraits" language="ts" code={DISCOVER} />

      <h2 className="font-display text-xl font-semibold text-white">
        Full flow with wagmi
      </h2>
      <p className="text-mist">
        Mirrors the receive guide: same providers, signing message, and placeholder{" "}
        <code>fetchAnnouncements</code> hook point (Apollo, <code>fetch</code>, etc.).
      </p>
      <CodeBlock title="Dependencies" language="bash" code={DEPS} />
      <CodeBlock title="Hook + trait list" language="tsx" code={WAGMI_TRAITS} />

      <h2 className="font-display text-xl font-semibold text-white">
        Next steps in the PSR proof flow
      </h2>
      <ul className="list-disc space-y-2 pl-5 text-sm text-mist">
        <li>
          <Link
            to="/guides/psr/witness-json"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            <code>announcementsJsonForReputationWitness</code>
          </Link>{" "}
          — optional Merkle witness input for <code>generateReputationProof</code>.
        </li>
        <li>
          <Link
            to="/guides/psr/stealth-signer-key"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            <code>getStealthSignerPrivateKeyForReputationTrait</code>
          </Link>{" "}
          — one-time signing key for a chosen trait.
        </li>
        <li>
          <Link
            to="/guides/psr/generate-proof"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            <code>generateReputationProof</code>
          </Link>{" "}
          — Groth16 bundle for the verifier contract.
        </li>
      </ul>

      <p className="text-sm text-mist">
        Indexer field reference:{" "}
        <Link
          to="/sdk/indexer"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Indexer format
        </Link>
        .
      </p>
    </div>
  );
}
