import { Footer } from "./Footer";

type LandingPageProps = {
  onEnterVault: () => void;
};

const FEATURES = [
  {
    icon: "↕",
    accent: "glow" as const,
    title: "Stealth payments",
    body: "Senders derive a fresh one-time address from your meta-address. Every incoming transfer lands at a unique address only you control.",
  },
  {
    icon: "⌘",
    accent: "glow" as const,
    title: "On-chain registry",
    body: "Optionally link your 0x… address to a meta-address so payers can resolve you without sharing a long key.",
  },
  {
    icon: "◉",
    accent: "glow" as const,
    title: "Announcement stream",
    body: "Compact on-chain logs with view tags let your wallet discover which outputs are yours—without revealing who is scanning.",
  },
  {
    icon: "✦",
    accent: "flare" as const,
    title: "Proof-backed reputation",
    body: "Optional PSR layer: Groth16 proofs + Merkle roots + nullifiers let apps verify traits without making wallet identity public.",
  },
  {
    icon: "⬡",
    accent: "glow" as const,
    title: "Browser-native crypto",
    body: "Rust → WASM for secp256k1 scanning, snarkjs + Circom for ZK proofs—runs entirely on-device with no server round-trips.",
  },
  {
    icon: "⛓",
    accent: "glow" as const,
    title: "Open contracts",
    body: "Registry, announcer, and Groth16 verifiers deployed on Sepolia. No proprietary backend—integrators use the same shared infra.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Initialize",
    body: "Sign a message to derive stealth keys locally. Nothing leaves your device.",
  },
  {
    n: "02",
    title: "Register",
    body: "One-time on-chain step: link your Ethereum address to your meta-address.",
  },
  {
    n: "03",
    title: "Receive",
    body: "Senders fund a stealth address and publish an announcement. You scan locally to claim.",
  },
  {
    n: "04",
    title: "Prove (optional)",
    body: "Generate a ZK proof scoped to an action—verify on-chain without revealing your wallet.",
  },
] as const;

export function LandingPage({ onEnterVault }: LandingPageProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-ink-950 bg-grid-fade bg-size-grid text-white overflow-x-hidden">
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center text-center px-5 sm:px-8 pt-20 sm:pt-28 md:pt-36 pb-20 md:pb-28">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(94,234,212,0.06) 0%, transparent 70%)",
          }}
        />

        <span className="relative inline-flex items-center gap-2 rounded-full border border-glow/25 bg-glow-muted/10 px-3.5 py-1 text-xs font-medium text-glow mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-glow" aria-hidden />
          Sepolia · EIP-5564
        </span>

        <h1 className="relative font-display text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05]">
          Private payments
          <br />
          <span className="text-mist">on Ethereum</span>
          <span className="text-glow">.</span>
        </h1>

        <p className="relative mt-6 max-w-2xl text-lg text-mist leading-relaxed">
          <strong className="text-white">Opaque</strong> gives every payment a fresh
          receive address only you control, plus optional{" "}
          <strong className="text-white">ZK-backed reputation</strong> when apps need
          to verify you without seeing your wallet.
        </p>

        <div className="relative mt-8 flex flex-col sm:flex-row items-center gap-4">
          <button
            type="button"
            onClick={onEnterVault}
            className="group inline-flex items-center gap-2.5 rounded-xl bg-glow px-7 py-3.5 text-sm font-semibold text-ink-950 transition-all hover:shadow-[0_0_32px_rgba(94,234,212,0.25)] hover:scale-[1.02] active:scale-[0.98]"
          >
            Open wallet
            <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
              →
            </span>
          </button>
          <a
            href="https://docs.opaque.cash"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-xl border border-ink-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-glow/40 hover:text-glow"
          >
            Read the docs
          </a>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="mx-auto w-full max-w-6xl px-5 sm:px-8 pb-20 md:pb-28">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-glow">
            Core primitives
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
            What the protocol provides
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-ink-600 bg-ink-900/25 p-6 transition-colors hover:border-glow/30"
            >
              <span
                className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
                  f.accent === "flare"
                    ? "bg-flare/15 text-flare"
                    : "bg-glow-muted/30 text-glow"
                }`}
                aria-hidden
              >
                {f.icon}
              </span>
              <h3 className="font-display text-sm font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto w-full max-w-4xl px-5 sm:px-8 pb-20 md:pb-28">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-glow">
            Flow
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
            How it works
          </h2>
        </div>

        <div className="relative grid gap-6 sm:grid-cols-2">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-ink-700 bg-ink-900/30 p-6"
            >
              <span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-glow-muted/30 font-mono text-xs font-bold text-glow">
                {s.n}
              </span>
              <h3 className="font-display text-base font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Privacy callout ── */}
      <section className="mx-auto w-full max-w-4xl px-5 sm:px-8 pb-20 md:pb-28">
        <div className="rounded-3xl border border-ink-700 bg-ink-900/20 p-6 md:p-8">
          <h2 className="font-display text-xl font-bold text-white md:text-2xl">
            Privacy &amp; trade-offs
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-ink-600 bg-ink-950/40 p-5">
              <p className="text-sm font-semibold text-glow font-display">What's private</p>
              <ul className="mt-3 space-y-2 text-sm text-mist leading-relaxed">
                <li>Incoming transfers are harder to link to a single deposit address.</li>
                <li>PSR proofs reveal eligibility without revealing identity.</li>
                <li>Stealth keys and scanning happen entirely on-device.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-ink-600 bg-ink-950/40 p-5">
              <p className="text-sm font-semibold text-flare font-display">What's not magic</p>
              <ul className="mt-3 space-y-2 text-sm text-mist leading-relaxed">
                <li>On-chain activity still leaks timing/amount patterns.</li>
                <li>Local scanning means device-bound recovery constraints.</li>
                <li>Experimental protocol — use testnets before relying on real value.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <div className="mt-auto shrink-0 w-full pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Footer />
      </div>
    </div>
  );
}
