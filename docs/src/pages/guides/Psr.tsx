import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const METHODS = `// ── Issuer: bind an attestation id to a recipient’s one-time stealth address ──
// buildAssignReputationTransaction(metaAddressHex, attestationId) → announce calldata
// (connected wallet sends the tx; no separate “reputation registry” in this path)

// ── Recipient: discover traits you own from indexer rows ──
// getReputationTraitsFromAnnouncements(rows)  // alias of discoverTraits(rows)

// ── Prove: scope + nullifier + Groth16 ──
// OpaqueClient.buildReputationActionScope({ chainId, module, actionId })
// OpaqueClient.reputationExternalNullifierFromScope(scope) → bigint
// await client.generateReputationProof({
//   trait,
//   stealthPrivKeyBytes: client.getStealthSignerPrivateKeyForReputationTrait(trait),
//   externalNullifier: OpaqueClient.reputationExternalNullifierFromScope(scope).toString(),
//   attestationsJson: client.announcementsJsonForReputationWitness(rows), // optional Merkle witness
//   // artifacts optional — defaults to hosted /circuits/ on opaque.cash
// })

// ── Verifier contract (needs bundled or overridden opaqueReputationVerifier) ──
// await client.fetchLatestValidReputationRoot()
// await client.verifyReputationProofView({ proofData, merkleRoot, externalNullifier })
// await client.submitReputationVerification(walletClient, { proofData, merkleRoot, externalNullifier })`;

const IMPORTS = `import {
  OpaqueClient,
  type VerifyReputationArgs,
  type ArtifactPaths,
} from "@opaquecash/opaque";
// ProofData, buildActionScope, externalNullifierFromScope also exported from @opaquecash/opaque`;

const GUIDE_LINK_CLASS =
  "block rounded-lg border border-ink-600 bg-ink-900/40 p-4 transition hover:border-glow/40 hover:bg-ink-900/70";

export function GuidePsr() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        PSR traits
      </h1>
      <p className="text-mist">
        Programmable Stealth Reputation: issuers embed an <strong>attestation id</strong>{" "}
        in announcement metadata; recipients discover traits via WASM scan; selective
        disclosure uses Groth16 + <code>OpaqueReputationVerifier</code>. The unified client
        exposes dedicated methods for each step—each has a full guide below.
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        Guides (reputation API)
      </h2>
      <ul className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
        <li>
          <Link to="/guides/psr/metadata-and-assignment" className={GUIDE_LINK_CLASS}>
            <span className="font-display text-base font-semibold text-white sm:text-lg">
              Metadata &amp; assignment prep
            </span>
            <p className="mt-1 text-sm text-mist">
              WASM-canonical PSR metadata bytes and full stealth prep for issuers (
              <code className="text-glow/80">encodeReputationMetadata</code>,{" "}
              <code className="text-glow/80">prepareReputationAssignment</code>).
            </p>
          </Link>
        </li>
        <li>
          <Link to="/guides/psr/assign-transaction" className={GUIDE_LINK_CLASS}>
            <span className="font-display text-base font-semibold text-white sm:text-lg">
              Assign reputation (announce)
            </span>
            <p className="mt-1 text-sm text-mist">
              <code>announce</code> calldata to bind a trait to a one-time address via{" "}
              <code className="text-glow/80">buildAssignReputationTransaction</code>.
            </p>
          </Link>
        </li>
        <li>
          <Link to="/guides/psr/discover-traits" className={GUIDE_LINK_CLASS}>
            <span className="font-display text-base font-semibold text-white sm:text-lg">
              Discover traits
            </span>
            <p className="mt-1 text-sm text-mist">
              <code className="text-glow/80">getReputationTraitsFromAnnouncements</code> (alias of{" "}
              <code>discoverTraits</code>): <code>DiscoveredTrait[]</code> from indexer rows.
            </p>
          </Link>
        </li>
        <li>
          <Link to="/guides/psr/witness-json" className={GUIDE_LINK_CLASS}>
            <span className="font-display text-base font-semibold text-white sm:text-lg">
              Witness JSON
            </span>
            <p className="mt-1 text-sm text-mist">
              Canonical JSON for Merkle witness input via{" "}
              <code className="text-glow/80">announcementsJsonForReputationWitness</code>.
            </p>
          </Link>
        </li>
        <li>
          <Link to="/guides/psr/stealth-signer-key" className={GUIDE_LINK_CLASS}>
            <span className="font-display text-base font-semibold text-white sm:text-lg">
              Stealth signer key
            </span>
            <p className="mt-1 text-sm text-mist">
              One-time secp256k1 key from a trait with{" "}
              <code className="text-glow/80">getStealthSignerPrivateKeyForReputationTrait</code>.
            </p>
          </Link>
        </li>
        <li>
          <Link to="/guides/psr/generate-proof" className={GUIDE_LINK_CLASS}>
            <span className="font-display text-base font-semibold text-white sm:text-lg">
              Generate proof &amp; scope
            </span>
            <p className="mt-1 text-sm text-mist">
              Groth16 via <code className="text-glow/80">generateReputationProof</code>, plus{" "}
              <code className="text-glow/80">buildReputationActionScope</code> /{" "}
              <code className="text-glow/80">reputationExternalNullifierFromScope</code>.
            </p>
          </Link>
        </li>
        <li>
          <Link to="/guides/psr/reputation-roots" className={GUIDE_LINK_CLASS}>
            <span className="font-display text-base font-semibold text-white sm:text-lg">
              Reputation Merkle roots
            </span>
            <p className="mt-1 text-sm text-mist">
              Root history on <code>OpaqueReputationVerifier</code> (
              <code className="text-glow/80">fetchLatestValidReputationRoot</code>,{" "}
              <code className="text-glow/80">isReputationRootValid</code>,{" "}
              <code className="text-glow/80">fetchReputationRootHistory</code>).
            </p>
          </Link>
        </li>
        <li>
          <Link to="/guides/psr/verify-on-chain" className={GUIDE_LINK_CLASS}>
            <span className="font-display text-base font-semibold text-white sm:text-lg">
              Verify on-chain
            </span>
            <p className="mt-1 text-sm text-mist">
              Read-only check, simulate, and submit:{" "}
              <code className="text-glow/80">verifyReputationProofView</code>,{" "}
              <code className="text-glow/80">simulateReputationVerification</code>,{" "}
              <code className="text-glow/80">submitReputationVerification</code>.
            </p>
          </Link>
        </li>
      </ul>

      <h2 className="font-display text-xl font-semibold text-white">
        Flow sketch
      </h2>
      <CodeBlock title="Grouped by role" language="ts" code={METHODS} />
      <CodeBlock title="Imports" language="ts" code={IMPORTS} />

      <p className="text-sm text-mist">
        Verifier RPC methods require <code>opaqueReputationVerifier</code> on the active chain (
        bundled for Sepolia or override via <code>contracts</code> in{" "}
        <code>OpaqueClient.create</code>). See also the{" "}
        <Link
          to="/sdk/api"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          API reference
        </Link>
        ,{" "}
        <Link
          to="/guides/register"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Register
        </Link>
        ,{" "}
        <Link
          to="/guides/send"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Send
        </Link>
        , and{" "}
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
