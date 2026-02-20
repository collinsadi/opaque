import { useState, useRef, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { useKeys } from "../context/KeysContext";
import { computeStealthAddressAndViewTag } from "../lib/stealth";
import { getAppChain } from "../lib/chain";
import { useGhostAddressStore } from "../store/ghostAddressStore";
import { useWatchlistStore } from "../hooks/useWatchlist";

type Mode = "choose" | "payment_link" | "manual_ghost";

function bytesToHex(b: Uint8Array): string {
  return "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function ReceiveView({ onBack }: { onBack: () => void }) {
  const { isSetup, stealthMetaAddressHex } = useKeys();
  const [mode, setMode] = useState<Mode>("choose");
  const [ghostResult, setGhostResult] = useState<{
    stealthAddress: string;
    ephemeralPrivKeyHex: string;
  } | null>(null);
  const addGhost = useGhostAddressStore((s) => s.add);
  const watchlistAdd = useWatchlistStore((s) => s.add);
  const chainId = getAppChain().id;
  const qrRef = useRef<HTMLCanvasElement>(null);
  const handleDownloadQR = useCallback(() => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "stealth-address-qr.png";
    a.click();
  }, []);

  if (!isSetup || !stealthMetaAddressHex) {
    return (
      <div className="card max-w-lg mx-auto text-center text-neutral-500">
        Complete setup first.
      </div>
    );
  }

  const paymentLink = `opaque.cash/pay/${stealthMetaAddressHex}`;

  if (mode === "choose") {
    return (
      <div className="w-full max-w-lg mx-auto">
        <h2 className="text-lg font-semibold text-white mb-1">Receive</h2>
        <p className="text-sm text-neutral-500 mb-6">
          Choose how you want to receive.
        </p>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setMode("payment_link")}
            className="card w-full text-left hover:border-neutral-600 transition-colors"
          >
            <span className="text-base font-semibold text-white block mb-1">Payment Link (On-Chain Protocol)</span>
            <p className="text-sm text-neutral-500">
              Best for long-term use; recoverable on any device. Your meta-address is published via the registry.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode("manual_ghost")}
            className="card w-full text-left hover:border-neutral-600 transition-colors"
          >
            <span className="text-base font-semibold text-white block mb-1">Manual Ghost Address (No-Interaction)</span>
            <p className="text-sm text-neutral-500">
              Best for one-time fast payments; no on-chain announcement needed. Address is stored locally for monitoring.
            </p>
          </button>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 px-4 py-2 rounded-lg text-sm btn-secondary"
        >
          Back
        </button>
      </div>
    );
  }

  if (mode === "payment_link") {
    return (
      <div className="w-full max-w-lg mx-auto">
        <h2 className="text-lg font-semibold text-white mb-1">Payment Link</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Share this link or your meta-address. Senders can use the protocol to send to a one-time stealth address.
        </p>
        <div className="p-3 rounded-lg bg-neutral-900 border border-border font-mono text-xs text-neutral-300 break-all mb-2">
          {stealthMetaAddressHex}
        </div>
        <div className="p-3 rounded-lg bg-neutral-900 border border-border font-mono text-xs text-neutral-400 break-all mb-4">
          {paymentLink}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(stealthMetaAddressHex)}
            className="px-3 py-1.5 rounded-lg text-sm btn-secondary"
          >
            Copy meta-address
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(paymentLink)}
            className="px-3 py-1.5 rounded-lg text-sm btn-secondary"
          >
            Copy link
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="mt-6 px-4 py-2 rounded-lg text-sm btn-secondary"
        >
          Back
        </button>
      </div>
    );
  }

  if (mode === "manual_ghost") {
    if (!ghostResult) {
      const generate = () => {
        try {
          const { stealthAddress, ephemeralPriv } = computeStealthAddressAndViewTag(stealthMetaAddressHex);
          const ephemeralPrivKeyHex = bytesToHex(ephemeralPriv);
          if (ephemeralPrivKeyHex == null || ephemeralPrivKeyHex === "") {
            console.error("[Opaque] Ghost address key generation produced no ephemeral key.");
            return;
          }
          addGhost({ chainId, stealthAddress, ephemeralPrivKeyHex });
          watchlistAdd(chainId, stealthAddress as `0x${string}`);
          setGhostResult({ stealthAddress, ephemeralPrivKeyHex });
        } catch (err) {
          console.error("[Opaque] Ghost address key generation failed:", err);
        }
      };
      return (
        <div className="w-full max-w-lg mx-auto">
          <h2 className="text-lg font-semibold text-white mb-1">Manual Ghost Address</h2>
          <p className="text-sm text-neutral-500 mb-4">
            Generate a one-time stealth address. Derivation data is saved locally so the app can monitor and claim incoming funds.
          </p>
          <button
            type="button"
            onClick={generate}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium btn-primary"
          >
            Generate ghost address
          </button>
          <button
            type="button"
            onClick={() => setMode("choose")}
            className="mt-4 px-4 py-2 rounded-lg text-sm btn-secondary"
          >
            Back
          </button>
        </div>
      );
    }

    return (
      <div className="w-full max-w-lg mx-auto">
        <div className="mb-4 px-3 py-2 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <p className="text-sm font-medium text-amber-200">Manual ghost address</p>
          <p className="text-xs text-amber-200/80 mt-1">
            Because the sender is not using the protocol announcer, this address is only discoverable by this specific browser. Backup your vault to ensure you don&apos;t lose access.
          </p>
        </div>
        <p className="mb-4 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800/50 text-neutral-300 text-sm">
          Receiving from outside Opaque? If you share this 0x address directly, Opaque will track it locally in this browser. To see these funds on other devices, you will need to manually import the address.
        </p>
        <h2 className="text-lg font-semibold text-white mb-1">Your ghost address</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Share this address with the sender. It is stored locally; the app will detect incoming payments.
        </p>
        <div className="p-4 rounded-lg bg-white inline-block mb-4">
          <QRCodeCanvas
            ref={qrRef}
            value={ghostResult.stealthAddress}
            size={200}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
            marginSize={2}
          />
        </div>
        <div className="p-3 rounded-lg bg-neutral-900 border-2 border-amber-500/40 font-mono text-xs text-neutral-300 break-all mb-4">
          {ghostResult.stealthAddress}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(ghostResult.stealthAddress)}
            className="px-3 py-1.5 rounded-lg text-sm btn-secondary"
          >
            Copy address
          </button>
          <button
            type="button"
            onClick={handleDownloadQR}
            className="px-3 py-1.5 rounded-lg text-sm btn-secondary"
          >
            Download QR Code
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="mt-6 px-4 py-2 rounded-lg text-sm btn-secondary"
        >
          Back
        </button>
      </div>
    );
  }

  return null;
}
