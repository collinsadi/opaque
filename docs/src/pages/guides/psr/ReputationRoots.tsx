import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const ROOTS = `import { OpaqueClient } from "@opaquecash/opaque";
import type { Hex } from "viem";

const client = await OpaqueClient.create({
  chainId,
  rpcUrl,
  walletSignature,
  ethereumAddress,
  wasmModuleSpecifier,
  // opaqueReputationVerifier is bundled for Sepolia or set via contracts.opaqueReputationVerifier
});

// Latest root accepted by OpaqueReputationVerifier (non-expired slot in rootHistory)
const latestRoot: Hex = await client.fetchLatestValidReputationRoot();

// Check before proving or submitting: is this root still valid?
const ok = await client.isReputationRootValid(latestRoot);

// Debug / UI: full history with per-entry validity
const history = await client.fetchReputationRootHistory();
// { index, root, valid }[] — newest last`;

const CONFIG = `// If you see: "opaqueReputationVerifier is not configured for this chain"
// → pass contracts: { opaqueReputationVerifier: "0x…" } in OpaqueClient.create, or use
// a chain that ships with bundled deployments (OpaqueClient.supportedChainIds()).`;

const PROOF = `// generateReputationProof output includes public signals; VerifyReputationArgs.merkleRoot
// must match a root the verifier accepts — usually the same root you fetched from
// fetchLatestValidReputationRoot() or your indexer’s view of the reputation tree.`;

export function GuidePsrReputationRoots() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        Reputation Merkle roots
      </h1>
      <p className="text-mist">
        The <code>OpaqueReputationVerifier</code> contract stores a history of Merkle
        roots; proofs are only valid when the root you pass is currently accepted (not
        expired). The client exposes three read methods for that state.
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        <code>fetchLatestValidReputationRoot()</code>
      </h2>
      <p className="text-mist">
        Returns the latest <strong>non-expired</strong> root from{" "}
        <code>rootHistory</code>—the usual choice when assembling{" "}
        <Link
          to="/guides/psr/verify-on-chain"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>VerifyReputationArgs.merkleRoot</code>
        </Link>
        .
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        <code>isReputationRootValid(root)</code>
      </h2>
      <p className="text-mist">
        Boolean check: whether the verifier currently considers this <code>bytes32</code>{" "}
        root valid (exists and not past expiry).
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        <code>fetchReputationRootHistory()</code>
      </h2>
      <p className="text-mist">
        Full list with <code>index</code>, <code>root</code>, and <code>valid</code> per
        entry—useful for dashboards or picking a root that matches your indexer snapshot.
      </p>

      <CodeBlock title="RPC reads" language="ts" code={ROOTS} />
      <CodeBlock title="Configuration" language="ts" code={CONFIG} />
      <CodeBlock title="Link to proofs" language="ts" code={PROOF} />

      <p className="text-mist text-sm">
        See also{" "}
        <Link
          to="/sdk/configuration"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Configuration
        </Link>{" "}
        for contract overrides.
      </p>

      <p className="text-sm text-mist">
        <Link
          to="/guides/psr"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          PSR overview
        </Link>
      </p>
    </div>
  );
}
