import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatEther, getAddress, type Address, type Hex, type PublicClient } from "viem";
import { readNativeBalance } from "../lib/readNativeBalance";
import type { ProtocolStep } from "./ProtocolStepper";
import { ProtocolStepper } from "./ProtocolStepper";
import type { OpaqueWasmModule } from "../hooks/useOpaqueWasm";
import type { MasterKeys } from "../lib/stealthLifecycle";
import {
  estimateMinGasTankWeiForGhostAnnouncement,
  executeGhostOnchainAnnouncement,
  getGasTankAccount,
  type GhostAnnouncementProgress,
} from "../lib/stealthLifecycle";
import { useGhostAnnouncementStore } from "../store/ghostAnnouncementStore";
import { useGhostAddressStore } from "../store/ghostAddressStore";
import { useWatchlistStore } from "../hooks/useWatchlist";
import { ModalShell } from "./ModalShell";

type GhostAnnounceModalProps = {
  open: boolean;
  onClose: () => void;
  chainId: number;
  ghostStealthAddress: Address;
  ephemeralPrivKeyHex: Hex;
  stealthMetaAddressHex: Hex;
  publicClient: PublicClient;
  wasm: OpaqueWasmModule;
  getMasterKeys: () => MasterKeys;
  announcerContract: Address;
  gasTankInitialized: boolean;
  /** Same address shown on Dashboard / Gas Tank (must match derived tank when initialized). */
  storedGasTankAddress?: Address | null;
  onAnnounced: () => void;
};

function progressToStep(p: GhostAnnouncementProgress): ProtocolStep {
  return {
    id: p.id,
    status: p.status,
    label: p.label,
    detail: p.detail,
  };
}

