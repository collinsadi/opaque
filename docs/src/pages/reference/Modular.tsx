import { SectionTitle, Prose } from "@/components/Section";

const PKGS = [
  ["@opaquecash/opaque", "Unified client (this docs focus)"],
  ["@opaquecash/stealth-core", "Types, meta-address parsing, announcement helpers"],
  ["@opaquecash/stealth-wasm", "WASM loader + scan / keys"],
  ["@opaquecash/stealth-chain", "Registry + announcer viem helpers"],
  ["@opaquecash/stealth-balance", "TrackedToken types + aggregate helper"],
  ["@opaquecash/psr-core", "Scopes, nullifiers, trait types"],
  ["@opaquecash/psr-prover", "Witness + snarkjs"],
  ["@opaquecash/psr-chain", "Verifier contract reads / submit"],
];

export function ModularReference() {
  return (
    <div className="space-y-8">
      <SectionTitle>Modular packages</SectionTitle>
      <Prose>
        <p>
          Advanced integrations can import lower-level packages directly. Most apps
          should start with <code>@opaquecash/opaque</code> only.
        </p>
      </Prose>
      <ul className="space-y-2 text-sm text-slate-300">
        {PKGS.map(([name, role]) => (
          <li key={name}>
            <code className="text-glow">{name}</code> — {role}
          </li>
        ))}
      </ul>
    </div>
  );
}
