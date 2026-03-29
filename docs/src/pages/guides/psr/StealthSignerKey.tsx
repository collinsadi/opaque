import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const KEY = `import { OpaqueClient, type DiscoveredTrait } from "@opaquecash/opaque";

const client = await OpaqueClient.create({ /* recipient */ });

const traits = await client.getReputationTraitsFromAnnouncements(rows);
const trait: DiscoveredTrait = traits[0]; // user-selected trait to prove

// Requires trait.ephemeralPubkey from the scan (discoverTraits / getReputationTraitsFromAnnouncements)
const stealthPrivKeyBytes = client.getStealthSignerPrivateKeyForReputationTrait(trait);
// Uint8Array length 32 — secp256k1 signing key for the one-time stealth address

// Feed directly into generateReputationProof({ stealthPrivKeyBytes, … })`;

const EPHEMERAL = `// If ephemeralPubkey is missing, the client throws:
// "DiscoveredTrait.ephemeralPubkey is required (use discoverTraits / getReputationTraitsFromAnnouncements)"

// This is the same WASM path as getStealthSignerPrivateKey(ownedOutput) for balances,
// but takes a DiscoveredTrait and reconstructs the ephemeral pubkey hex from the trait.`;

const SWEEP = `// For spending funds (not reputation proofs), use getStealthSignerPrivateKey on
// OwnedStealthOutput or getStealthSignerPrivateKeyFromEphemeralPrivateKey — see
// /guides/sweep. PSR proofs specifically need the trait-shaped API above.`;

export function GuidePsrStealthSignerKey() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
        Stealth signer key
      </h1>
      <p className="text-mist">
        A Groth16 reputation proof needs the recipient&apos;s <strong>one-time stealth
        signing key</strong> for the output associated with the trait. After{" "}
        <Link
          to="/guides/psr/discover-traits"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          discovering traits
        </Link>
        , call this method with the chosen <code>DiscoveredTrait</code> to get the 32-byte
        key consumed by{" "}
        <Link
          to="/guides/psr/generate-proof"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          <code>generateReputationProof</code>
        </Link>
        .
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        Usage
      </h2>
      <CodeBlock title="From trait to private key" language="ts" code={KEY} />
      <CodeBlock title="Ephemeral pubkey requirement" language="ts" code={EPHEMERAL} />
      <CodeBlock title="Related: spend/sweep keys" language="ts" code={SWEEP} />

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
