import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const FLOW = `import { OpaqueClient } from "@opaquecash/opaque";
import type { Hex } from "viem";

const client = await OpaqueClient.create({
  chainId,
  rpcUrl,
  walletSignature,
  ethereumAddress: issuerEoa, // issuer wallet — only used for client keys if you also scan; often same pattern as send guide
  wasmModuleSpecifier,
});

// 1) Resolve the recipient’s registered stealth meta-address (same as send flow)
const resolved = await client.resolveRecipientMetaAddress(recipientEoa);
if (!resolved.registered || !resolved.metaAddressHex) {
  throw new Error("Recipient has not registered a meta-address");
}

const attestationId = 1_234_567_890n; // issuer-defined u64, consistent with your attestation registry

// 2) Build announce calldata: StealthAddressAnnouncer.announce — no token transfer
const ann = client.buildAssignReputationTransaction(
  resolved.metaAddressHex as Hex,
  attestationId,
);

// ann: { to, data, chainId, … } — same shape as buildAnnounceTransactionRequest after PSR prep
await walletClient.sendTransaction({
  account: issuerAddress,
  chain,
  to: ann.to,
  data: ann.data,
  value: 0n,
});

// Emits Announcement with PSR metadata; indexers pick up stealthAddress + metadata for trait discovery.`;

const NOTES = `// No separate “reputation registry” contract in this path: binding is the announce
// event + indexer rows. Issuer pays gas for announce (or any relayer with calldata).

// Matches the frontend “Issue Trait” flow: one-time stealth address derived for the
// recipient, metadata encodes the attestation id (see encodeReputationMetadata).

// If you need ERC-20 or other appendages to metadata, use prepareReputationAssignment
// and adjust before buildAnnounceTransactionRequest — the default PSR path is announce-only.`;

export function GuidePsrAssignTransaction() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        Assign reputation (announce)
      </h1>
      <p className="text-mist">
        Issuers use this helper to produce calldata for{" "}
        <code>StealthAddressAnnouncer.announce</code> that binds a programmable trait (
        <code>attestationId</code>) to a freshly derived one-time stealth address for a
        registered recipient. It chains{" "}
        <Link
          to="/guides/psr/metadata-and-assignment"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>prepareReputationAssignment</code>
        </Link>{" "}
        with <code>buildAnnounceTransactionRequest</code>—no asset transfer is built here.
      </p>
      <p className="text-mist">
        Prerequisites: recipient registered on{" "}
        <Link
          to="/guides/register"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          StealthMetaAddressRegistry
        </Link>
        ; same <code>OpaqueClient.create</code> patterns as{" "}
        <Link
          to="/guides/send"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Send &amp; announce
        </Link>
        .
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        End-to-end issuer broadcast
      </h2>
      <CodeBlock title="Resolve → build → sendTransaction" language="ts" code={FLOW} />
      <CodeBlock title="Notes" language="ts" code={NOTES} />

      <h2 className="font-display text-xl font-semibold text-white">
        What recipients do next
      </h2>
      <p className="text-mist">
        After the announcement is indexed, the recipient fetches rows and runs{" "}
        <Link
          to="/guides/psr/discover-traits"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>getReputationTraitsFromAnnouncements</code>
        </Link>{" "}
        to obtain <code>DiscoveredTrait[]</code> for proofs.
      </p>

      <p className="text-sm text-mist">
        Back to{" "}
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
