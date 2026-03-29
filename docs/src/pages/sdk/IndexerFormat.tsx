import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const SHAPE = `type IndexerAnnouncement = {
  __typename?: string;
  id?: string;
  blockNumber: string;       // decimal string, e.g. "10533630"
  etherealPublicKey: \`0x\${string}\`; // ephemeral secp256k1 pubkey (33-byte compressed)
  logIndex: number;
  metadata: \`0x\${string}\`;
  stealthAddress: \`0x\${string}\`;
  transactionHash: \`0x\${string}\`;
  viewTag: number;           // 0–255, mirrors metadata[0]
};`;

export function IndexerFormat() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">
        Indexer / subgraph shape
      </h1>
      <p className="text-mist">
        The unified client accepts the array your indexer already returns. Internally
        rows are converted to the JSON shape expected by{" "}
        <code>scan_attestations_wasm</code>.
      </p>
      <CodeBlock title="IndexerAnnouncement" language="ts" code={SHAPE} />
      <p className="text-sm text-mist">
        Use <code>indexerAnnouncementsToScannerJson(rows)</code> (exported from{" "}
        <code>@opaquecash/opaque</code>) to inspect the normalized payload in the{" "}
        <Link to="/playground" className="text-glow underline">
          Playground
        </Link>
        .
      </p>
    </div>
  );
}
