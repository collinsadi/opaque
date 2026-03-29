import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const OVERVIEW = `// Ghost (manual) receive: one-time stealth address for YOUR meta-address with no
// prior on-chain announcement. You share the stealth address; the payer sends ETH/tokens
// there. You must store ephemeralPrivateKey (32 bytes) — losing it means you cannot sweep
// or retroactively announce with the SDK helpers.

import { OpaqueClient } from "@opaquecash/opaque";

const client = await OpaqueClient.create({
  chainId,
  rpcUrl,
  walletSignature,
  ethereumAddress,
  wasmModuleSpecifier,
});

// 1) Generate a fresh one-time receive address (same math as send-to-self).
const ghost = client.prepareGhostReceive();
// ghost.stealthAddress — show QR / copy for the payer
// ghost.ephemeralPrivateKey — encrypt and persist (never log in production)

// 2a) If you still have the full \`ghost\` object when announcing:
const annFull = client.buildAnnounceTransactionRequest(ghost);

// 2b) If you only persisted ephemeralPrivateKey and reload later:
const annFromSecret = client.buildAnnounceTransactionRequestForGhost(
  ghost.ephemeralPrivateKey,
);
// annFull and annFromSecret match when using the same secret + same client keys.

await walletClient.sendTransaction({
  account: someAccount, // anyone with gas can call announce
  chain,
  to: annFromSecret.to,
  data: annFromSecret.data,
  value: 0n,
});

// Until you announce, indexers will not list this output — track the stealth address
// yourself (balances via eth_getBalance / balanceOf) or announce to join the global set.`;

const STORAGE_NOTE = `// Example: persist only what you need (app-specific encryption recommended)
type StoredGhost = {
  chainId: number;
  stealthAddress: \`0x\${string}\`;
  /** 0x + 64 hex chars */
  ephemeralPrivateKeyHex: \`0x\${string}\`;
  createdAt: number;
};

function ghostToStored(
  chainId: number,
  prep: Awaited<ReturnType<OpaqueClient["prepareGhostReceive"]>>,
): StoredGhost {
  return {
    chainId,
    stealthAddress: prep.stealthAddress,
    ephemeralPrivateKeyHex: (\`0x\${Array.from(prep.ephemeralPrivateKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}\`) as \`0x\${string}\`,
    createdAt: Date.now(),
  };
}`;

export function GuideGhost() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">
        Manual ghost receive
      </h1>
      <p className="text-mist">
        A <strong>ghost</strong> receive is a one-time stealth address derived from your
        registered meta-address, <strong>before</strong> any{" "}
        <code>StealthAddressAnnouncer</code> log exists for that output. Payers send to
        the address you show; scanners that only read announcements will not see it until
        you optionally publish a retroactive announcement. Same cryptography as{" "}
        <Link
          to="/guides/send"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Send &amp; announce
        </Link>
        , but the &quot;recipient&quot; meta-address is your own — see{" "}
        <code>prepareGhostReceive</code> in the{" "}
        <Link
          to="/sdk/api"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          API reference
        </Link>
        .
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        What you must persist
      </h2>
      <p className="text-mist">
        The protocol does not recover <code>ephemeralPrivateKey</code> from chain data
        alone before an announcement. Your app should store it (encrypted at rest), or
        store the full <code>PrepareGhostReceiveResult</code>. Device loss without backup
        means you cannot prove ownership of that stealth address with the usual SDK
        helpers. The Opaque web app keeps ghost rows in local storage for the same reason
        — see the product disclaimer.
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        SDK flow
      </h2>
      <CodeBlock title="prepareGhostReceive + announce (full or from secret)" language="ts" code={OVERVIEW} />

      <h2 className="font-display text-xl font-semibold text-white">
        Storage sketch
      </h2>
      <p className="text-mist">
        Serialize <code>ephemeralPrivateKey</code> as hex if you store JSON; reload as{" "}
        <code>Uint8Array</code> before calling{" "}
        <code>buildAnnounceTransactionRequestForGhost</code>.
      </p>
      <CodeBlock title="Types + hex" language="ts" code={STORAGE_NOTE} />

      <h2 className="font-display text-xl font-semibold text-white">
        After an announcement
      </h2>
      <p className="text-mist">
        Once announced, your output can appear in indexer feeds like any other receive.
        Use <code>filterOwnedAnnouncements</code> as in the{" "}
        <Link
          to="/guides/receive"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Receive &amp; balances
        </Link>{" "}
        guide.
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        Spending without announcing
      </h2>
      <p className="text-mist">
        Use <code>getStealthSignerPrivateKeyFromEphemeralPrivateKey</code> with your stored
        32-byte ephemeral secret, then sign a transfer from the stealth address — see the{" "}
        <Link
          to="/guides/sweep"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Spend &amp; sweep
        </Link>{" "}
        guide.
      </p>
    </div>
  );
}
