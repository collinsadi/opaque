import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const ARGS = `import { OpaqueClient, type VerifyReputationArgs } from "@opaquecash/opaque";

// Built from generateReputationProof + merkle root + same external nullifier string as proving
const args: VerifyReputationArgs = {
  proofData, // from generateReputationProof
  merkleRoot: latestRootFromIndexerOrRpc, // decimal or hex string; normalized on-chain
  externalNullifier: OpaqueClient.reputationExternalNullifierFromScope(scope).toString(),
};`;

const VIEW = `// Read-only: verifyReputationView — does not consume nullifier
const valid = await client.verifyReputationProofView(args);
// boolean`;

const SIM = `import type { WalletClient } from "viem";

// Preflight: estimate gas, catch reverts (invalid root, bad proof, etc.)
await client.simulateReputationVerification(walletClient, args);`;

const SUBMIT = `// State-changing: verifyReputation — consumes nullifier on success
const txHash = await client.submitReputationVerification(walletClient, args);
// Returns transaction hash`;

const FLOW = `// Typical order:
// 1) verifyReputationProofView (optional UX / debugging)
// 2) simulateReputationVerification (gas / revert check)
// 3) submitReputationVerification (user confirms wallet tx)`;

export function GuidePsrVerifyOnChain() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        Verify on-chain
      </h1>
      <p className="text-mist">
        After{" "}
        <Link
          to="/guides/psr/generate-proof"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          generating a proof
        </Link>{" "}
        and choosing a valid Merkle root (see{" "}
        <Link
          to="/guides/psr/reputation-roots"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          reputation roots
        </Link>
        ), submit the bundle to <code>OpaqueReputationVerifier</code>. The SDK wraps
        three entry points: view-only verification, simulation, and the paying
        transaction that enforces nullifier uniqueness.
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        <code>VerifyReputationArgs</code>
      </h2>
      <p className="text-mist">
        <code>merkleRoot</code> can be a decimal or hex string; the chain layer normalizes
        to <code>bytes32</code>. It must be accepted by{" "}
        <code>isRootValid</code> at transaction time or the call reverts (
        <code>RootExpiredError</code> in simulation helpers).
      </p>
      <CodeBlock title="Argument shape" language="ts" code={ARGS} />

      <h2 className="font-display text-xl font-semibold text-white">
        <code>verifyReputationProofView(args)</code>
      </h2>
      <p className="text-mist">
        Maps to the contract&apos;s view helper: checks the proof without spending the
        nullifier—safe for dry runs and server-side validation.
      </p>
      <CodeBlock title="Read-only check" language="ts" code={VIEW} />

      <h2 className="font-display text-xl font-semibold text-white">
        <code>simulateReputationVerification(wallet, args)</code>
      </h2>
      <p className="text-mist">
        Runs the same validation as the real tx (including root validity) via{" "}
        <code>eth_call</code>-style simulation with the user&apos;s account—useful for gas
        estimation and error messages before broadcast.
      </p>
      <CodeBlock title="Simulate" language="ts" code={SIM} />

      <h2 className="font-display text-xl font-semibold text-white">
        <code>submitReputationVerification(wallet, args)</code>
      </h2>
      <p className="text-mist">
        Sends <code>verifyReputation</code>; on success the nullifier is marked used so
        the same proof parameters cannot replay.
      </p>
      <CodeBlock title="Broadcast" language="ts" code={SUBMIT} />
      <CodeBlock title="Suggested flow" language="ts" code={FLOW} />

      <p className="text-mist text-sm">
        Requires <code>opaqueReputationVerifier</code> on the active chain—see the{" "}
        <Link
          to="/guides/psr/reputation-roots"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          roots guide
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
