import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const INDEXER_FLOW = `import {
  OpaqueClient,
  type IndexerAnnouncement,
  type OwnedStealthOutput,
} from "@opaquecash/opaque";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const client = await OpaqueClient.create({ /* … */ });
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

const rows: IndexerAnnouncement[] = await fetchAnnouncementsFromIndexer();
const owned: OwnedStealthOutput[] = await client.filterOwnedAnnouncements(rows);

for (const output of owned) {
  // 32-byte secp256k1 key for this one-time stealth address only
  const stealthPriv = client.getStealthSignerPrivateKey(output);

  const account = privateKeyToAccount(
    (\`0x\${Array.from(stealthPriv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}\`) as Hex,
  );

  const wc = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const bal = await publicClient.getBalance({ address: account.address });
  // Example: sweep native ETH; subtract max fee in production
  const hash = await wc.sendTransaction({
    to: userPublicEoa,
    value: bal,
  });
  // Never log stealthPriv or account; zero the buffer in memory if your runtime allows.
}`;

const GHOST_FLOW = `import { OpaqueClient } from "@opaquecash/opaque";
import { hexToBytes, type Hex } from "viem";

const client = await OpaqueClient.create({ /* … */ });

const ephemeralPriv = hexToBytes(ephemeralPrivateKeyHex as Hex);

const stealthPriv = client.getStealthSignerPrivateKeyFromEphemeralPrivateKey(
  ephemeralPriv,
);
// Same privateKeyToAccount + sendTransaction pattern as indexer-owned outputs.`;

const WARN = `// Custody: anyone with the 32-byte stealth key owns the funds at that address.
// Gas: the stealth address must hold enough native token to pay for the outgoing tx
// (or use a relayer / meta-tx pattern — not provided by the SDK).
// ERC-20: build token.transfer(recipient, amount) calldata signed by the stealth account.`;

export function GuideSweep() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">
        Spend &amp; sweep (one-time key)
      </h1>
      <p className="text-mist">
        After you identify an output as yours — from{" "}
        <Link
          to="/guides/receive"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          indexer announcements
        </Link>{" "}
        or from a{" "}
        <Link
          to="/guides/ghost"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          manual ghost
        </Link>{" "}
        receive — you need the <strong>one-time secp256k1 private key</strong> for that
        stealth address to move funds. The unified client derives it with the same WASM
        primitive as the wallet app: <code>getStealthSignerPrivateKey</code> (ephemeral
        public key from the announcement) or{" "}
        <code>getStealthSignerPrivateKeyFromEphemeralPrivateKey</code> (when you only
        stored the ephemeral secret from <code>prepareGhostReceive</code>).
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        From an owned announcement row
      </h2>
      <p className="text-mist">
        Run <code>filterOwnedAnnouncements</code>, then pass each{" "}
        <code>OwnedStealthOutput</code> to <code>getStealthSignerPrivateKey</code>. Build a
        viem <code>PrivateKeyAccount</code> and sign transactions from the stealth address.
      </p>
      <CodeBlock title="Indexer → key → sweep (sketch)" language="ts" code={INDEXER_FLOW} />

      <h2 className="font-display text-xl font-semibold text-white">
        Ghost manual receive
      </h2>
      <p className="text-mist">
        If there is no announcement row, you still have the 32-byte ephemeral private key
        from <code>prepareGhostReceive</code> — use the second method so you do not need
        to recompute the compressed pubkey yourself.
      </p>
      <CodeBlock title="From stored ephemeral secret" language="ts" code={GHOST_FLOW} />

      <h2 className="font-display text-xl font-semibold text-white">
        Operations the SDK does not build
      </h2>
      <CodeBlock title="Product / security notes" language="ts" code={WARN} />

      <p className="text-sm text-mist">
        API names:{" "}
        <Link
          to="/sdk/api"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          API reference
        </Link>
        . Lower-level access:{" "}
        <code>@opaquecash/stealth-wasm</code> <code>reconstructSigningKey</code> with the
        same master spend/view keys and 33-byte ephemeral pubkey.
      </p>
    </div>
  );
}
