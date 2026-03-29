import { useState } from "react";

const NODES: {
  id: string;
  label: string;
  sub: string;
  col: number;
  row: number;
  accent?: boolean;
}[] = [
  {
    id: "app",
    label: "Your dApp",
    sub: "React / Node",
    col: 0,
    row: 1,
  },
  {
    id: "chain",
    label: "stealth-chain",
    sub: "Registry · Announcer",
    col: 1,
    row: 0,
  },
  {
    id: "wasm",
    label: "stealth-wasm",
    sub: "Scan · Keys · Witness",
    col: 1,
    row: 1,
    accent: true,
  },
  {
    id: "psr",
    label: "psr-*",
    sub: "Core · Prover · Verifier",
    col: 1,
    row: 2,
  },
  {
    id: "contracts",
    label: "Contracts",
    sub: "EVM",
    col: 2,
    row: 1,
  },
];

export function ArchDiagram() {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-900/40 p-6 md:p-8">
      <p className="mb-6 text-center text-sm text-mist">
        Hover nodes to highlight how data moves through the stack
      </p>
      <div className="relative mx-auto max-w-3xl">
        <div
          className="grid gap-4 md:gap-6"
          style={{
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gridTemplateRows: "auto auto auto",
          }}
        >
          {NODES.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`relative z-10 rounded-xl border px-3 py-4 text-left transition-all md:px-4 ${
                n.accent
                  ? "border-glow/40 bg-glow-muted/15"
                  : "border-ink-600 bg-ink-950/60"
              } ${
                hover === n.id || hover === null
                  ? "opacity-100"
                  : "opacity-45"
              } ${hover === n.id ? "ring-1 ring-glow/50" : ""}`}
              style={{ gridColumn: n.col + 1, gridRow: n.row + 1 }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
            >
              <span className="font-display text-sm font-bold text-white">
                {n.label}
              </span>
              <span className="mt-1 block text-xs text-mist">{n.sub}</span>
            </button>
          ))}
        </div>
        {/* Decorative connectors (visual only) */}
        <svg
          className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
          aria-hidden
        >
          <line
            x1="16%"
            y1="50%"
            x2="33%"
            y2="28%"
            stroke="rgba(94,234,212,0.2)"
            strokeWidth="1"
          />
          <line
            x1="16%"
            y1="50%"
            x2="33%"
            y2="50%"
            stroke="rgba(94,234,212,0.35)"
            strokeWidth="1"
          />
          <line
            x1="16%"
            y1="50%"
            x2="33%"
            y2="72%"
            stroke="rgba(244,114,182,0.2)"
            strokeWidth="1"
          />
          <line
            x1="67%"
            y1="50%"
            x2="84%"
            y2="50%"
            stroke="rgba(94,234,212,0.25)"
            strokeWidth="1"
          />
        </svg>
      </div>
    </div>
  );
}
