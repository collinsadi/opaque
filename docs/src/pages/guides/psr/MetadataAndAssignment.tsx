import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const ENCODE = `import { OpaqueClient } from "@opaquecash/opaque";
import type { Hex } from "viem";

// After OpaqueClient.create({ chainId, rpcUrl, walletSignature, ethereumAddress, wasmModuleSpecifier })
const client = await OpaqueClient.create({ /* … */ });

// Low-level: PSR metadata = view tag (1 byte) + marker 0xA7 + attestation id (u64 LE)
// Encoding is WASM-canonical — always use this helper instead of hand-packing bytes.
const viewTag = 42; // 0–255; comes from the same ECDH path as a normal stealth send
const attestationId = 1_234_567_890n; // your registry / issuer’s u64 trait id

const metadata = client.encodeReputationMetadata(viewTag, attestationId);
// Uint8Array suitable for StealthAddressAnnouncer metadata field`;

const PREP = `import type { Hex } from "viem";

// Issuer: recipient must be registered (66-byte meta-address on StealthMetaAddressRegistry)
const recipientMetaAddressHex = "0x…" as Hex; // from resolveRecipientMetaAddress or off-chain
const attestationId = 1_234_567_890n;

// Combines prepareStealthSend(meta) with encodeReputationMetadata(viewTag, attestationId)
const prep = client.prepareReputationAssignment(recipientMetaAddressHex, attestationId);

// prep includes: stealthAddress, ephemeralPrivateKey, ephemeralPublicKey, viewTag, metadata (PSR), …
// Same shape as prepareStealthSend except metadata is the full PSR blob (not 1-byte-only).`;

const RELATION = `// Typical issuer path skips the two calls above and uses one shot:
// buildAssignReputationTransaction(meta, attestationId)
// → internally: prepareReputationAssignment → buildAnnounceTransactionRequest
// See the “Assign reputation transaction” guide for broadcasting announce.`;

export function GuidePsrMetadataAndAssignment() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        Metadata &amp; assignment prep
      </h1>
      <p className="text-mist">
        Programmable Stealth Reputation embeds an <strong>attestation id</strong> in{" "}
        <code>Announcement</code> metadata so recipients can discover traits with the same
        WASM scan used for balances. These two methods build that metadata on top of the
        usual stealth send math: first you encode bytes, then you get a full{" "}
        <code>PrepareStealthSendResult</code> with PSR metadata instead of the default
        single-byte view tag.
      </p>
      <p className="text-mist">
        Read the{" "}
        <Link
          to="/guides/psr"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          PSR overview
        </Link>{" "}
        first. For normal (non-PSR) sends, see{" "}
        <Link
          to="/guides/send"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Send &amp; announce
        </Link>
        .
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        <code>encodeReputationMetadata(viewTag, attestationId)</code>
      </h2>
      <p className="text-mist">
        Calls into WASM (<code>encodeAttestationMetadata</code>) so the layout matches
        Rust and the prover: view tag, marker byte <code>0xA7</code>, and a little-endian
        u64. Use this if you already have a <code>viewTag</code> and need metadata in
        isolation—for example custom flows that call{" "}
        <code>buildAnnounceTransactionRequest</code> yourself.
      </p>
      <CodeBlock title="Encode only" language="ts" code={ENCODE} />

      <h2 className="font-display text-xl font-semibold text-white">
        <code>prepareReputationAssignment(recipientMetaAddressHex, attestationId)</code>
      </h2>
      <p className="text-mist">
        Resolves the recipient&apos;s meta-address, runs the same ephemeral ECDH path as{" "}
        <code>prepareStealthSend</code>, then replaces <code>metadata</code> with the PSR
        encoding for that derived <code>viewTag</code> and your{" "}
        <code>attestationId</code>. You get a one-time stealth address and secrets; no
        asset transfer is implied—only the metadata shape changes vs a standard send prep.
      </p>
      <CodeBlock title="Full prep (issuer)" language="ts" code={PREP} />
      <CodeBlock title="Relation to announce helper" language="ts" code={RELATION} />

      <p className="text-sm text-mist">
        Next:{" "}
        <Link
          to="/guides/psr/assign-transaction"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Assign reputation transaction
        </Link>{" "}
        ·{" "}
        <Link
          to="/sdk/api"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          API reference
        </Link>
      </p>
    </div>
  );
}