export function GhostAnnounceModal({
  open,
  onClose,
  chainId,
  ghostStealthAddress,
  ephemeralPrivKeyHex,
  stealthMetaAddressHex,
  publicClient,
  wasm,
  getMasterKeys,
  announcerContract,
  gasTankInitialized,
  storedGasTankAddress,
  onAnnounced,
}: GhostAnnounceModalProps) {
  const markAnnounced = useGhostAnnouncementStore((s) => s.markAnnounced);
  const [steps, setSteps] = useState<ProtocolStep[]>([]);
  const [running, setRunning] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [tankBalanceWei, setTankBalanceWei] = useState<bigint | null>(null);
  const [minTankWei, setMinTankWei] = useState<bigint | null>(null);
  const [topUpWei, setTopUpWei] = useState<bigint | null>(null);
  const [announcerPreview, setAnnouncerPreview] = useState<string | null>(null);

  const getNativeBalance = useCallback(
    (addr: Address) => {
      const wallet =
        typeof window !== "undefined"
          ? (window as unknown as {
              ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
            }).ethereum
          : undefined;
      return readNativeBalance(addr, publicClient, wallet ?? null);
    },
    [publicClient]
  );

  const reset = useCallback(() => {
    setSteps([]);
    setRunning(false);
    setPreflightError(null);
    setTankBalanceWei(null);
    setMinTankWei(null);
    setTopUpWei(null);
    setAnnouncerPreview(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    reset();
    if (!gasTankInitialized || !stealthMetaAddressHex) return;

    let cancelled = false;
    (async () => {
      try {
        const masterKeys = getMasterKeys();
        const { address: derivedTank } = getGasTankAccount(wasm, masterKeys, stealthMetaAddressHex);
        if (
          gasTankInitialized &&
          storedGasTankAddress &&
          getAddress(storedGasTankAddress).toLowerCase() !== derivedTank.toLowerCase()
        ) {
          setPreflightError(
            "Saved Gas Tank address does not match your current keys. Open the Dashboard and re-initialize the Gas Tank, then fund the new address."
          );
          setTankBalanceWei(null);
          setMinTankWei(null);
          setTopUpWei(null);
          return;
        }
        const tankAddr =
          gasTankInitialized && storedGasTankAddress
            ? getAddress(storedGasTankAddress)
            : derivedTank;
        const bal = await getNativeBalance(tankAddr);
        if (cancelled) return;
        setTankBalanceWei(bal);

        const est = await estimateMinGasTankWeiForGhostAnnouncement(
          publicClient,
          wasm,
          getMasterKeys,
          stealthMetaAddressHex,
          ghostStealthAddress,
          ephemeralPrivKeyHex,
          announcerContract,
          getNativeBalance
        );
        if (cancelled) return;
        setMinTankWei(est.minTankWei);
        setTopUpWei(est.topUpWei);
        setAnnouncerPreview(est.announcerAddress);
        setPreflightError(null);
      } catch (e) {
        if (cancelled) return;
        setPreflightError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    gasTankInitialized,
    storedGasTankAddress,
    stealthMetaAddressHex,
    ghostStealthAddress,
    ephemeralPrivKeyHex,
    announcerContract,
    publicClient,
    wasm,
    getMasterKeys,
    getNativeBalance,
    reset,
  ]);

  const tankSufficient =
    minTankWei != null && tankBalanceWei != null && (minTankWei === 0n || tankBalanceWei >= minTankWei);

  const canStart =
    gasTankInitialized &&
    !running &&
    !preflightError &&
    minTankWei != null &&
    tankBalanceWei != null &&
    tankSufficient;

  const handleStart = useCallback(async () => {
    if (!canStart) return;
    setRunning(true);
    setSteps([]);
    const upsert = (p: GhostAnnouncementProgress) => {
      const step = progressToStep(p);
      setSteps((prev) => {
        const i = prev.findIndex((s) => s.id === p.id);
        if (i < 0) return [...prev, step];
        const next = [...prev];
        next[i] = step;
        return next;
      });
    };

    try {
      await executeGhostOnchainAnnouncement(
        publicClient,
        wasm,
        getMasterKeys,
        stealthMetaAddressHex,
        ghostStealthAddress,
        ephemeralPrivKeyHex,
        announcerContract,
        upsert,
        getNativeBalance
      );
      markAnnounced(chainId, ghostStealthAddress);
      useGhostAddressStore.getState().remove(ghostStealthAddress, chainId);
      useWatchlistStore.getState().remove(chainId, ghostStealthAddress);
      onAnnounced();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      upsert({ id: "error", label: msg, status: "error" });
    } finally {
      setRunning(false);
    }
  }, [
    canStart,
    publicClient,
    wasm,
    getMasterKeys,
    stealthMetaAddressHex,
    ghostStealthAddress,
    ephemeralPrivKeyHex,
    announcerContract,
    markAnnounced,
    chainId,
    onAnnounced,
    getNativeBalance,
  ]);

  const topUpHint = useMemo(() => {
    if (topUpWei == null) return null;
    if (topUpWei === 0n) return "The Announcer already holds enough ETH; no Gas Tank transfer is needed.";
    return `The Gas Tank will send about ${formatEther(topUpWei)} ETH to the Announcer to pay for the announcement transaction.`;
  }, [topUpWei]);

  if (!open) return null;

  return (
    <ModalShell
      open
      title="Announce manual ghost"
      description="Publish an on-chain announcement so other devices and indexers can discover this address using your keys."
      onClose={onClose}
      closeOnBackdrop={!running}
      maxWidthClassName="max-w-lg"
      contentClassName="max-h-[90vh] overflow-y-auto"
    >
        <p className="text-sm text-mist mb-3">
          Right now this ghost address is only tracked in <strong className="text-neutral-200">this browser</strong>.
          Standard scanners and other devices cannot see it because no{" "}
          <strong className="text-neutral-200">ERC-5564 announcement</strong> was published when you received funds.
        </p>
        <ul className="text-sm text-mist list-disc pl-5 space-y-1 mb-4">
          <li>
            Publishing an announcement lets indexers and Opaque on other devices discover this address using your keys,
            so you can <strong className="text-neutral-300">view and spend</strong> the funds anywhere—not only locally.
          </li>
          <li>
            The transaction will be sent from a dedicated stealth signer named <strong className="text-neutral-300">Announcer</strong>,
            funded by your <strong className="text-neutral-300">Gas Tank</strong>, so your <strong className="text-neutral-300">main connected wallet</strong> is not
            linked as the caller on-chain.
          </li>
        </ul>

        {!gasTankInitialized && (
          <div className="mb-4 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200/95 text-sm">
            <p className="mb-2">
              Initialize your <strong>Gas Tank</strong> and fund it with enough native token to cover one small transfer
              plus the announcement transaction.
            </p>
            <Link to="/gas-tank" className="text-glow underline decoration-glow/40 underline-offset-2 hover:decoration-glow font-medium" onClick={onClose}>
              Open Gas Tank setup →
            </Link>
          </div>
        )}

        {gasTankInitialized && preflightError && (
          <div className="mb-4 p-3 rounded-xl border border-error/30 bg-error/10 text-error text-sm">
            {preflightError}
          </div>
        )}

        {gasTankInitialized && !preflightError && minTankWei != null && tankBalanceWei != null && !tankSufficient && (
          <div className="mb-4 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200/95 text-sm">
            <p>
              Gas Tank balance <strong>{formatEther(tankBalanceWei)} ETH</strong> is below the estimated need of{" "}
              <strong>{formatEther(minTankWei)} ETH</strong>. Add funds to the Gas Tank and reopen this flow.
            </p>
            <Link to="/gas-tank" className="mt-2 inline-block text-glow underline decoration-glow/40 underline-offset-2 hover:decoration-glow font-medium" onClick={onClose}>
              Fund Gas Tank →
            </Link>
          </div>
        )}

        {announcerPreview && (
          <p className="text-xs text-mist/70 font-mono break-all mb-2">
            Announcer address: {announcerPreview}
          </p>
        )}
        {topUpHint && <p className="text-xs text-mist mb-4">{topUpHint}</p>}

        <div className="mb-4">
          <p className="text-xs text-mist/70 uppercase tracking-wide mb-2">Flow</p>
          <ProtocolStepper
            steps={
              steps.length > 0
                ? steps
                : [
                    { id: "1", status: "wait", label: "Verify ghost address and build announcement data" },
                    { id: "2", status: "wait", label: "Prepare Announcer stealth signer (not your main wallet)" },
                    { id: "3", status: "wait", label: "Check Gas Tank; fund Announcer if needed" },
                    { id: "4", status: "wait", label: "Publish announcement to StealthAddressAnnouncer" },
                    { id: "5", status: "wait", label: "Done — address discoverable with your keys on other devices" },
                  ]
            }
          />
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            disabled={running}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-mist border border-ink-600 bg-ink-950/30 hover:border-glow/30 hover:text-white transition-colors disabled:opacity-40"
          >
            {steps.some((s) => s.status === "done") ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={!canStart}
            onClick={() => void handleStart()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-glow text-ink-950 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-90"
          >
            {running ? "Working…" : "Start on-chain announcement"}
          </button>
        </div>
    </ModalShell>
  );
}
