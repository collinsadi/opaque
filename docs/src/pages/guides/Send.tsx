import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";

const CALldata_OVERVIEW = `// You use the same OpaqueClient.create({ ... }) setup as the register guide:
// signMessage → HKDF → keys; never put the signature on-chain.

// ── 1) Resolve the recipient ───────────────────────────────────────────────
// Looks up their 66-byte stealth meta-address on StealthMetaAddressRegistry.
const resolved = await client.resolveRecipientMetaAddress(recipientEoa);
if (!resolved.registered) {
  // Only resolved.recipientAddress is set — they have not registered yet.
  return;
}

// ── 2) Derive a one-time receive address ───────────────────────────────────
// Random ephemeral key (Noble secp256k1) + ECDH with their viewing pubkey →
// view tag + stealth address. Same math as EIP-5564-style stealth sends.
const prep = client.prepareStealthSend(resolved.metaAddressHex!);

// ── 3) Move funds (standard L1 transfer — NOT built by the SDK) ────────────
// ETH:  wallet sends value to prep.stealthAddress (data "0x").
// ERC-20:  token.transfer(prep.stealthAddress, amount) from the sender wallet.

// ── 4) Metadata for announce (ERC-20 convention in Opaque) ────────────────
// Default prep.metadata is 1 byte (view tag). For ERC-20, append the 20-byte
// token contract address (lowercase hex body) so indexers know which asset.
import { concatBytes, hexToBytes, type Hex } from "viem";

function metadataForAnnounce(
  prep: { metadata: Uint8Array },
  tokenAddress: Hex | undefined,
): Uint8Array {
  if (!tokenAddress) return prep.metadata;
  return concatBytes([prep.metadata, hexToBytes(tokenAddress)]);
}

const metadata = metadataForAnnounce(prep, tokenAddressOrUndefined);
const ann = client.buildAnnounceTransactionRequest({ ...prep, metadata });

// ── 5) Announce on StealthAddressAnnouncer ───────────────────────────────
// Emits Announcement(schemeId, stealthAddress, caller, ephemeralPubKey, metadata).
// Anyone with gas can call it; usually the sender does, right after funding.
await walletClient.sendTransaction({
  account: senderAddress,
  chain,
  to: ann.to,
  data: ann.data,
  value: 0n,
});

// If you delay announce, protect prep.ephemeralPrivateKey at rest (ghost flows).`;

const DEPS = `npm install wagmi viem @tanstack/react-query @opaquecash/opaque`;

const PROVIDERS_NOTE = `// Same WagmiProvider + QueryClient setup as the register guide.
// See that page for a full providers.tsx example.`;

