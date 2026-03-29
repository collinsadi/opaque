import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const WITNESS = `import { OpaqueClient, type IndexerAnnouncement } from "@opaquecash/opaque";

const client = await OpaqueClient.create({ /* … */ });
const rows: IndexerAnnouncement[] = /* same set you pass to discoverTraits */;

// JSON string in the format the WASM Merkle / prover expects (scanner pipeline input)
const attestationsJson = client.announcementsJsonForReputationWitness(rows);

// Pass to generateReputationProof({ …, attestationsJson }) when your circuit proves
// membership against the indexed announcement set (optional — omit if your proof path
// does not need the witness bundle).`;

const INTERNAL = `// Implementation forwards to indexerAnnouncementsToScannerJson(rows) — identical
// serialization to the internal discoverTraits path, so witness and trait scan stay consistent.`;

const PROOF = `await client.generateReputationProof({
  trait: selectedTrait,
  stealthPrivKeyBytes: client.getStealthSignerPrivateKeyForReputationTrait(selectedTrait),
  externalNullifier: OpaqueClient.reputationExternalNullifierFromScope(scope).toString(),
  attestationsJson, // optional
  // artifacts optional — defaults to https://www.opaque.cash/circuits/...
});`;

export function GuidePsrWitnessJson() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        Witness JSON
      </h1>
      <p className="text-mist">
        When the reputation circuit proves inclusion against your indexer&apos;s
        announcement Merkle tree, the prover needs the same canonical JSON the WASM
        scanner uses. This helper serializes <code>IndexerAnnouncement[]</code> to that
        string so you can pass it as <code>attestationsJson</code> into{" "}
        <Link
          to="/guides/psr/generate-proof"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>generateReputationProof</code>
        </Link>
        .
      </p>
      <p className="text-mist">
        Use the <strong>same</strong> row set (and normalization) as{" "}
        <Link
          to="/guides/psr/discover-traits"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>getReputationTraitsFromAnnouncements</code>
        </Link>{" "}
        to avoid witness / trait mismatches.
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        Serialization
      </h2>
      <CodeBlock title="Witness string for the prover" language="ts" code={WITNESS} />
      <CodeBlock title="Consistency" language="ts" code={INTERNAL} />

      <h2 className="font-display text-xl font-semibold text-white">
        Wiring into <code>generateReputationProof</code>
      </h2>
      <CodeBlock title="Optional attestationsJson" language="ts" code={PROOF} />

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
