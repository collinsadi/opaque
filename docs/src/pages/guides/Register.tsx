import { CodeBlock } from "@/components/CodeBlock";

const CALldata_ONLY = `const client = await OpaqueClient.create({ /* … */ });

const tx = client.buildRegisterMetaAddressTransaction();
// tx.to === registry
// tx.data === encoded registerKeys(schemeId, metaAddressHex)

await walletClient.sendTransaction({
  account: userAddress,
  chain,
  to: tx.to,
  data: tx.data,
});`;

const DEPS = `npm install wagmi viem @tanstack/react-query @opaquecash/opaque`;

const PROVIDERS = `// app/providers.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}`;

const WAGMI_FLOW = `// useRegisterOpaqueMetaAddress.ts
import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  usePublicClient,
  useSignMessage,
  useWalletClient,
} from "wagmi";
import { OpaqueClient } from "@opaquecash/opaque";

/** Same string as the Opaque app — HKDF domain is still \`opaque-cash-v1\`. */
const OPAQUE_KEY_MESSAGE =
  "Sign this message to derive your Opaque Cash stealth keys. This does not approve any transaction.";

type RegisterOpaqueArgs = {
  /** HTTPS RPC for the active chain (CORS-friendly in the browser). */
  rpcUrl: string;
  /** wasm-pack \`cryptography.js\` URL (default: https://www.opaque.cash/pkg/cryptography.js). */
  wasmModuleSpecifier: string;
};

export function useRegisterOpaqueMetaAddress({
  rpcUrl,
  wasmModuleSpecifier,
}: RegisterOpaqueArgs) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { chains } = useConfig();
  const chain = chains.find((c) => c.id === chainId);
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const { signMessageAsync } = useSignMessage();

  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const register = useCallback(async () => {
    setError(null);
    setTxHash(null);
    if (!isConnected || !address || !walletClient || !chain || !publicClient) {
      setError("Connect the wallet on a configured chain.");
      return;
    }
    if (!OpaqueClient.supportedChainIds().includes(chainId)) {
      setError(\`Opaque has no bundled deployment for chain \${chainId}.\`);
      return;
    }
    try {
      const walletSignature = await signMessageAsync({
        message: OPAQUE_KEY_MESSAGE,
      });
      const client = await OpaqueClient.create({
        chainId,
        rpcUrl,
        walletSignature,
        ethereumAddress: address,
        wasmModuleSpecifier,
      });
      const tx = client.buildRegisterMetaAddressTransaction();
      const hash = await walletClient.sendTransaction({
        account: address,
        chain,
        to: tx.to,
        data: tx.data,
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    address,
    chain,
    chainId,
    isConnected,
    publicClient,
    rpcUrl,
    signMessageAsync,
    walletClient,
    wasmModuleSpecifier,
  ]);

  return {
    register,
    error,
    txHash,
    isReady: Boolean(
      isConnected && address && chain && walletClient && publicClient,
    ),
  };
}

// RegisterButton.tsx — wire RPC + WASM URL from env or config
import { useRegisterOpaqueMetaAddress } from "./useRegisterOpaqueMetaAddress";

export function RegisterButton() {
  const { register, error, txHash, isReady } = useRegisterOpaqueMetaAddress({
    rpcUrl: import.meta.env.VITE_SEPOLIA_RPC_URL,
    wasmModuleSpecifier: "https://www.opaque.cash/pkg/cryptography.js",
  });

  return (
    <div>
      <button type="button" disabled={!isReady} onClick={() => void register()}>
        Register stealth meta-address
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {txHash ? <p>Submitted: {txHash}</p> : null}
    </div>
  );
}`;

export function GuideRegister() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">
        Register meta-address
      </h1>
      <p className="text-mist">
        The SDK derives the 66-byte meta-address from the same{" "}
        <code>walletSignature</code> used at <code>create</code>. You submit{" "}
        <code>registerKeys</code> with your wallet; the SDK only supplies calldata.
      </p>
      <CodeBlock title="Calldata (viem WalletClient)" language="ts" code={CALldata_ONLY} />

      <h2 className="font-display text-xl font-semibold text-white">
        Full flow with wagmi
      </h2>
      <p className="text-mist">
        In React, use wagmi for the wallet connection, personal_sign for the setup
        message, and the wallet client&apos;s <code>sendTransaction</code> for the
        registry call. For <code>wasmModuleSpecifier</code>, use{" "}
        <a
          href="https://www.opaque.cash/pkg/cryptography.js"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          https://www.opaque.cash/pkg/cryptography.js
        </a>{" "}
        unless you self-host the wasm-pack bundle (e.g. under{" "}
        <code>public/pkg</code> like this repo&apos;s playground).
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-mist">
        <li>
          User connects; active <code>chainId</code> must be in{" "}
          <code>OpaqueClient.supportedChainIds()</code>.
        </li>
        <li>
          <code>signMessageAsync</code> with <code>OPAQUE_KEY_MESSAGE</code> (must stay
          consistent so keys match other Opaque surfaces).
        </li>
        <li>
          <code>OpaqueClient.create</code> with that signature, same{" "}
          <code>ethereumAddress</code> as the connected account, your read{" "}
          <code>rpcUrl</code>, and <code>wasmModuleSpecifier</code>.
        </li>
        <li>
          <code>buildRegisterMetaAddressTransaction()</code> then{" "}
          <code>walletClient.sendTransaction</code> to <code>tx.to</code> with{" "}
          <code>tx.data</code>.
        </li>
        <li>
          Optional: <code>publicClient.waitForTransactionReceipt</code> so the UI can
          confirm the registry write.
        </li>
      </ol>
      <CodeBlock title="Dependencies" language="bash" code={DEPS} />
      <CodeBlock title="WagmiProvider + QueryClient" language="tsx" code={PROVIDERS} />
      <CodeBlock title="Hook + button" language="tsx" code={WAGMI_FLOW} />
    </div>
  );
}