const WAGMI_FLOW = `// useOpaqueStealthSend.ts
import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  usePublicClient,
  useSignMessage,
  useWalletClient,
} from "wagmi";
import {
  type Address,
  type Hex,
  encodeFunctionData,
  concatBytes,
  hexToBytes,
} from "viem";
import { OpaqueClient } from "@opaquecash/opaque";

const OPAQUE_KEY_MESSAGE =
  "Sign this message to derive your Opaque Cash stealth keys. This does not approve any transaction.";

const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

type TokenSpec =
  | { kind: "native" }
  | { kind: "erc20"; address: Address };

type UseOpaqueStealthSendArgs = {
  rpcUrl: string;
  wasmModuleSpecifier: string;
  /** Registered recipient normal EOA. */
  recipientAddress: Address;
  amountWei: bigint;
  token: TokenSpec;
  /** Wait for each tx to be mined before returning (clearer UX, slower). */
  waitForReceipt?: boolean;
};

export function useOpaqueStealthSend({
  rpcUrl,
  wasmModuleSpecifier,
  recipientAddress,
  amountWei,
  token,
  waitForReceipt = true,
}: UseOpaqueStealthSendArgs) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { chains } = useConfig();
  const chain = chains.find((c) => c.id === chainId);
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const { signMessageAsync } = useSignMessage();

  const [error, setError] = useState<string | null>(null);
  const [transferHash, setTransferHash] = useState<Hex | null>(null);
  const [announceHash, setAnnounceHash] = useState<Hex | null>(null);

  const send = useCallback(async () => {
    setError(null);
    setTransferHash(null);
    setAnnounceHash(null);
    if (!isConnected || !address || !walletClient || !chain || !publicClient) {
      setError("Connect the wallet on a configured chain.");
      return;
    }
    if (!OpaqueClient.supportedChainIds().includes(chainId)) {
      setError(\`Opaque has no bundled deployment for chain \${chainId}.\`);
      return;
    }
    if (amountWei <= 0n) {
      setError("Amount must be positive.");
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

      const resolved = await client.resolveRecipientMetaAddress(recipientAddress);
      if (!resolved.registered || !resolved.metaAddressHex) {
        setError(
          "Recipient has not registered a stealth meta-address on this chain.",
        );
        return;
      }

      const prep = client.prepareStealthSend(resolved.metaAddressHex);
      const tokenAddr =
        token.kind === "erc20" ? (token.address.toLowerCase() as Hex) : undefined;
      const metadata =
        token.kind === "erc20"
          ? concatBytes([prep.metadata, hexToBytes(tokenAddr!)])
          : prep.metadata;

      const ann = client.buildAnnounceTransactionRequest({ ...prep, metadata });

      let fundHash: Hex;
      if (token.kind === "native") {
        fundHash = await walletClient.sendTransaction({
          account: address,
          chain,
          to: prep.stealthAddress,
          value: amountWei,
          data: "0x",
        });
      } else {
        const data = encodeFunctionData({
          abi: erc20TransferAbi,
          functionName: "transfer",
          args: [prep.stealthAddress, amountWei],
        });
        fundHash = await walletClient.sendTransaction({
          account: address,
          chain,
          to: token.address,
          value: 0n,
          data,
        });
      }
      setTransferHash(fundHash);
      if (waitForReceipt) {
        await publicClient.waitForTransactionReceipt({ hash: fundHash });
      }

      const annHash = await walletClient.sendTransaction({
        account: address,
        chain,
        to: ann.to,
        data: ann.data,
        value: 0n,
      });
      setAnnounceHash(annHash);
      if (waitForReceipt) {
        await publicClient.waitForTransactionReceipt({ hash: annHash });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    address,
    amountWei,
    chain,
    chainId,
    isConnected,
    publicClient,
    recipientAddress,
    rpcUrl,
    signMessageAsync,
    token,
    waitForReceipt,
    walletClient,
    wasmModuleSpecifier,
  ]);

  return {
    send,
    error,
    transferHash,
    announceHash,
    isReady: Boolean(
      isConnected && address && chain && walletClient && publicClient,
    ),
  };
}

// SendStealthButton.tsx
import type { Address } from "viem";
import { useOpaqueStealthSend } from "./useOpaqueStealthSend";

export function SendStealthButton({ recipient }: { recipient: Address }) {
  const { send, error, transferHash, announceHash, isReady } =
    useOpaqueStealthSend({
      rpcUrl: import.meta.env.VITE_SEPOLIA_RPC_URL,
      wasmModuleSpecifier: "https://www.opaque.cash/pkg/cryptography.js",
      recipientAddress: recipient,
      amountWei: 1_000_000_000_000_000n, // 0.001 ETH — example only
      token: { kind: "native" },
    });

  return (
    <div>
      <button type="button" disabled={!isReady} onClick={() => void send()}>
        Send stealth (ETH + announce)
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {transferHash ? <p>Fund stealth: {transferHash}</p> : null}
      {announceHash ? <p>Announce: {announceHash}</p> : null}
    </div>
  );
}`;

