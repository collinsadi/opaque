import { useMemo, useState, useCallback, useRef } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

type ProofPayload = {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
  nullifier?: string;
  attestationId?: number;
};

type VerifyState = {
  status: "idle" | "loading" | "valid" | "invalid";
  message: string;
  signalAttestationId: number | null;
  nullifier: string | null;
};

const REQUIRED_TRAIT = {
  label: "Eligible to vote",
  attestationId: 20340,
};

const GROTH16_VERIFIER = "0x78A169b6E308Fd5BfAfc728f216CdB06EcEdde06";
const USED_NULLIFIERS_KEY = "opaque-demo-used-nullifiers-v1";

const GROTH16_ABI = [
  {
    inputs: [
      { internalType: "uint256[2]", name: "_pA", type: "uint256[2]" },
      { internalType: "uint256[2][2]", name: "_pB", type: "uint256[2][2]" },
      { internalType: "uint256[2]", name: "_pC", type: "uint256[2]" },
      { internalType: "uint256[5]", name: "_pubSignals", type: "uint256[5]" },
    ],
    name: "verifyProof",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const POLICY_OPTIONS = [
  {
    id: "shielded-funding",
    title: "Shielded Public Goods Funding",
    description: "Allocate 15% of treasury grants to privacy-first civic tools.",
    icon: "◈",
    tag: "Treasury",
  },
  {
    id: "private-credentials",
    title: "Private Credential Standardization",
    description: "Adopt a shared ZK credential format for interoperable identity proofs.",
    icon: "⬡",
    tag: "Standards",
  },
  {
    id: "default-zk-compliance",
    title: "Default ZK Compliance Path",
    description: "Require a private-by-default policy option in governance integrations.",
    icon: "◎",
    tag: "Governance",
  },
];

function parseProofPayload(raw: string): ProofPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON. Paste the full proof JSON copied from Trait > Prove.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Proof payload must be an object.");
  const candidate = parsed as Partial<ProofPayload>;
  if (!candidate.proof || !Array.isArray(candidate.publicSignals)) throw new Error("Missing `proof` or `publicSignals` fields.");
  if (!Array.isArray(candidate.proof.pi_a) || !Array.isArray(candidate.proof.pi_b) || !Array.isArray(candidate.proof.pi_c))
    throw new Error("Invalid proof shape. Expected pi_a, pi_b, and pi_c arrays.");
  if (candidate.proof.pi_a.length < 2 || candidate.proof.pi_c.length < 2 || candidate.proof.pi_b.length < 2)
    throw new Error("Proof arrays are incomplete.");
  if (candidate.publicSignals.length < 5) throw new Error("Invalid publicSignals. Expected at least 5 entries.");
  return candidate as ProofPayload;
}

function readUsedNullifiers(): Set<string> {
  try {
    const raw = localStorage.getItem(USED_NULLIFIERS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((v) => String(v)));
  } catch {
    return new Set();
  }
}

function writeUsedNullifiers(nullifiers: Set<string>) {
  localStorage.setItem(USED_NULLIFIERS_KEY, JSON.stringify(Array.from(nullifiers)));
}

// ─── Step indicators ──────────────────────────────────────────────────────────
function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: done ? "#22d3ee" : active ? "#67e8f9" : "rgba(255,255,255,0.15)",
        boxShadow: active ? "0 0 8px #22d3ee" : "none",
        transition: "all 0.4s",
      }}
    />
  );
}

// ─── Hex grid SVG background ─────────────────────────────────────────────────
function HexGrid() {
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.035, pointerEvents: "none" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="hex" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
          <polygon points="28,4 52,16 52,40 28,52 4,40 4,16" fill="none" stroke="#67e8f9" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" />
    </svg>
  );
}

// ─── Animated scan line ───────────────────────────────────────────────────────
function ScanLine() {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: 2,
        background: "linear-gradient(90deg, transparent, #22d3ee60, transparent)",
        animation: "scanline 2.4s linear infinite",
        pointerEvents: "none",
      }}
    />
  );
}

