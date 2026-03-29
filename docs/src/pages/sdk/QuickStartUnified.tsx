import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const CODE = `import { OpaqueClient } from "@opaquecash/opaque";

const client = await OpaqueClient.create({
  chainId: 11155111,
  rpcUrl: "https://sepolia.infura.io/v3/…",
  walletSignature: signatureHex,      // HKDF entropy — never sent on-chain by SDK
  ethereumAddress: connectedAddress, // same account that signs / will submit txs
  wasmModuleSpecifier: "https://www.opaque.cash/pkg/cryptography.js",
  // or self-host: new URL("/pkg/cryptography.js", import.meta.url).href,
});

// Constants for your UI
console.log(OpaqueClient.supportedChainIds());
console.log(OpaqueClient.chainDeployment(11155111));

// Calldata: you prompt the user to send the tx
const register = client.buildRegisterMetaAddressTransaction();
const send = client.prepareStealthSend(recipientMetaAddressHex);
const announce = client.buildAnnounceTransactionRequest(send);

// Indexer rows → owned outputs + balances
const owned = await client.filterOwnedAnnouncements(rowsFromSubgraph);
const balances = await client.getBalancesFromAnnouncements(rowsFromSubgraph);`;

export function QuickStartUnified() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">
        Quick start — unified client
      </h1>
      <p className="text-mist">
        One import (<code>@opaquecash/opaque</code>), one async factory, then registry /
        announce calldata, scanning, and balances — all scoped to the configuration
        you passed at creation time.
      </p>
      <CodeBlock title="app.ts" language="ts" code={CODE} />
      <p className="text-sm text-mist">
        Modular packages (<code>@opaquecash/stealth-core</code>, etc.) remain available;
        see{" "}
        <Link
          to="/reference/modular"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          modular packages
        </Link>
        .
      </p>
    </div>
  );
}