export function GuideSend() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">
        Send & announce
      </h1>
      <p className="text-mist">
        A stealth send is <strong>two on-chain actions</strong> plus{" "}
        <strong>one registry read</strong>: resolve the recipient&apos;s published
        meta-address, transfer ETH or an ERC-20 to a <em>one-time</em>{" "}
        <code>stealthAddress</code>, then call <code>announce</code> on the shared{" "}
        <code>StealthAddressAnnouncer</code> so their wallet can discover the
        output (view tag + ephemeral public key in the log). The SDK derives the
        stealth address and encodes <code>announce</code>; it does{" "}
        <strong>not</strong> submit the asset transfer — that stays a normal{" "}
        <code>sendTransaction</code> / <code>transfer</code> from the sender&apos;s
        wallet.
      </p>
      <p className="text-mist">
        <code>prepareStealthSend</code> samples a fresh ephemeral key each call. The
        announcer contract only <em>emits an event</em>; it never custody funds.
        Ordering is usually: <strong>fund stealth</strong> then{" "}
        <strong>announce</strong> (so indexers see tokens at{" "}
        <code>stealthAddress</code> when they process the announcement).
      </p>

      <h2 className="font-display text-xl font-semibold text-white">
        Calldata and responsibilities
      </h2>
      <ul className="list-disc space-y-2 pl-5 text-sm text-mist">
        <li>
          <code>resolveRecipientMetaAddress</code> — RPC read on{" "}
          <code>StealthMetaAddressRegistry</code> (same scheme id as register:
          secp256k1 / EIP-5564 style).
        </li>
        <li>
          <code>prepareStealthSend(metaAddressHex)</code> — local crypto; returns{" "}
          <code>stealthAddress</code>, ephemeral keys, and 1-byte{" "}
          <code>metadata</code> (view tag).
        </li>
        <li>
          Your wallet sends value — native to <code>stealthAddress</code>, or ERC-20{" "}
          <code>transfer(stealthAddress, amount)</code>.
        </li>
        <li>
          For ERC-20, append the token contract address (20 bytes, lowercase) after
          that view-tag byte in <code>metadata</code> before{" "}
          <code>buildAnnounceTransactionRequest</code>; the Opaque app and indexers
          rely on this to attribute the correct asset.
        </li>
        <li>
          <code>buildAnnounceTransactionRequest</code> — ABI-encoded{" "}
          <code>announce</code>; submit with <code>sendTransaction</code> to{" "}
          <code>ann.to</code> with <code>data: ann.data</code> (same pattern as
          registry <code>registerKeys</code> in the register guide).
        </li>
      </ul>
      <CodeBlock
        title="Step-by-step (viem WalletClient)"
        language="ts"
        code={CALldata_OVERVIEW}
      />

      <h2 className="font-display text-xl font-semibold text-white">
        Full flow with wagmi
      </h2>
      <p className="text-mist">
        Mirror the register guide: the sender signs the same{" "}
        <code>OPAQUE_KEY_MESSAGE</code>, calls <code>OpaqueClient.create</code> with
        their own <code>ethereumAddress</code>, then runs resolve → prepare → fund →
        announce. Use a browser-friendly HTTPS <code>rpcUrl</code> and the hosted
        WASM bundle unless you self-host (see{" "}
        <Link
          to="/guides/register"
          className="text-glow underline decoration-glow/40 hover:decoration-glow"
        >
          Register meta-address
        </Link>
        ).
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-mist">
        <li>
          Connected account is the <strong>sender</strong>;{" "}
          <code>recipientAddress</code> is the counterparty&apos;s normal EOA
          (must already be registered).
        </li>
        <li>
          <code>signMessageAsync(OPAQUE_KEY_MESSAGE)</code> — must match other Opaque
          surfaces so derived keys stay consistent if the same person both sends
          and receives.
        </li>
        <li>
          <code>resolveRecipientMetaAddress</code> → <code>prepareStealthSend</code>.
        </li>
        <li>
          Extend <code>metadata</code> for ERC-20 as above; pass{" "}
          <code>{`{ ...prep, metadata }`}</code> into{" "}
          <code>buildAnnounceTransactionRequest</code>.
        </li>
        <li>
          First <code>sendTransaction</code>: fund <code>prep.stealthAddress</code>{" "}
          (ETH) or call the token contract (ERC-20 <code>transfer</code>).
        </li>
        <li>
          Second <code>sendTransaction</code>: <code>to: ann.to</code>,{" "}
          <code>data: ann.data</code>, <code>value: 0n</code>.
        </li>
        <li>
          Optional: <code>waitForTransactionReceipt</code> after each step for UI
          feedback (the hook below does this by default).
        </li>
      </ol>
      <CodeBlock title="Dependencies" language="bash" code={DEPS} />
      <CodeBlock title="Providers" language="tsx" code={PROVIDERS_NOTE} />
      <CodeBlock title="Hook + button (native ETH)" language="tsx" code={WAGMI_FLOW} />
      <p className="text-sm text-mist">
        For ERC-20, pass{" "}
        <code>{`token: { kind: "erc20", address: "0x…" }`}</code> and set{" "}
        <code>amountWei</code> in the token&apos;s smallest units. Protect{" "}
        <code>ephemeralPrivateKey</code> if you build delayed or relayed announce
        flows.
      </p>
    </div>
  );
}