type AppStep = "landing" | "verify" | "unlocked" | "voted";

export default function App() {
  const [step, setStep] = useState<AppStep>("landing");
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [proofText, setProofText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [usedNullifiers, setUsedNullifiers] = useState<Set<string>>(() => readUsedNullifiers());
  const [verifyState, setVerifyState] = useState<VerifyState>({
    status: "idle",
    message: "Paste your proof JSON and click Enter to verify privately.",
    signalAttestationId: null,
    nullifier: null,
  });
  const [voteState, setVoteState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    selectedPolicyId: string | null;
    message: string;
  }>({
    status: "idle",
    selectedPolicyId: null,
    message: "Choose a policy to cast a private eligibility-gated vote.",
  });
  const [hoveredPolicy, setHoveredPolicy] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const usedNullifierList = useMemo(() => Array.from(usedNullifiers), [usedNullifiers]);

  // ── UNTOUCHED verification logic ──────────────────────────────────────────
  const verifyProof = async () => {
    const text = proofText.trim();
    if (!text) {
      setVerifyState({ status: "invalid", message: "Proof JSON is required before you can continue.", signalAttestationId: null, nullifier: null });
      return;
    }
    setVerifyState({ status: "loading", message: "Verifying proof and trait eligibility...", signalAttestationId: null, nullifier: null });
    try {
      const payload = parseProofPayload(text);
      const piA = payload.proof.pi_a.slice(0, 2).map((v) => BigInt(v)) as [bigint, bigint];
      const piB = payload.proof.pi_b.slice(0, 2).map((pair) => [BigInt(pair[1]), BigInt(pair[0])] as [bigint, bigint]) as [[bigint, bigint], [bigint, bigint]];
      const piC = payload.proof.pi_c.slice(0, 2).map((v) => BigInt(v)) as [bigint, bigint];
      const publicSignals = payload.publicSignals.slice(0, 5).map((v) => BigInt(v)) as [bigint, bigint, bigint, bigint, bigint];
      const signalAttestationId = Number(publicSignals[3]);
      const traitMatched = signalAttestationId === REQUIRED_TRAIT.attestationId;
      const client = createPublicClient({ chain: sepolia, transport: http() });
      const isValid = await client.readContract({ address: GROTH16_VERIFIER, abi: GROTH16_ABI, functionName: "verifyProof", args: [piA, piB, piC, publicSignals] });
      if (!isValid) { setVerifyState({ status: "invalid", message: "Verification failed: proof is not valid on the verifier contract.", signalAttestationId, nullifier: null }); return; }
      if (!traitMatched) { setVerifyState({ status: "invalid", message: `Proof is valid but trait mismatch. Expected attestation ${REQUIRED_TRAIT.attestationId}, got ${signalAttestationId}.`, signalAttestationId, nullifier: null }); return; }
      const derivedNullifier = payload.nullifier ?? payload.publicSignals[0] ?? null;
      if (!derivedNullifier) { setVerifyState({ status: "invalid", message: "Proof is missing a nullifier.", signalAttestationId, nullifier: null }); return; }
      if (usedNullifiers.has(derivedNullifier)) { setVerifyState({ status: "invalid", message: "Nullifier already used. This identity already voted in this local demo.", signalAttestationId, nullifier: derivedNullifier }); return; }
      setVerifyState({ status: "valid", message: "Identity verified privately. Access granted to policy voting.", signalAttestationId, nullifier: derivedNullifier });
      setIsVerified(true);
      setShowVerifyModal(false);
      setStep("unlocked");
    } catch (error) {
      setVerifyState({ status: "invalid", message: error instanceof Error ? error.message : "Verification failed.", signalAttestationId: null, nullifier: null });
    }
  };

  const submitVote = async (policyId: string) => {
    if (!isVerified || verifyState.status !== "valid" || !verifyState.nullifier) {
      setVoteState({ status: "error", selectedPolicyId: null, message: "You must complete private verification before voting." });
      return;
    }
    if (usedNullifiers.has(verifyState.nullifier)) {
      setVoteState({ status: "error", selectedPolicyId: null, message: "Nullifier already used. Duplicate voting blocked." });
      return;
    }
    setVoteState({ status: "submitting", selectedPolicyId: policyId, message: "Submitting vote locally..." });
    await new Promise((resolve) => setTimeout(resolve, 850));
    const next = new Set(usedNullifiers);
    next.add(verifyState.nullifier);
    setUsedNullifiers(next);
    writeUsedNullifiers(next);
    setVoteState({ status: "success", selectedPolicyId: policyId, message: "Vote successful. Nullifier stored locally and marked as used." });
    setStep("voted");
  };

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setProofText(ev.target?.result as string);
      reader.readAsText(file);
    } else {
      const text = e.dataTransfer.getData("text");
      if (text) setProofText(text);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const proofIsValid = proofText.trim().length > 10;

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #05080f;
      --surface: rgba(255,255,255,0.03);
      --surface-hover: rgba(255,255,255,0.06);
      --border: rgba(255,255,255,0.08);
      --border-glow: rgba(34,211,238,0.35);
      --cyan: #22d3ee;
      --cyan-soft: #67e8f9;
      --cyan-dim: rgba(34,211,238,0.12);
      --emerald: #34d399;
      --rose: #fb7185;
      --text: #f0f4f8;
      --muted: #64748b;
      --font-display: 'Syne', sans-serif;
      --font-mono: 'DM Mono', monospace;
    }
    body { background: var(--bg); color: var(--text); font-family: var(--font-display); }
    @keyframes scanline {
      0% { top: -2px; }
      100% { top: 100%; }
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes pulseRing {
      0% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.12); opacity: 0.2; }
      100% { transform: scale(1); opacity: 0.6; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes glow-pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(34,211,238,0.2); }
      50% { box-shadow: 0 0 40px rgba(34,211,238,0.5), 0 0 80px rgba(34,211,238,0.15); }
    }
    @keyframes checkmark {
      from { stroke-dashoffset: 60; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }
    .fade-up { animation: fadeUp 0.5s ease forwards; }
    .fade-in { animation: fadeIn 0.4s ease forwards; }
  `;

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: LANDING
  // ─────────────────────────────────────────────────────────────────────────
  const LandingScreen = () => (
    <div style={{ animation: "fadeUp 0.6s ease forwards", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative" }}>
      <HexGrid />

      {/* Orb */}
      {/* <div style={{ position: "relative", marginBottom: "3rem", animation: "float 4s ease-in-out infinite" }}>
        <div style={{ width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, rgba(103,232,249,0.3), rgba(34,211,238,0.05))", border: "1px solid rgba(34,211,238,0.3)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", animation: "glow-pulse 3s ease-in-out infinite" }}>
          <div style={{ position: "absolute", inset: -12, borderRadius: "50%", border: "1px solid rgba(34,211,238,0.12)", animation: "pulseRing 3s ease-in-out infinite" }} />
          <div style={{ position: "absolute", inset: -24, borderRadius: "50%", border: "1px solid rgba(34,211,238,0.06)", animation: "pulseRing 3s ease-in-out infinite 0.5s" }} />
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <circle cx="22" cy="22" r="10" stroke="#22d3ee" strokeWidth="1.5" />
            <circle cx="22" cy="22" r="4" fill="#22d3ee" opacity="0.8" />
            <path d="M22 4 L22 12 M22 32 L22 40 M4 22 L12 22 M32 22 L40 22" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
            <path d="M8.7 8.7 L14.5 14.5 M29.5 29.5 L35.3 35.3 M35.3 8.7 L29.5 14.5 M14.5 29.5 L8.7 35.3" stroke="#22d3ee" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
          </svg>
        </div>
      </div> */}

      {/* Badge */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 100, padding: "6px 14px", marginBottom: "1.5rem" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 6px #22d3ee", display: "inline-block" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#67e8f9", letterSpacing: "0.1em", textTransform: "uppercase" }}>Opaque Identity Gateway</span>
      </div>

      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(2rem, 5vw, 3.5rem)", textAlign: "center", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: "1.25rem", maxWidth: 680 }}>
        Private Governance,<br />
        <span style={{ background: "linear-gradient(135deg, #22d3ee, #67e8f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Zero Knowledge</span>
      </h1>

      <p style={{ color: "#64748b", textAlign: "center", maxWidth: 480, lineHeight: 1.7, fontSize: "1.0625rem", marginBottom: "3rem" }}>
        Verify your eligibility privately using a Groth16 ZK proof. No personal data is revealed — only your right to vote is confirmed on-chain.
      </p>

      {/* Feature pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: "3rem" }}>
        {["Groth16 Verified", "Nullifier Protected", "Sepolia Testnet", "Client-side Only"].map((label) => (
          <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", background: "rgba(255,255,255,0.02)" }}>
            {label}
          </span>
        ))}
      </div>

      <button
        onClick={() => setStep("verify")}
        style={{ position: "relative", background: "linear-gradient(135deg, #22d3ee, #06b6d4)", color: "#020a12", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", letterSpacing: "0.01em", padding: "16px 40px", borderRadius: 14, border: "none", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 0 32px rgba(34,211,238,0.3), 0 4px 20px rgba(0,0,0,0.4)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 48px rgba(34,211,238,0.45), 0 8px 28px rgba(0,0,0,0.5)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 32px rgba(34,211,238,0.3), 0 4px 20px rgba(0,0,0,0.4)"; }}
      >
        Start Verification →
      </button>

      <p style={{ marginTop: "1.25rem", fontFamily: "var(--font-mono)", fontSize: 12, color: "#334155" }}>
        Attestation #{REQUIRED_TRAIT.attestationId} · {REQUIRED_TRAIT.label}
      </p>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: VERIFY PANEL
  // ─────────────────────────────────────────────────────────────────────────
  const VerifyPanel = () => (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", animation: "fadeIn 0.5s ease forwards" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem", borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => setStep("landing")} style={{ background: "none", border: "1px solid var(--border)", color: "#64748b", fontFamily: "var(--font-mono)", fontSize: 12, padding: "6px 14px", borderRadius: 8, cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)"; (e.target as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; (e.target as HTMLElement).style.color = "#64748b"; }}>
          ← Back
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[1, 2, 3, 4].map((n) => (<StepDot key={n} active={n === 2} done={n < 2} />))}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#334155" }}>Step 2 of 4</span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", maxWidth: 680, margin: "0 auto", width: "100%" }}>
        <div style={{ marginBottom: "0.75rem", display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: 100, padding: "5px 12px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#67e8f9", letterSpacing: "0.08em", textTransform: "uppercase" }}>Private Identity Check</span>
        </div>

        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(1.5rem, 4vw, 2.25rem)", letterSpacing: "-0.02em", marginBottom: "0.75rem", textAlign: "center" }}>
          Submit your ZK Proof
        </h2>
        <p style={{ color: "#64748b", textAlign: "center", fontSize: "0.9375rem", lineHeight: 1.6, marginBottom: "2.5rem" }}>
          Paste or drop your Groth16 proof JSON for{" "}
          <span style={{ color: "#67e8f9", fontFamily: "var(--font-mono)", fontSize: 13 }}>{REQUIRED_TRAIT.label}</span>
        </p>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            width: "100%",
            borderRadius: 18,
            border: `1.5px dashed ${isDragging ? "#22d3ee" : proofIsValid ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.1)"}`,
            background: isDragging ? "rgba(34,211,238,0.04)" : "rgba(255,255,255,0.02)",
            transition: "all 0.25s",
            overflow: "hidden",
            position: "relative",
            boxShadow: isDragging ? "0 0 30px rgba(34,211,238,0.1)" : "none",
          }}
        >
          {isDragging && <ScanLine />}
          {proofText.trim() === "" && (
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none", zIndex: 1 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" opacity="0.25">
                <rect x="4" y="8" width="20" height="16" rx="3" stroke="#67e8f9" strokeWidth="1.5" />
                <path d="M14 4 L14 16 M10 8 L14 4 L18 8" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#334155" }}>Drop proof.json or paste below</span>
            </div>
          )}
          <textarea
            value={proofText}
            onChange={(e) => setProofText(e.target.value)}
            rows={12}
            placeholder={"{\n  \"proof\": { \"pi_a\": [...], \"pi_b\": [...], \"pi_c\": [...] },\n  \"publicSignals\": [...],\n  \"nullifier\": \"...\"\n}"}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: proofIsValid ? "#a5f3fc" : "#64748b",
              lineHeight: 1.7,
              padding: "1.25rem 1.5rem",
              caretColor: "#22d3ee",
            }}
          />
        </div>

        {/* Status feedback */}
        {verifyState.status !== "idle" && (
          <div style={{
            marginTop: "1rem",
            width: "100%",
            borderRadius: 12,
            padding: "12px 16px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            background: verifyState.status === "valid" ? "rgba(52,211,153,0.07)" : verifyState.status === "invalid" ? "rgba(251,113,133,0.07)" : "rgba(34,211,238,0.06)",
            border: `1px solid ${verifyState.status === "valid" ? "rgba(52,211,153,0.25)" : verifyState.status === "invalid" ? "rgba(251,113,133,0.25)" : "rgba(34,211,238,0.2)"}`,
            animation: "fadeUp 0.3s ease forwards",
          }}>
            {verifyState.status === "loading" && (
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(34,211,238,0.2)", borderTopColor: "#22d3ee", animation: "spin 0.7s linear infinite", flexShrink: 0, marginTop: 2 }} />
            )}
            {verifyState.status === "valid" && <span style={{ color: "#34d399", fontSize: 16, lineHeight: 1 }}>✓</span>}
            {verifyState.status === "invalid" && <span style={{ color: "#fb7185", fontSize: 16, lineHeight: 1 }}>✗</span>}
            <div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: verifyState.status === "valid" ? "#6ee7b7" : verifyState.status === "invalid" ? "#fda4af" : "#67e8f9", lineHeight: 1.5 }}>
                {verifyState.message}
              </p>
              {verifyState.signalAttestationId != null && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#475569", marginTop: 4 }}>
                  Attestation in signal: {verifyState.signalAttestationId}
                </p>
              )}
              {verifyState.nullifier && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#334155", marginTop: 4, wordBreak: "break-all" }}>
                  Nullifier: {verifyState.nullifier}
                </p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={verifyProof}
          disabled={verifyState.status === "loading" || !proofIsValid}
          style={{
            marginTop: "1.5rem",
            width: "100%",
            padding: "16px",
            borderRadius: 14,
            background: proofIsValid ? "linear-gradient(135deg, #22d3ee, #06b6d4)" : "rgba(255,255,255,0.04)",
            border: proofIsValid ? "none" : "1px solid rgba(255,255,255,0.07)",
            color: proofIsValid ? "#020a12" : "#334155",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "0.9375rem",
            cursor: proofIsValid && verifyState.status !== "loading" ? "pointer" : "not-allowed",
            transition: "all 0.25s",
            boxShadow: proofIsValid ? "0 0 24px rgba(34,211,238,0.2)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {verifyState.status === "loading" ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#020a12", animation: "spin 0.7s linear infinite" }} />
              Verifying on Sepolia…
            </>
          ) : "Verify Identity →"}
        </button>

        <p style={{ marginTop: "1rem", fontFamily: "var(--font-mono)", fontSize: 11, color: "#1e293b", textAlign: "center" }}>
          Verification runs client-side via public Sepolia RPC · Contract {GROTH16_VERIFIER.slice(0, 10)}…
        </p>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: UNLOCKED / VERIFIED
  // ─────────────────────────────────────────────────────────────────────────
  const UnlockedScreen = () => (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", animation: "fadeIn 0.5s ease forwards" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 8px #34d399", display: "inline-block" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#34d399" }}>Identity Verified</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[1, 2, 3, 4].map((n) => (<StepDot key={n} active={n === 3} done={n < 3} />))}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#334155" }}>Step 3 of 4</span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem" }}>
        {/* Animated success checkmark */}
        {/* <div style={{ position: "relative", marginBottom: "2.5rem" }}>
          <div style={{ width: 100, height: 100, borderRadius: "50%", background: "radial-gradient(circle, rgba(52,211,153,0.15), transparent)", border: "1.5px solid rgba(52,211,153,0.35)", display: "flex", alignItems: "center", justifyContent: "center", animation: "glow-pulse 2.5s ease-in-out infinite" }}>
            <div style={{ position: "absolute", inset: -10, borderRadius: "50%", border: "1px solid rgba(52,211,153,0.15)", animation: "pulseRing 2.5s ease-in-out infinite" }} />
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="17" stroke="rgba(52,211,153,0.3)" strokeWidth="1.5" />
              <path d="M12 20 L17.5 26 L28 14" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 60, strokeDashoffset: 0, animation: "checkmark 0.5s ease forwards 0.2s" }} />
            </svg>
          </div>
        </div> */}

        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(1.5rem, 4vw, 2.25rem)", letterSpacing: "-0.02em", marginBottom: "0.75rem", textAlign: "center" }}>
          Identity Confirmed
        </h2>
        <p style={{ color: "#64748b", textAlign: "center", fontSize: "0.9375rem", marginBottom: "2.5rem" }}>
          Your ZK proof was verified privately. You may now cast your vote.
        </p>

        {/* Credential card */}
        <div style={{ width: "100%", maxWidth: 440, borderRadius: 18, border: "1px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.04)", padding: "1.5rem", marginBottom: "2.5rem", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: "radial-gradient(circle, rgba(52,211,153,0.1), transparent)" }} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#34d399", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem", opacity: 0.7 }}>
            Verified Credential
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: "1.0625rem", color: "#e2e8f0" }}>{REQUIRED_TRAIT.label}</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#475569", marginTop: 4 }}>
                Attestation #{REQUIRED_TRAIT.attestationId}
              </p>
            </div>
            <span style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 8, padding: "4px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "#34d399" }}>
              VALID
            </span>
          </div>
          {verifyState.nullifier && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#1e293b", marginTop: "1rem", wordBreak: "break-all" }}>
              Nullifier: {verifyState.nullifier}
            </p>
          )}
        </div>

        {/* <button
          onClick={() => setStep("unlocked")}
          style={{ background: "linear-gradient(135deg, #22d3ee, #06b6d4)", color: "#020a12", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", padding: "15px 40px", borderRadius: 14, border: "none", cursor: "pointer", boxShadow: "0 0 28px rgba(34,211,238,0.25)", transition: "all 0.2s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
        >
          Proceed to Vote →
        </button> */}
      </div>

      {/* Voting section (Step 4 embedded after unlock) */}
      <VotingSection />
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: VOTING SECTION (shared in unlocked + voted screens)
  // ─────────────────────────────────────────────────────────────────────────
  const VotingSection = () => (
    <div id="vote" style={{ borderTop: "1px solid var(--border)", padding: "3rem 1.5rem 4rem", maxWidth: 900, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem" }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "0.75rem" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 6px #22d3ee", display: "inline-block", animation: "pulseRing 2s ease-in-out infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#22d3ee", letterSpacing: "0.08em", textTransform: "uppercase" }}>Active Proposal</span>
          </div>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.375rem", letterSpacing: "-0.02em" }}>
            Privacy Policy Vote
          </h3>
          <p style={{ color: "#475569", fontSize: "0.875rem", marginTop: 4 }}>
            Cast one anonymous vote. Nullifier prevents duplicates locally.
          </p>
        </div>
        <span style={{ background: voteState.status === "success" ? "rgba(52,211,153,0.1)" : "rgba(34,211,238,0.08)", border: `1px solid ${voteState.status === "success" ? "rgba(52,211,153,0.25)" : "rgba(34,211,238,0.2)"}`, borderRadius: 10, padding: "6px 14px", fontFamily: "var(--font-mono)", fontSize: 12, color: voteState.status === "success" ? "#34d399" : "#22d3ee" }}>
          {voteState.status === "success" ? "Vote Cast" : "Voting Open"}
        </span>
      </div>

      {/* Policy cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {POLICY_OPTIONS.map((policy) => {
          const isSelected = voteState.selectedPolicyId === policy.id;
          const isHovered = hoveredPolicy === policy.id;
          const isDisabled = !isVerified || voteState.status === "submitting" || voteState.status === "success";
          return (
            <button
              key={policy.id}
              disabled={isDisabled}
              onClick={() => submitVote(policy.id)}
              onMouseEnter={() => !isDisabled && setHoveredPolicy(policy.id)}
              onMouseLeave={() => setHoveredPolicy(null)}
              style={{
                background: isSelected ? "rgba(34,211,238,0.07)" : isHovered ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.02)",
                border: `1.5px solid ${isSelected ? "rgba(34,211,238,0.45)" : isHovered ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 16,
                padding: "1.25rem 1.25rem 1.5rem",
                textAlign: "left",
                cursor: isDisabled ? "not-allowed" : "pointer",
                transition: "all 0.22s",
                opacity: isDisabled && !isSelected ? 0.5 : 1,
                boxShadow: isSelected ? "0 0 24px rgba(34,211,238,0.12)" : "none",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {isSelected && (
                <div style={{ position: "absolute", top: 12, right: 12, width: 20, height: 20, borderRadius: "50%", background: "rgba(34,211,238,0.15)", border: "1.5px solid rgba(34,211,238,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#22d3ee", fontSize: 10, lineHeight: 1 }}>✓</span>
                </div>
              )}
              <div style={{ fontSize: 22, marginBottom: "0.875rem", color: isSelected ? "#22d3ee" : "#475569", transition: "color 0.2s" }}>
                {policy.icon}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isSelected ? "#22d3ee" : "#334155", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                {policy.tag}
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", color: isSelected ? "#e2e8f0" : "#94a3b8", marginBottom: "0.625rem", lineHeight: 1.3, transition: "color 0.2s" }}>
                {policy.title}
              </p>
              <p style={{ fontSize: "0.8125rem", color: "#334155", lineHeight: 1.6 }}>
                {policy.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Vote status banner */}
      <div style={{
        borderRadius: 12,
        padding: "14px 18px",
        background: voteState.status === "success" ? "rgba(52,211,153,0.06)" : voteState.status === "error" ? "rgba(251,113,133,0.06)" : voteState.status === "submitting" ? "rgba(34,211,238,0.06)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${voteState.status === "success" ? "rgba(52,211,153,0.2)" : voteState.status === "error" ? "rgba(251,113,133,0.2)" : voteState.status === "submitting" ? "rgba(34,211,238,0.2)" : "rgba(255,255,255,0.06)"}`,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        {voteState.status === "submitting" && (
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(34,211,238,0.2)", borderTopColor: "#22d3ee", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
        )}
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: voteState.status === "success" ? "#6ee7b7" : voteState.status === "error" ? "#fda4af" : voteState.status === "submitting" ? "#67e8f9" : "#334155" }}>
          {voteState.status === "submitting" ? "Processing vote via nullifier check…" : voteState.message}
        </p>
        {voteState.status === "success" && (
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "#334155", whiteSpace: "nowrap" }}>
            {usedNullifierList.length} nullifier{usedNullifierList.length !== 1 ? "s" : ""} used
          </span>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4b: SUCCESS SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  const VotedScreen = () => (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", animation: "fadeIn 0.5s ease forwards" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 8px #34d399", display: "inline-block" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#34d399" }}>Vote Submitted</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[1, 2, 3, 4].map((n) => (<StepDot key={n} active={n === 4} done={n < 4} />))}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#334155" }}>Complete</span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", position: "relative" }}>
        <HexGrid />

        {/* Confetti-like glow */}
        <div style={{ position: "absolute", top: "20%", left: "20%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.08), transparent)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "15%", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(52,211,153,0.06), transparent)", pointerEvents: "none" }} />

        <div style={{ position: "relative", marginBottom: "2rem" }}>
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.12), transparent)", border: "1.5px solid rgba(34,211,238,0.3)", display: "flex", alignItems: "center", justifyContent: "center", animation: "glow-pulse 3s ease-in-out infinite" }}>
            <div style={{ position: "absolute", inset: -10, borderRadius: "50%", border: "1px solid rgba(34,211,238,0.12)", animation: "pulseRing 3s ease-in-out infinite" }} />
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <path d="M8 20 L15 27 L30 11" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.5rem, 4vw, 2.5rem)", letterSpacing: "-0.03em", marginBottom: "0.75rem", textAlign: "center" }}>
          Vote Confirmed
        </h2>
        <p style={{ color: "#64748b", textAlign: "center", maxWidth: 420, lineHeight: 1.6, fontSize: "0.9375rem", marginBottom: "2.5rem" }}>
          Your anonymous vote has been recorded. The nullifier has been marked as used, preventing any replay within this session.
        </p>

        {/* Summary card */}
        {voteState.selectedPolicyId && (() => {
          const p = POLICY_OPTIONS.find((x) => x.id === voteState.selectedPolicyId);
          return p ? (
            <div style={{ width: "100%", maxWidth: 400, borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", padding: "1.25rem", marginBottom: "2rem" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#334155", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Voted For</p>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 20, color: "#22d3ee" }}>{p.icon}</span>
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#e2e8f0" }}>{p.title}</p>
                  <p style={{ fontSize: "0.8125rem", color: "#475569", marginTop: 4 }}>{p.description}</p>
                </div>
              </div>
            </div>
          ) : null;
        })()}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => { setStep("landing"); setIsVerified(false); setProofText(""); setVerifyState({ status: "idle", message: "Paste your proof JSON and click Enter to verify privately.", signalAttestationId: null, nullifier: null }); setVoteState({ status: "idle", selectedPolicyId: null, message: "Choose a policy to cast a private eligibility-gated vote." }); }}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "#64748b", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.875rem", padding: "12px 24px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.2)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "#64748b"; }}
          >
            ← Return Home
          </button>
        </div>

        <div style={{ marginTop: "2.5rem", fontFamily: "var(--font-mono)", fontSize: 11, color: "#1e293b", textAlign: "center" }}>
          {usedNullifierList.length} nullifier{usedNullifierList.length !== 1 ? "s" : ""} stored locally · Sepolia verifier {GROTH16_VERIFIER.slice(0, 10)}…
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{css}</style>
      <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", position: "relative", overflow: "hidden" }}>
        {/* Ambient orbs */}
        <div style={{ position: "fixed", top: "-10%", left: "-5%", width: "50vw", height: "50vw", maxWidth: 600, maxHeight: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.04), transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "fixed", bottom: "-10%", right: "-5%", width: "40vw", height: "40vw", maxWidth: 500, maxHeight: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.04), transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          {step === "landing" && <LandingScreen />}
          {step === "verify" && <VerifyPanel />}
          {(step === "unlocked") && <UnlockedScreen />}
          {step === "voted" && <VotedScreen />}
        </div>
      </main>
    </>
  );
}