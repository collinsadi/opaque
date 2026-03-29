import { Link } from "react-router-dom";
import { ArrowRight, Layers, Sparkles } from "lucide-react";
import { FaGithub, FaTelegram } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

const SOCIAL = [
  {
    label: "GitHub",
    href: "https://github.com/opaquecash/opaque",
    icon: FaGithub,
  },
  {
    label: "Twitter @codellins",
    href: "https://x.com/codellins",
    icon: FaXTwitter,
  },
] as const;

/** Sepolia — addresses and Etherscan links from project README */
const SEPOLIA_CONTRACTS = [
  {
    name: "StealthMetaAddressRegistry",
    note: "Registry",
    href: "https://sepolia.etherscan.io/address/0x77425e04163d608B876c7f50E34A378624A12067",
    address: "0x77425e04163d608B876c7f50E34A378624A12067",
  },
  {
    name: "StealthAddressAnnouncer",
    note: "Announcer",
    href: "https://sepolia.etherscan.io/address/0x840f72249A8bF6F10b0eB64412E315efBD730865",
    address: "0x840f72249A8bF6F10b0eB64412E315efBD730865",
  },
  {
    name: "Groth16Verifier",
    note: null,
    href: "https://sepolia.etherscan.io/address/0x78A169b6E308Fd5BfAfc728f216CdB06EcEdde06",
    address: "0x78A169b6E308Fd5BfAfc728f216CdB06EcEdde06",
  },
  {
    name: "OpaqueReputationVerifier",
    note: null,
    href: "https://sepolia.etherscan.io/address/0x30B750Ae9851e104F8dbB4B8082b1a07a34885B0",
    address: "0x30B750Ae9851e104F8dbB4B8082b1a07a34885B0",
  },
] as const;

export function Overview() {
  return (
    <div className="space-y-10">
      <div>
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-glow/30 bg-glow-muted/10 px-3 py-1 text-xs font-medium text-glow">
          <Sparkles size={14} />
          <code className="font-mono">@opaquecash/opaque</code>
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
          Opaque developer docs
        </h1>
        <p className="mt-4 text-lg text-mist">
          <strong className="font-semibold text-white">Opaque</strong> is a
          privacy-focused protocol for stealth-address payments and reputation
          on Ethereum: one-time receive addresses tied to a meta-address
          registry, with optional proof-backed traits (PSR) when you need
          attestations without doxxing users.
        </p>
        <p className="mt-4 text-lg text-mist">
          These docs show you how to wire the{" "}
          <code className="rounded bg-ink-800/80 px-1.5 py-0.5 font-mono text-sm text-glow/90">
            @opaquecash/opaque
          </code>{" "}
          SDK into your app—configure chain and wallet context, feed indexer
          data, build transactions, scan balances, and work with reputation
          flows—so you can ship wallets, dApps, and integrations faster with a
          single mental model.
        </p>
        <p className="mt-4 text-lg text-mist">
          Configure once with chain, RPC, and a wallet signature; pass indexer-shaped
          announcements; receive calldata for <strong>register</strong> and{" "}
          <strong>announce</strong>, owned outputs, per-token balances, and PSR traits.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/sdk/quick-start"
            className="inline-flex items-center gap-2 rounded-xl bg-glow px-5 py-3 font-semibold text-ink-950 hover:opacity-90"
          >
            Quick start
            <ArrowRight size={18} />
          </Link>
          <Link
            to="/playground"
            className="inline-flex items-center gap-2 rounded-xl border border-ink-600 px-5 py-3 font-semibold text-white hover:border-glow/40"
          >
            Open playground
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/sdk/configuration"
          className="rounded-2xl border border-ink-600 bg-ink-900/30 p-6 transition-colors hover:border-glow/35"
        >
          <Layers className="mb-3 text-glow" size={24} />
          <h2 className="font-display text-lg font-bold text-white">
            Configuration-first
          </h2>
          <p className="mt-2 text-sm text-mist">
            <code>OpaqueClient.create</code> binds chainId, rpcUrl, walletSignature,
            ethereumAddress, and WASM — every method uses that context.
          </p>
        </Link>
        <Link
          to="/sdk/indexer"
          className="rounded-2xl border border-ink-600 bg-ink-900/30 p-6 transition-colors hover:border-glow/35"
        >
          <Layers className="mb-3 text-flare" size={24} />
          <h2 className="font-display text-lg font-bold text-white">
            Bring your indexer
          </h2>
          <p className="mt-2 text-sm text-mist">
            Pass Graph-style <code>Announcement</code> rows; the client normalizes
            them for Rust WASM scanning and balance aggregation.
          </p>
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-white md:text-2xl">
          Contracts (Sepolia)
        </h2>
        <p className="max-w-2xl text-mist">
          Testnet deployments on{" "}
          <span className="font-medium text-white">Sepolia</span> (chain ID{" "}
          <code className="rounded bg-ink-800/80 px-1.5 py-0.5 font-mono text-sm text-glow/90">
            11155111
          </code>
          ).
        </p>
        <div className="overflow-x-auto rounded-xl border border-ink-600">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-600 bg-ink-900/80">
                <th className="p-3 text-mist">Chain</th>
                <th className="p-3 text-mist">Contract</th>
                <th className="p-3 text-mist">Address</th>
                <th className="p-3 text-mist">Explorer</th>
              </tr>
            </thead>
            <tbody>
              {SEPOLIA_CONTRACTS.map((row) => (
                <tr
                  key={row.address}
                  className="border-b border-ink-700/80 text-slate-300 last:border-b-0"
                >
                  <td className="whitespace-nowrap p-3 font-medium text-white">
                    Sepolia
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-[13px] text-glow/90">
                      {row.name}
                    </span>
                    {row.note ? (
                      <span className="ml-2 text-xs text-mist">({row.note})</span>
                    ) : null}
                  </td>
                  <td className="p-3 font-mono text-[13px] text-mist">
                    {row.address}
                  </td>
                  <td className="p-3">
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-glow underline decoration-glow/40 underline-offset-2 hover:decoration-glow"
                    >
                      Etherscan
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-ink-600 bg-ink-900/20 p-6 md:p-8">
        <h2 className="font-display text-xl font-bold text-white md:text-2xl">
          Community &amp; support
        </h2>
        <p className="mt-3 max-w-2xl text-mist">
          Follow along, ask questions, or report issues—we&apos;re glad you&apos;re
          building on Opaque.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {SOCIAL.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-900/40 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-glow/40 hover:text-glow"
            >
              <Icon className="text-lg" aria-hidden />
              {label}
            </a>
          ))}
          <a
            href="https://t.me/collinsadi_eth"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-900/40 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-glow/40 hover:text-glow"
          >
            <FaTelegram className="text-lg" aria-hidden />
            Telegram @collinsadi_eth
          </a>
        </div>

        <p className="mt-6 text-sm text-mist">
          <span className="font-medium text-white">Support:</span>{" "}
          <a
            href="mailto:hello@collinsadi.xyz"
            className="text-glow underline decoration-glow/40 underline-offset-2 hover:decoration-glow"
          >
            hello@collinsadi.xyz
          </a>{" "}
          for product or integration questions.
        </p>

        <p className="mt-4 text-sm text-mist">
          <span className="font-medium text-white">Contribute:</span> the SDK and
          protocol improve when builders share feedback, docs fixes, and code. If
          something is unclear, open an issue or a PR—helping others integrate
          safely is one of the best ways to make Opaque better for everyone.
        </p>
      </section>
    </div>
  );
}
