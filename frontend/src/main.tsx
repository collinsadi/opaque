import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { KeysProvider } from "./context/KeysContext";
import { NotFoundPage } from "./components/NotFoundPage.tsx";
import { PrivacyPage } from "./components/PrivacyPage.tsx";
import { TermsPage } from "./components/TermsPage.tsx";
import { DisclaimerPage } from "./components/DisclaimerPage.tsx";
import { PayPage } from "./components/PayPage.tsx";
import { PaySuccessPage } from "./components/PaySuccessPage.tsx";
import { FaucetPage } from "./components/FaucetPage.tsx";

console.log("🚀 [Opaque] App bootstrapping…");

const expectedChainId = import.meta.env.VITE_CHAIN_ID
  ? Number(import.meta.env.VITE_CHAIN_ID)
  : import.meta.env.VITE_NETWORK === 'localhost'
    ? 31337
    : null

if (expectedChainId != null) {
  const checkNetwork = () => {
    const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<string> } }).ethereum
    if (!ethereum) return
    ethereum
      .request({ method: 'eth_chainId' })
      .then((hexChainId: string) => {
        const connectedChainId = Number.parseInt(hexChainId, 16)
        if (connectedChainId !== expectedChainId) {
          console.warn(
            "⚠️ [Opaque] Wrong network:",
            { expected: expectedChainId, got: connectedChainId, env: import.meta.env.VITE_NETWORK ?? "config" }
          )
        } else {
          console.log("🔗 [Opaque] Chain OK", { chainId: connectedChainId });
        }
      })
      .catch((e) => console.warn("⚠️ [Opaque] Chain check failed", e))
  }
  checkNetwork()
  window.addEventListener('chainChanged', () => {
    console.log("🔗 [Opaque] chainChanged event");
    checkNetwork();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="/pay/success" element={<PaySuccessPage />} />
        <Route path="/pay/:identifier" element={<KeysProvider><PayPage /></KeysProvider>} />
        <Route path="/faucet" element={<FaucetPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
