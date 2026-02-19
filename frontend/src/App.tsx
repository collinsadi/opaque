import { useState, useEffect } from "react";
import { KeysProvider, useKeys } from "./context/KeysContext";
import { hasCompletedOnboardingTour, runOnboardingTour } from "./lib/onboardingTour";
import { ProtocolLogProvider } from "./context/ProtocolLogContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { LandingPage } from "./components/LandingPage";
import { LandingView } from "./components/LandingView";
import { DashboardView } from "./components/DashboardView";
import { SendView } from "./components/SendView";
import { PrivateBalanceView } from "./components/PrivateBalanceView";
import { TransactionHistoryView } from "./components/TransactionHistoryView";
import { ReceiveView } from "./components/ReceiveView";
import { SubENSView } from "./components/SubENSView";
import { ProfileView } from "./components/ProfileView";
import { ProtocolLogPanel } from "./components/ProtocolLogPanel";
import { Layout, type Tab } from "./components/Layout";
import { useWallet } from "./hooks/useWallet";
import { useVaultStore } from "./store/vaultStore";

function AppContent() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [onboardingPhase, setOnboardingPhase] = useState<"landing" | "entry">("landing");
  useKeys();
  const { isConnected, address, isConnecting, connect, disconnect } = useWallet();
  const { isSetup, clearKeys } = useKeys();
  const clearVault = useVaultStore((s) => s.clear);

  const handleTab = (t: Tab) => {
    if (t === "subens") return;
    setTab(t);
  };

  useEffect(() => {
    if (tab !== "dashboard" || !isConnected || !isSetup || hasCompletedOnboardingTour()) return;
    const timer = setTimeout(() => runOnboardingTour(), 600);
    return () => clearTimeout(timer);
  }, [tab, isConnected, isSetup]);

  const handleConnect = async () => {
    await connect();
  };

  const handleDisconnect = () => {
    clearKeys();
    clearVault();
    disconnect();
    setTab("dashboard");
  };

  const renderView = () => {
    if (tab === "dashboard") return <DashboardView onNavigate={setTab} />;
    if (tab === "send") return <SendView />;
    if (tab === "receive") return <ReceiveView onBack={() => setTab("dashboard")} />;
    if (tab === "balance") return <PrivateBalanceView />;
    if (tab === "history") return <TransactionHistoryView />;
    if (tab === "subens") return <SubENSView onBack={() => setTab("dashboard")} />;
    if (tab === "profile") return <ProfileView onNavigate={setTab} onDisconnect={handleDisconnect} />;
    return null;
  };

  if (!isSetup) {
    return (
      <div className="h-screen flex flex-col bg-black">
        {onboardingPhase === "landing" ? (
          <LandingPage onEnterVault={() => setOnboardingPhase("entry")} />
        ) : (
          <LandingView />
        )}
      </div>
    );
  }

  return (
    <Layout
      tab={tab}
      onTabChange={handleTab}
      isConnected={isConnected}
      address={address ?? undefined}
      isConnecting={isConnecting}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
      protocolLog={<ProtocolLogPanel />}
    >
      {renderView()}
    </Layout>
  );
}

function ToastLayer() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-24 md:bottom-56 left-4 right-4 md:left-auto md:right-6 z-50 flex flex-col gap-2 max-w-sm md:ml-auto">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm shadow-lg flex items-center justify-between gap-2"
        >
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="text-neutral-400 hover:text-white shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <KeysProvider>
      <ProtocolLogProvider>
        <ToastProvider>
          <AppContent />
          <ToastLayer />
        </ToastProvider>
      </ProtocolLogProvider>
    </KeysProvider>
  );
}
