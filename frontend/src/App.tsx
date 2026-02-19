import { useState } from "react";
import { KeysProvider, useKeys } from "./context/KeysContext";
import { ProtocolLogProvider } from "./context/ProtocolLogContext";
import { SetupView } from "./components/SetupView";
import { RegistrationView } from "./components/RegistrationView";
import { SendView } from "./components/SendView";
import { PrivateBalanceView } from "./components/PrivateBalanceView";
import { ProtocolLogPanel } from "./components/ProtocolLogPanel";
import { useWallet } from "./hooks/useWallet";

type Tab = "setup" | "register" | "send" | "balance";

function AppContent() {
  const [tab, setTab] = useState<Tab>("setup");
  useKeys();
  const { isConnected, address, isConnecting, connect } = useWallet();

  const handleTab = (t: Tab) => {
    console.log("📑 [Opaque] Tab switch", { tab: t });
    setTab(t);
  };

  const handleConnect = async () => {
    console.log("🔌 [Opaque] Connecting wallet…");
    await connect();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/10 glass sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Opaque Cash
          </h1>
          <div className="flex items-center gap-3">
            <nav className="flex gap-1">
              {(["setup", "register", "send", "balance"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTab(t)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tab === t
                      ? "bg-cyan/20 text-cyan border border-cyan/40"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  {t === "setup"
                    ? "Setup"
                    : t === "register"
                      ? "Register"
                      : t === "send"
                        ? "Send"
                        : "Private balance"}
                </button>
              ))}
            </nav>
            {!isConnected && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 hover:border-cyan/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isConnecting ? "Connecting…" : "Connect MetaMask"}
              </button>
            )}
            {isConnected && address && (
              <div className="px-3 py-2 rounded-lg text-sm font-mono text-slate-300 bg-slate/50 border border-frost-border">
                {address.slice(0, 6)}…{address.slice(-4)}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        {tab === "setup" && <SetupView />}
        {tab === "register" && <RegistrationView />}
        {tab === "send" && <SendView />}
        {tab === "balance" && <PrivateBalanceView />}
      </main>

      <ProtocolLogPanel />

      <footer className="py-4 text-center text-slate-500 text-xs border-t border-white/10 font-mono">
        Stealth address wallet — EIP-5564
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <KeysProvider>
      <ProtocolLogProvider>
        <AppContent />
      </ProtocolLogProvider>
    </KeysProvider>
  );
}
