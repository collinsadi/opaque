import { CodeBlock } from "@/components/CodeBlock";

const FIELDS = `interface OpaqueClientConfig {
  /** Must match a bundled deployment or you must patch contracts via overrides (future). */
  chainId: number;
  /** Used for getBalance + balanceOf reads. Browser apps need CORS-friendly RPCs or a proxy. */
  rpcUrl: string;
  /** Wallet signature (hex). Expanded with HKDF domain "opaque-cash-v1" into view + spend keys. */
  walletSignature: \`0x\${string}\`;
  /** The user’s EOA — typically msg.sender for register/announce txs you submit. */
  ethereumAddress: \`0x\${string}\`;
  /** Dynamic import URL for wasm-pack cryptography.js (default: https://www.opaque.cash/pkg/cryptography.js) */
  wasmModuleSpecifier: string;
  /** Optional extra ERC-20s; merged with chain defaults (ETH, USDC, USDT on Sepolia). */
  trackedTokens?: TrackedToken[];
  contracts?: {
    stealthMetaAddressRegistry?: \`0x\${string}\`;
    stealthAddressAnnouncer?: \`0x\${string}\`;
    opaqueReputationVerifier?: \`0x\${string}\`;
  };
}`;

export function Configuration() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">Configuration</h1>
      <p className="text-mist">
        All runtime behavior hangs off <code>OpaqueClient.create(config)</code>. Switch
        users or networks by creating a <strong>new</strong> client instance.
      </p>
      <CodeBlock title="OpaqueClientConfig" language="ts" code={FIELDS} />
      <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
        <li>
          <strong className="text-white">Constants:</strong>{" "}
          <code>OpaqueClient.supportedChainIds()</code>,{" "}
          <code>OpaqueClient.chainDeployment(id)</code>
        </li>
        <li>
          <strong className="text-white">Meta-address:</strong>{" "}
          <code>client.getMetaAddressHex()</code> after create
        </li>
        <li>
          <strong className="text-white">Contracts:</strong>{" "}
          <code>client.getContracts()</code>
        </li>
        <li>
          <strong className="text-white">WASM:</strong>{" "}
          <code>wasmModuleSpecifier</code> can be{" "}
          <a
            href="https://www.opaque.cash/pkg/cryptography.js"
            className="text-glow underline decoration-glow/40 hover:decoration-glow"
          >
            https://www.opaque.cash/pkg/cryptography.js
          </a>{" "}
          unless you host the bundle yourself.
        </li>
      </ul>
    </div>
  );
}
