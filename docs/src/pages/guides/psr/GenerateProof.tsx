import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const SCOPE = `import { OpaqueClient } from "@opaquecash/opaque";

// Static helpers (same semantics as @opaquecash/psr-core buildActionScope / externalNullifierFromScope)

// Deterministic scope: "chainId:module:actionId" — your app defines module + action strings
const scope = OpaqueClient.buildReputationActionScope({
  chainId: 11_155_111,
  module: "my-reputation-module",
  actionId: "prove-silver-tier",
});

// uint256 external nullifier for the circuit (keccak-derived)
const externalNullifier =
  OpaqueClient.reputationExternalNullifierFromScope(scope);
// Use .toString() when passing to generateReputationProof (expects string)`;

const PROOF = `// trait from getReputationTraitsFromAnnouncements(rows)

const trait = /* selected DiscoveredTrait */;

const proofData = await client.generateReputationProof({
  trait,
  stealthPrivKeyBytes:
    client.getStealthSignerPrivateKeyForReputationTrait(trait),
  externalNullifier: OpaqueClient.reputationExternalNullifierFromScope(
    OpaqueClient.buildReputationActionScope({
      chainId,
      module: "my-reputation-module",
      actionId: "prove-silver-tier",
    }),
  ).toString(),
  attestationsJson: client.announcementsJsonForReputationWitness(rows), // optional
  // artifacts optional — defaults to https://www.opaque.cash/circuits/... (same as the web app)
  onProgress: (p) => {
    /* optional snarkjs progress */
  },
});

// proofData: ProofData — public signals + Groth16 proof for OpaqueReputationVerifier`;

const DEPS = `// Uses @opaquecash/psr-prover under the hood; snarkjs loads wasm/zkey from URLs.
// ensureBufferPolyfill is applied inside the client for browser compatibility.

npm install @opaquecash/opaque snarkjs`;

export function GuidePsrGenerateProof() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        Generate proof &amp; scope
      </h1>
      <p className="text-mist">
        This guide covers the Groth16 prover entry point and the two static helpers on{" "}
        <code>OpaqueClient</code>: <code>buildReputationActionScope</code> and{" "}
        <code>reputationExternalNullifierFromScope</code>. Together they bind a proof to a
        specific on-chain action (nullifier) while keeping the circuit inputs consistent
        with <code>@opaquecash/psr-core</code>.
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        Scope and external nullifier
      </h2>
      <p className="text-mist">
        The scope string identifies <strong>which</strong> reputation action you are
        proving (chain, module name, action id). The external nullifier is the scalar the
        verifier contract uses to prevent double-spends per scope.
      </p>
      <CodeBlock title="OpaqueClient static helpers" language="ts" code={SCOPE} />

      <h2 className="font-display text-xl font-semibold text-white">
        <code>generateReputationProof</code>
      </h2>
      <p className="text-mist">
        Requires the client&apos;s loaded WASM (<code>OpaqueClient.create</code>), a{" "}
        <Link
          to="/guides/psr/discover-traits"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>DiscoveredTrait</code>
        </Link>
        , the{" "}
        <Link
          to="/guides/psr/stealth-signer-key"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          stealth private key
        </Link>
        , optional{" "}
        <Link
          to="/guides/psr/witness-json"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>attestationsJson</code>
        </Link>
        , and optional circuit artifact URLs (defaults to hosted wasm/zkey on opaque.cash).
      </p>
      <CodeBlock title="Full proof generation" language="ts" code={PROOF} />
      <CodeBlock title="Dependencies" language="bash" code={DEPS} />

      <h2 className="font-display text-xl font-semibold text-white">
        After proving
      </h2>
      <p className="text-mist">
        Combine <code>ProofData</code> with a current Merkle root and the same external
        nullifier string for{" "}
        <Link
          to="/guides/psr/reputation-roots"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          root reads
        </Link>{" "}
        and{" "}
        <Link
          to="/guides/psr/verify-on-chain"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          on-chain verification
        </Link>
        .
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
