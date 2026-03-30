import { useState, useEffect, useCallback, useMemo } from "react";
import { createPublicClient, http, formatEther, hexToBytes, getAddress, isAddress, type Address } from "viem";
import { getChain, getRpcUrl } from "../lib/chain";
import { getConfigForChain } from "../contracts/contract-config";
import { STEALTH_ANNOUNCER_ABI } from "../lib/contracts";
import { useOpaqueWasm } from "../hooks/useOpaqueWasm";
import { useScanner } from "../hooks/useScanner";
import type { CachedAnnouncement } from "../lib/opaqueCache";
import { useKeys } from "../context/KeysContext";
import { useWallet } from "../hooks/useWallet";
import { executeStealthWithdrawal, checkStealthWithdrawalGas, withdrawFromGhostAddress, executeTokenWithdrawal, tokenSupportsPermit, checkGasTankSufficientForPermitSweep, executeTokenWithdrawalViaPermit, getGasTankAccount } from "../lib/stealthLifecycle";
import type { MasterKeys } from "../lib/stealthLifecycle";
import type { ProtocolStep } from "./ProtocolStepper";
import type { OpaqueWasmModule } from "../hooks/useOpaqueWasm";
import { useReputationStore } from "../store/reputationStore";
import { getTraitByAttestationId, StealthAttestationArraySchema, type DiscoveredTrait } from "../lib/reputation";
import { ClaimModal } from "./ClaimModal";
import { GasRequiredModal } from "./GasRequiredModal";
import { useProtocolLog } from "../context/ProtocolLogContext";
import { useTxHistoryStore } from "../store/txHistoryStore";
import { useGhostAddressStore } from "../store/ghostAddressStore";
import { useWatchlist, useWatchlistStore } from "../hooks/useWatchlist";
import { useVaultStore } from "../store/vaultStore";
import { useToast } from "../context/ToastContext";
import { secp256k1 } from "@noble/curves/secp256k1";
import { getTokensForChain, ERC20_BALANCE_ABI } from "../lib/tokens";
import type { TokenInfo } from "../lib/tokens";
import { ExplorerLink } from "./ExplorerLink";
import { useGasTankStore } from "../store/gasTankStore";
import { ghostAnnouncementEntryKey, useGhostAnnouncementStore } from "../store/ghostAnnouncementStore";
import { GhostAnnounceModal } from "./GhostAnnounceModal";
import { ModalShell } from "./ModalShell";

export type FoundTx = {
  id: string;
  address: string;
  balance: bigint;
  /** Token contract address -> raw balance (for ERC20) */
  tokenBalances: Record<string, bigint>;
  privateKey: string | undefined;
  txHash: string;
  blockNumber: number;
  timestamp?: number;
  isSpent?: boolean;
  /** How this address was found: announcement (subgraph) vs manual/ghost (state-polling). */
  source?: "announcement" | "manual";
};

const ANNOUNCEMENT_EVENT = STEALTH_ANNOUNCER_ABI.find(
  (item): item is (typeof STEALTH_ANNOUNCER_ABI)[number] & { type: "event"; name: "Announcement" } =>
    item.type === "event" && item.name === "Announcement"
);
if (!ANNOUNCEMENT_EVENT) throw new Error("Announcement event not found in STEALTH_ANNOUNCER_ABI");

function viewTagFromMetadata(metadata: string | undefined): number {
  if (!metadata || metadata.length < 2) return 0;
  return parseInt(metadata.slice(2, 4), 16);
}

function toHexBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex : `0x${hex}`;
  return hexToBytes(normalized as `0x${string}`);
}

function cachedToLogWithArgs(c: CachedAnnouncement): LogWithArgs {
  return {
    args: c.args,
    transactionHash: c.transactionHash,
    logIndex: c.logIndex,
    blockNumber: BigInt(c.blockNumber),
  };
}

type LogWithArgs = { args?: { stealthAddress?: string; ephemeralPubKey?: string; metadata?: string }; transactionHash?: string | null; logIndex?: number | null; blockNumber?: bigint | null };
type LogRow = {
  id: string;
  stealthAddress: string;
  ephemeralPubKeyHex: string | undefined;
  viewTag: number;
  blockNumber: number;
  txHash: string;
};

async function processRawLogsToFoundTxs(
  publicClient: ReturnType<typeof createPublicClient>,
  rawLogs: LogWithArgs[],
  wasm: OpaqueWasmModule | null,
  getMasterKeys: (() => MasterKeys) | null,
  chainId: number
): Promise<FoundTx[]> {
  const rows: LogRow[] = rawLogs.map((log, i) => {
    const args = log.args;
    return {
      id: `${log.transactionHash ?? ""}-${log.logIndex ?? i}`,
      stealthAddress: args?.stealthAddress ?? "",
      ephemeralPubKeyHex: typeof args?.ephemeralPubKey === "string" ? args.ephemeralPubKey : undefined,
      viewTag: viewTagFromMetadata(typeof args?.metadata === "string" ? args.metadata : undefined),
      blockNumber: Number(log.blockNumber ?? 0),
      txHash: log.transactionHash ?? "",
    };
  });

  if (!wasm || !getMasterKeys) {
    console.log("📥 [Opaque] PrivateBalance: no WASM or keys, returning no owned txs");
    return [];
  }
  let masterKeys: MasterKeys;
  try {
    masterKeys = getMasterKeys();
  } catch {
    console.log("📥 [Opaque] PrivateBalance: keys not set, returning no owned txs");
    return [];
  }

  const { viewPrivKey, spendPubKey } = masterKeys;
  const matched: LogRow[] = [];

  for (const row of rows) {
    try {
      if (!row.stealthAddress || !row.ephemeralPubKeyHex) continue;
      const ephemeralPubKey = toHexBytes(row.ephemeralPubKeyHex);
      if (ephemeralPubKey.length !== 33) continue;

      const viewTagResult = wasm.check_announcement_view_tag_wasm(
        row.viewTag,
        viewPrivKey,
        ephemeralPubKey
      );
      if (viewTagResult === "NoMatch") continue;

      const stealthAddressNormalized = getAddress(row.stealthAddress);
      let isOurs: boolean;
      try {
        isOurs = wasm.check_announcement_wasm(
          stealthAddressNormalized,
          row.viewTag,
          viewPrivKey,
          spendPubKey,
          ephemeralPubKey
        );
      } catch {
        isOurs = false;
      }
      if (!isOurs) continue;

      console.log("🎯 [Opaque] Match found for address:", row.stealthAddress);
      matched.push(row);
    } catch (err) {
      console.warn("🔑 [Opaque] Skipping malformed log:", row.id, err);
    }
  }

  const matchedAddresses = matched.map((r) => r.stealthAddress as `0x${string}`);
  const balances = await Promise.all(
    matchedAddresses.map((addr) => publicClient.getBalance({ address: addr }))
  );

  const { tokens } = getTokensForChain(chainId);
  const found: FoundTx[] = matched.map((row, i) => {
    const balance = balances[i] ?? 0n;
    let privateKey: string | undefined;
    if (wasm && masterKeys && row.ephemeralPubKeyHex) {
      try {
        const ephemeralPubKey = toHexBytes(row.ephemeralPubKeyHex);
        if (ephemeralPubKey.length === 33) {
          const stealthPrivKeyBytes = wasm.reconstruct_signing_key_wasm(
            masterKeys.spendPrivKey,
            masterKeys.viewPrivKey,
            ephemeralPubKey
          );
          privateKey =
            "0x" +
            Array.from(stealthPrivKeyBytes)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
          console.log("🔑 [Opaque] Key Found:", privateKey);
        }
      } catch (err) {
        console.warn("🔑 [Opaque] Key reconstruction failed for", row.stealthAddress, err);
      }
    }
    return {
      id: row.id,
      address: row.stealthAddress,
      balance,
      tokenBalances: {},
      privateKey,
      txHash: row.txHash,
      blockNumber: row.blockNumber,
      isSpent: false,
      source: "announcement",
    };
  });

  for (const tx of found) {
    for (const t of tokens) {
      if (!t.address || t.address === "0x0000000000000000000000000000000000000000") continue;
      try {
        const raw = await publicClient.readContract({
          address: t.address,
          abi: ERC20_BALANCE_ABI as readonly unknown[],
          functionName: "balanceOf",
          args: [tx.address as `0x${string}`],
        });
        const balance = typeof raw === "bigint" ? raw : BigInt(String(raw));
        if (balance > 0n) tx.tokenBalances[t.address] = balance;
      } catch {
        // token not deployed or RPC error
      }
    }
  }

  const totalBalance = found.reduce((sum, tx) => sum + tx.balance, 0n);
  console.log("📥 [Opaque] PrivateBalance: fetchFoundTxs done", {
    count: found.length,
    totalBalanceWei: totalBalance.toString(),
    totalBalanceEth: formatEther(totalBalance),
  });

  return found;
}

function scanForAttestations(
  wasm: OpaqueWasmModule,
  getMasterKeys: (() => MasterKeys) | null,
  announcements: CachedAnnouncement[],
  addDiscoveredTrait: (trait: DiscoveredTrait) => void
) {
  if (!getMasterKeys || announcements.length === 0) return;

  let masterKeys: MasterKeys;
  try {
    masterKeys = getMasterKeys();
  } catch {
    return;
  }

  const jsonPayload = JSON.stringify(
    announcements.map((a) => ({
      stealthAddress: a.args?.stealthAddress ?? "",
      viewTag: parseInt((a.args?.metadata ?? "0x00").slice(2, 4), 16),
      ephemeralPubKey: a.args?.ephemeralPubKey ?? "0x",
      metadata: a.args?.metadata ?? "0x",
      txHash: a.transactionHash,
      blockNumber: a.blockNumber,
    }))
  );

  try {
    const resultJson = wasm.scan_attestations_wasm(
      jsonPayload,
      masterKeys.viewPrivKey,
      masterKeys.spendPubKey
    );
    const parsed = StealthAttestationArraySchema.safeParse(JSON.parse(resultJson));
    if (!parsed.success) {
      console.warn("📥 [Opaque] Attestation scan: validation failed", parsed.error);
      return;
    }

    for (const att of parsed.data) {
      const traitDef =
        getTraitByAttestationId(att.attestation_id) ??
        {
          id: `custom-${att.attestation_id}`,
          attestationId: att.attestation_id,
          label: `Trait #${att.attestation_id}`,
          description: "Custom attestation",
          icon: "layers",
          category: "custom" as const,
        };

      addDiscoveredTrait({
        traitDef,
        attestationId: att.attestation_id,
        stealthAddress: att.stealth_address,
        txHash: att.tx_hash,
        blockNumber: att.block_number,
        discoveredAt: Date.now(),
        ephemeralPubkey: att.ephemeral_pubkey,
      });
    }

    if (parsed.data.length > 0) {
      console.log(`📥 [Opaque] Discovered ${parsed.data.length} attestation trait(s)`);
    }
  } catch (err) {
    console.warn("📥 [Opaque] Attestation scan error (non-fatal):", err);
  }
}

export type PortfolioEntry = { tx: FoundTx; balanceRaw: bigint };

export function PrivateBalanceView() {
  const [found, setFound] = useState<FoundTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [withdrawalSteps, setWithdrawalSteps] = useState<ProtocolStep[]>([]);
  const [destinationByTxId, setDestinationByTxId] = useState<Record<string, string>>({});
  const [newlyDetectedIds, setNewlyDetectedIds] = useState<string[]>([]);
  const [claimModalTx, setClaimModalTx] = useState<FoundTx | null>(null);
  const [claimAsset, setClaimAsset] = useState<TokenInfo | null>(null);
  const [gaslessEligible, setGaslessEligible] = useState<boolean>(false);
  const [gaslessEligibilityChecking, setGaslessEligibilityChecking] = useState(false);
  const [gaslessCheckComplete, setGaslessCheckComplete] = useState(false);
  const [gasRequiredStealthAddress, setGasRequiredStealthAddress] = useState<string | null>(null);
  const { initialized: gasTankInitialized, tankAddress: gasTankAddress } = useGasTankStore();
  const [ghostTxs, setGhostTxs] = useState<FoundTx[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<TokenInfo | null>(null);
  const [syncingPaused, setSyncingPaused] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { wasm, isReady: wasmReady } = useOpaqueWasm();
  const keysContext = useKeys();
  const { address: mainWalletAddress, chainId } = useWallet();
  const currentConfig = getConfigForChain(chainId);
  const { push: logPush } = useProtocolLog();
  const pushTx = useTxHistoryStore((s) => s.push);
  const chain = chainId != null ? getChain(chainId) : null;
  const ghostStoreEntries = useGhostAddressStore((s) => s.entries);
  const ghostAnnouncementKeys = useGhostAnnouncementStore((s) => s.keys);
  const ghostEntries = useMemo(
    () =>
      ghostStoreEntries.filter(
        (e) => e.chainId === (chainId ?? 0) && !!e.ephemeralPrivKeyHex
      ),
    [ghostStoreEntries, chainId]
  );
  const watchlistAdd = useWatchlistStore((s) => s.add);
  const watchlistArchive = useWatchlistStore((s) => s.archive);
  const { showToast } = useToast();
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const [manualImportAddress, setManualImportAddress] = useState("");
  const [manualImportError, setManualImportError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ghostAnnounceTarget, setGhostAnnounceTarget] = useState<{
    stealthAddress: `0x${string}`;
    ephemeralPrivKeyHex: `0x${string}`;
  } | null>(null);

  const rpcUrl = chain ? getRpcUrl(chain) : undefined;
  const publicClient = useMemo(() => {
    if (!chain || !rpcUrl) return null;
    return createPublicClient({ chain, transport: http(rpcUrl) });
  }, [chain, rpcUrl]);

  const ghostAddresses = useMemo(
    () => ghostEntries.map((g) => g.stealthAddress as `0x${string}`),
    [ghostEntries]
  );
  const watchlistAddresses = useWatchlist(chainId ?? 0);

  // Ensure every ghost entry is on the watchlist so they get state-polling (multicall). Use getState() to avoid effect re-running when store updates.
  useEffect(() => {
    if (chainId == null) return;
    const add = useWatchlistStore.getState().add;
    ghostEntries.forEach((g) => add(chainId, g.stealthAddress));
  }, [chainId, ghostEntries]);

  const scanner = useScanner({
    chainId,
    publicClient,
    announcerAddress: currentConfig?.announcer ?? null,
    enabled: Boolean(wasmReady && chainId && currentConfig),
    ghostAddresses,
    watchlistAddresses: watchlistAddresses.length > 0 ? watchlistAddresses : undefined,
  });

  const { native, tokens } =
    chainId != null ? getTokensForChain(chainId) : { native: { symbol: "ETH", name: "Ether", decimals: 18, address: null }, tokens: [] as TokenInfo[] };
  const allAssets = useMemo(() => [native, ...tokens], [native, tokens]);

  const portfolio = useMemo(() => {
    const activeTxs = [...found.filter((tx) => !tx.isSpent), ...ghostTxs];
    const result: { asset: TokenInfo; totalRaw: bigint; entries: PortfolioEntry[] }[] = [];
    for (const asset of allAssets) {
      let totalRaw = 0n;
      const entries: PortfolioEntry[] = [];
      for (const tx of activeTxs) {
        const balanceRaw = asset.address === null
          ? tx.balance
          : (tx.tokenBalances[asset.address] ?? 0n);
        if (balanceRaw > 0n) {
          totalRaw += balanceRaw;
          entries.push({ tx, balanceRaw });
        }
      }
      if (totalRaw > 0n || entries.length === 0) {
        result.push({ asset, totalRaw, entries });
      }
    }
    return result;
  }, [found, ghostTxs, allAssets]);

  // When claim modal is open for an ERC20, check if gasless (permit + gas tank) is eligible
  useEffect(() => {
    if (!claimModalTx || !claimAsset || claimAsset.address === null || !publicClient || !gasTankInitialized || !gasTankAddress) {
      setGaslessEligible(false);
      setGaslessEligibilityChecking(false);
      setGaslessCheckComplete(false);
      return;
    }
    const tokenAddress = claimAsset.address as `0x${string}`;
    const amountRaw = claimModalTx.tokenBalances[tokenAddress] ?? 0n;
    if (amountRaw === 0n) {
      setGaslessEligible(false);
      setGaslessEligibilityChecking(false);
      setGaslessCheckComplete(false);
      return;
    }
    const destInput = (destinationByTxId[claimModalTx.id] ?? "").trim();
    const destination = destInput && isAddress(destInput) ? getAddress(destInput) : ("0x0000000000000000000000000000000000000001" as Address);

    let cancelled = false;
    setGaslessEligibilityChecking(true);
    setGaslessCheckComplete(false);
    (async () => {
      try {
        const supportsPermit = await tokenSupportsPermit(publicClient, tokenAddress);
        if (cancelled || !supportsPermit) {
          if (!supportsPermit) {
            console.warn("[Opaque] Gasless sweep: token does not support EIP-2612 permit", { tokenAddress });
          }
          setGaslessEligible(false);
          setGaslessEligibilityChecking(false);
          if (!cancelled) setGaslessCheckComplete(true);
          return;
        }
        const result = await checkGasTankSufficientForPermitSweep(
          publicClient,
          gasTankAddress,
          tokenAddress,
          amountRaw,
          claimModalTx.address as Address,
          destination
        );
        if (!cancelled) {
          setGaslessEligible(result.sufficient);
          if (!result.sufficient) {
            console.warn("[Opaque] Gasless sweep: gas tank balance insufficient", {
              tokenAddress,
              balanceWei: result.balanceWei.toString(),
              estimatedGasWei: result.estimatedGasWei.toString(),
            });
          }
        }
      } catch (err) {
        console.error("[Opaque] Gasless eligibility check failed", err);
        if (!cancelled) setGaslessEligible(false);
      } finally {
        if (!cancelled) {
          setGaslessEligibilityChecking(false);
          setGaslessCheckComplete(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [claimModalTx, claimAsset, publicClient, gasTankInitialized, gasTankAddress, destinationByTxId]);

  const setDestination = useCallback((txId: string, value: string) => {
    setDestinationByTxId((prev) => ({ ...prev, [txId]: value }));
  }, []);

  const handleClaim = useCallback(
    async (tx: FoundTx, destination: string, asset: TokenInfo) => {
      const trimmed = destination.trim();
      const isGhost = tx.id.startsWith("ghost-");
      if (!isGhost && !tx.privateKey) return;
      if (isGhost && (!keysContext.isSetup || !wasm)) {
        setClaimError("Keys or WASM not ready for ghost withdrawal.");
        return;
      }
      if (!chain || chainId == null) {
        setClaimError("Unsupported network.");
        return;
      }
      const isNative = asset.address === null;
      const amountRaw = isNative ? tx.balance : (tx.tokenBalances[asset.address!] ?? 0n);
      if (amountRaw <= 0n) return;
      if (!trimmed) {
        setClaimError("Please enter a destination address.");
        return;
      }
      if (!isAddress(trimmed)) {
        setClaimError("Invalid destination address.");
        return;
      }
      const rpcUrl = getRpcUrl(chain);
      if (!rpcUrl) {
        setClaimError("No RPC URL configured.");
        return;
      }
      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });

      // Intercept if stealth address has insufficient ETH for gas (P_balance < G).
      // Skip when ERC20 + gasless (tank pays gas).
      const shouldCheckStealthGas = isNative || !gaslessEligible;
      if (shouldCheckStealthGas) {
        try {
          const gasCheck =
            isNative
              ? await checkStealthWithdrawalGas(publicClient, tx.address as `0x${string}`, {
                  type: "native",
                  destination: getAddress(trimmed),
                })
              : await checkStealthWithdrawalGas(publicClient, tx.address as `0x${string}`, {
                  type: "token",
                  tokenAddress: asset.address!,
                  destination: getAddress(trimmed),
                  tokenBalance: amountRaw,
                });
          if (!gasCheck.sufficient) {
            setClaimModalTx(null);
            setClaimAsset(null);
            setClaimError(null);
            setGasRequiredStealthAddress(tx.address);
            return;
          }
        } catch (gasCheckErr) {
          // If gas check fails (e.g. RPC), continue and let execute* throw a clearer error
          console.warn("[Opaque] Gas check failed, proceeding with withdrawal", gasCheckErr);
        }
      }

      setClaimingId(tx.id);
      setClaimError(null);
      setWithdrawalSteps([]);
      logPush("wasm", "Reconstructing stealth key and signing claim tx…");
      const amountStr = isNative
        ? formatEther(amountRaw)
        : (Number(amountRaw) / 10 ** asset.decimals).toFixed(asset.decimals);
      logPush("blockchain", `Claim: ${amountStr} ${asset.symbol} → ${trimmed.slice(0, 10)}…`);
      let step3Label = `[Step 3] Sweeping to Destination`;
      const onStatus = (s: { tag: string; label: string; detail?: string }) => {
        if (s.detail?.includes("Sending ")) {
          const m = s.detail.match(/Sending ([\d.]+)/);
          if (m) step3Label = `[Step 3] Sweeping ${m[1]} ${asset.symbol} to Destination`;
        }
        setWithdrawalSteps((prev) => {
          const steps: ProtocolStep[] =
            prev.length >= 3
              ? [...prev]
              : [
                  { id: "wd-1", status: "wait", label: "[Step 1] Reconstructing key…" },
                  { id: "wd-2", status: "wait", label: "[Step 2] Estimating Gas…" },
                  { id: "wd-3", status: "wait", label: "[Step 3] Sweeping … to Destination" },
                ];
          if (s.label.includes("Reconstructing")) steps[0] = { ...steps[0], status: "ok" };
          if (s.label.includes("Estimating") || s.label.includes("gas")) {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
          }
          if (s.tag === "SIGN" || s.tag === "SEND") {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
            steps[2] = { ...steps[2], label: step3Label };
          }
          if (s.tag === "DONE") {
            steps[0] = { ...steps[0], status: "ok" };
            steps[1] = { ...steps[1], status: "ok" };
            steps[2] = { ...steps[2], status: "done", label: step3Label };
          }
          return steps;
        });
      };
      let withdrawalHash: string | undefined;
      try {
        if (isGhost) {
          withdrawalHash = await withdrawFromGhostAddress(
            tx.address as `0x${string}`,
            chainId,
            getAddress(trimmed),
            isNative ? { type: "native" } : { type: "token", tokenAddress: asset.address! },
            publicClient,
            keysContext.getMasterKeys!,
            wasm!,
            onStatus,
            !isNative && gaslessEligible && wasm && keysContext.stealthMetaAddressHex
              ? getGasTankAccount(wasm, keysContext.getMasterKeys!(), keysContext.stealthMetaAddressHex).privateKey
              : undefined
          );
        } else {
          if (isNative) {
            withdrawalHash = await executeStealthWithdrawal(
              tx.privateKey as `0x${string}`,
              getAddress(trimmed),
              publicClient,
              onStatus
            );
          } else if (gaslessEligible && wasm && keysContext.stealthMetaAddressHex) {
            const { privateKey: gasTankPrivKey } = getGasTankAccount(wasm, keysContext.getMasterKeys!(), keysContext.stealthMetaAddressHex);
            withdrawalHash = await executeTokenWithdrawalViaPermit(
              tx.privateKey as `0x${string}`,
              asset.address!,
              getAddress(trimmed),
              gasTankPrivKey,
              publicClient,
              onStatus
            );
          } else {
            withdrawalHash = await executeTokenWithdrawal(
              tx.privateKey as `0x${string}`,
              asset.address!,
              getAddress(trimmed),
              publicClient,
              onStatus
            );
          }
            setFound((prev) =>
              prev.map((t) =>
                t.id === tx.id
                  ? { ...t, tokenBalances: { ...t.tokenBalances, [asset.address!]: 0n } }
                  : t
              )
            );
            setGhostTxs((prev) =>
              prev.map((t) =>
                t.id === tx.id
                  ? { ...t, tokenBalances: { ...t.tokenBalances, [asset.address!]: 0n } }
                  : t
              )
            );
        }
        const amountFormatted = isNative
          ? formatEther(amountRaw)
          : (Number(amountRaw) / 10 ** asset.decimals).toFixed(asset.decimals);
        pushTx({
          chainId,
          kind: isGhost ? "ghost" : "received",
          counterparty: isGhost ? "Manual Ghost" : tx.address.slice(0, 10) + "…",
          amountWei: amountRaw.toString(),
          tokenSymbol: asset.symbol,
          tokenAddress: asset.address,
          amount: amountFormatted,
          txHash: withdrawalHash,
          stealthAddress: tx.address,
        });
        if (withdrawalHash && chainId != null) {
          showToast("Withdrawal successful", { explorerTx: { chainId, txHash: withdrawalHash } });
        }
        if (isGhost) {
          setGhostTxs((prev) => prev.filter((t) => t.id !== tx.id));
        } else if (isNative) {
          setFound((prev) =>
            prev.map((t) => (t.id === tx.id ? { ...t, isSpent: true } : t))
          );
        }
        setClaimModalTx((prev) => (prev?.id === tx.id ? null : prev));
        setClaimAsset(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setClaimError(msg);
        setWithdrawalSteps((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          return prev.slice(0, -1).concat([{ ...last, status: "error" as const, detail: msg }]);
        });
      } finally {
        setClaimingId(null);
      }
    },
    [chainId, chain, pushTx, showToast, keysContext.isSetup, keysContext.getMasterKeys, keysContext.stealthMetaAddressHex, wasm, gaslessEligible]
  );

  const handleRetrySync = useCallback(async () => {
    if (chainId == null) return;
    useVaultStore.getState().setLastSyncedBlock(null);
    setSyncingPaused(false);
    setSyncError(null);
    await scanner.retrySync();
  }, [chainId, scanner]);

  const handleRefreshBalances = useCallback(async () => {
    setSyncingPaused(false);
    setSyncError(null);
    setRefreshing(true);
    try {
      await scanner.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [scanner]);

  // Derive FoundTx from scanner cache + WASM matching (in idle to avoid UI lag)
  useEffect(() => {
    if (!wasmReady || wasm === null || chainId == null || !publicClient) {
      if (chainId == null) setLoading(false);
      return;
    }
    if (scanner.announcements.length === 0) {
      if (scanner.progress.phase === "done") {
        setFound([]);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    const getMasterKeys = keysContext.isSetup ? keysContext.getMasterKeys : null;
    const addDiscoveredTrait = useReputationStore.getState().addDiscoveredTrait;
    const runMatch = () => {
      const rawLogs = scanner.announcements.map(cachedToLogWithArgs);
      processRawLogsToFoundTxs(publicClient, rawLogs, wasm, getMasterKeys, chainId)
        .then((txs) => {
          setFound((prev) => {
            const prevIds = new Set(prev.map((t) => t.id));
            const newIds = txs.filter((t) => !prevIds.has(t.id)).map((t) => t.id);
            if (newIds.length > 0) setNewlyDetectedIds((old) => [...old, ...newIds]);
            return txs;
          });
          logPush("wasm", `Matched ${txs.length} owned announcement(s) from cache`);

          scanForAttestations(wasm, getMasterKeys, scanner.announcements, addDiscoveredTrait);
        })
        .catch((err) => console.warn("📥 [Opaque] Match error", err))
        .finally(() => {
          setLoading(false);
          scanner.markSyncComplete();
        });
    };

    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(runMatch, { timeout: 500 });
    } else {
      setTimeout(runMatch, 0);
    }
  }, [scanner.announcements, scanner.progress.phase, wasmReady, wasm, chainId, publicClient, keysContext.isSetup]);

  // Ghost addresses (manual entries) + sync progress/error from scanner
  useEffect(() => {
    if (scanner.progress.phase === "error" && scanner.progress.error) {
      setSyncingPaused(true);
      setSyncError(scanner.progress.error);
    }
  }, [scanner.progress.phase, scanner.progress.error]);

  // Build ghostTxs from scanner ghostBalances (includes watchlist + ghost store + opaque-ghost-addresses for this chain).
  useEffect(() => {
    if (chainId == null || !wasm) return;
    const { ghostBalances, ghostTokenBalances } = scanner;
    const hasTokenBalances = Object.keys(ghostTokenBalances).length > 0;
    const addressesWithBalance = Object.keys(ghostBalances).filter((key) => {
      const eth = ghostBalances[key] ?? 0n;
      const tokens = ghostTokenBalances[key] ?? {};
      const hasTokens = Object.values(tokens).some((b) => b > 0n);
      return eth > 0n || hasTokens;
    });
    if (addressesWithBalance.length === 0) {
      setGhostTxs([]);
      return;
    }
    const getMasterKeys = keysContext.isSetup ? keysContext.getMasterKeys : null;
    const ghostFound: FoundTx[] = [];
    for (const key of addressesWithBalance) {
      const addr = key as `0x${string}`;
      const balance = ghostBalances[key] ?? 0n;
      const tokenBals = hasTokenBalances ? (ghostTokenBalances[key] ?? {}) : {};
      const g = ghostEntries.find((e) => e.stealthAddress.toLowerCase() === key);
      let privateKey: string | undefined;
      if (g?.ephemeralPrivKeyHex && getMasterKeys && wasm) {
        try {
          const masterKeys = getMasterKeys();
          const ephemeralPubKey = secp256k1.getPublicKey(toHexBytes(g.ephemeralPrivKeyHex), true);
          const stealthPrivKeyBytes = wasm.reconstruct_signing_key_wasm(
            masterKeys.spendPrivKey,
            masterKeys.viewPrivKey,
            ephemeralPubKey
          );
          privateKey =
            "0x" +
            Array.from(stealthPrivKeyBytes)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
        } catch {
          /* omit key if reconstruction fails */
        }
      }
      const ghostTx: FoundTx = {
        id: `ghost-${addr}`,
        address: addr,
        balance,
        tokenBalances: tokenBals,
        privateKey,
        txHash: "",
        blockNumber: 0,
        isSpent: false,
        source: "manual",
      };
      ghostFound.push(ghostTx);
    }
    setGhostTxs(ghostFound);
  }, [chainId, wasm, keysContext.isSetup, ghostEntries, scanner.ghostBalances, scanner.ghostTokenBalances]);

  useEffect(() => {
    if (newlyDetectedIds.length === 0) return;
    const t = setTimeout(() => setNewlyDetectedIds([]), 2200);
    return () => clearTimeout(t);
  }, [newlyDetectedIds]);

  return (
    <div className="w-full flex flex-col">
      <div className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Private balance</h2>
            <p className="mt-1 text-sm text-mist">
              Assets across your stealth addresses. Select an asset to drill down and withdraw.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshBalances}
              disabled={refreshing || scanner.progress.phase === "syncing" || scanner.progress.phase === "backfilling" || scanner.progress.phase === "indexer-fetch"}
              className="rounded-xl border border-ink-600 bg-ink-950/30 px-3.5 py-2 text-sm font-medium text-mist transition-colors hover:border-glow/30 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => {
                setManualImportOpen(true);
                setManualImportAddress("");
                setManualImportError(null);
              }}
              className="rounded-xl border border-ink-600 bg-ink-950/30 px-3.5 py-2 text-sm font-medium text-mist transition-colors hover:border-glow/30 hover:text-white"
            >
              Import ghost
            </button>
          </div>
        </div>

        {/* Scanning status (IndexedDB cache + adaptive RPC) */}
        <div
          className={`mt-5 p-4 rounded-2xl bg-ink-900/35 border border-ink-700/60 ${
            scanner.progress.phase === "syncing" ||
            scanner.progress.phase === "backfilling" ||
            scanner.progress.phase === "indexer-fetch"
              ? "scanner-pulse"
              : ""
          } ${syncingPaused ? "border-amber-500/40" : ""}`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm text-mist font-mono">
              {syncingPaused
                ? "Syncing Paused"
                : scanner.progress.phase === "indexer-fetch"
                  ? "Syncing with Indexer…"
                  : scanner.progress.phase === "indexer-fetched"
                    ? "Scanning Vault…"
                    : scanner.progress.phase === "backfilling"
                      ? "Optimizing Vault…"
                      : scanner.progress.phase === "syncing" || scanner.progress.phase === "loading-cache"
                        ? "Scanning"
                        : scanner.progress.phase === "done"
                          ? "Idle"
                          : scanner.progress.phase === "error"
                            ? "Error"
                            : "Idle"}
            </span>
            <span className="text-slate-200 text-sm font-mono">
              {scanner.progress.currentBlock > 0n
                ? `Block ${Number(scanner.progress.currentBlock).toLocaleString()}`
                : scanner.progress.phase === "syncing" || scanner.progress.phase === "backfilling"
                  ? "…"
                  : "—"}
            </span>
          </div>
          <div className="h-1 rounded-full bg-ink-800 overflow-hidden">
            <div
              className="h-full bg-glow-muted/60 rounded-full transition-all duration-500"
              style={{ width: `${scanner.progress.percent}%` }}
            />
          </div>
          {(scanner.progress.message || scanner.isBackfilling) && !syncingPaused && (
            <p className="text-mist/70 text-xs mt-2 font-mono">
              {scanner.progress.phase === "indexer-fetched"
                ? "Scanning Vault…"
                : scanner.isBackfilling
                  ? `Optimizing Vault… [${scanner.progress.percent}%]`
                  : scanner.progress.message}
            </p>
          )}
          {syncingPaused && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-amber-500/90 text-xs font-mono flex-1 min-w-0 truncate" title={syncError ?? undefined}>
                {syncError ?? "RPC error"}
              </p>
              <button
                type="button"
                onClick={handleRetrySync}
                className="px-2 py-1 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/40"
              >
                Retry Sync
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global claim error - full width */}
      {claimError && (
        <div className="mb-4 p-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
          {claimError}
        </div>
      )}

      {/* Content: loading / empty / portfolio (Level 1) or drill-down (Level 2) */}
      {!wasmReady ? (
        <div className="rounded-2xl border border-ink-700 bg-ink-900/25 p-6">
          <p className="text-mist text-sm">Initializing cryptography…</p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-ink-700 bg-ink-900/25 p-6">
          <p className="text-mist text-sm">Deciphering payments…</p>
        </div>
      ) : portfolio.length === 0 || portfolio.every((p) => p.totalRaw === 0n) ? (
        <div className="rounded-2xl border border-ink-700 bg-ink-900/25 p-6">
          <p className="text-mist text-sm">
            No incoming payments found yet.
          </p>
          <p className="text-mist/70 text-xs mt-1">
            Payments sent to your stealth address will appear here.
          </p>
        </div>
      ) : selectedAsset ? (
        /* Level 2: Drill-down — list of stealth addresses holding this asset */
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSelectedAsset(null)}
            className="text-sm text-mist/80 hover:text-white transition-colors"
          >
            ← Back to portfolio
          </button>
          <h3 className="font-display text-xl font-bold text-white">
            {selectedAsset.symbol} — Stealth addresses
          </h3>
          <div className="space-y-3">
            {portfolio
              .find((p) => p.asset.symbol === selectedAsset.symbol)
              ?.entries.filter((e) => e.balanceRaw > 0n)
              .map(({ tx, balanceRaw }) => {
                const amountStr =
                  selectedAsset.address === null
                    ? formatEther(balanceRaw)
                    : (Number(balanceRaw) / 10 ** selectedAsset.decimals).toFixed(selectedAsset.decimals);
                const ghostEntry = ghostEntries.find((e) => e.stealthAddress.toLowerCase() === tx.address.toLowerCase());
                const ghostEntryAny = ghostStoreEntries.find(
                  (e) => e.chainId === chainId && e.stealthAddress.toLowerCase() === tx.address.toLowerCase()
                );
                const canReconstructKey = !!(ghostEntry?.ephemeralPrivKeyHex && ghostEntry?.stealthAddress);
                const announcerConfigured =
                  !!currentConfig?.announcer &&
                  currentConfig.announcer !== "0x0000000000000000000000000000000000000000";
                const ghostAnnouncedOnChain =
                  chainId != null && !!ghostAnnouncementKeys[ghostAnnouncementEntryKey(chainId, tx.address)];
                const canAnnounceGhostOnchain =
                  tx.source === "manual" &&
                  chainId != null &&
                  announcerConfigured &&
                  !!ghostEntryAny?.ephemeralPrivKeyHex &&
                  !!keysContext.stealthMetaAddressHex &&
                  !!wasm &&
                  !!publicClient &&
                  !ghostAnnouncedOnChain;
                const isGhostWithoutKey = tx.source === "manual" && !tx.privateKey && !canReconstructKey;
                if (isGhostWithoutKey) {
                  return (
                    <div
                      key={tx.id}
                      className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            Manual/Ghost Funds
                          </span>
                          <ExplorerLink chainId={chainId} value={tx.address} type="address" className="text-mist text-xs" />
                        </div>
                        <p className="text-success font-semibold mt-0.5">
                          {amountStr} {selectedAsset.symbol}
                        </p>
                        <p className="text-amber-500/90 text-xs mt-1">
                          This address was generated incorrectly and cannot be spent.
                        </p>
                      </div>
                      {chainId != null && (
                        <button
                          type="button"
                          onClick={() => {
                            watchlistArchive(chainId, tx.address);
                            showToast("Address archived. It will no longer be polled for balances.");
                          }}
                          className="px-2 py-1 text-xs rounded-lg border border-ink-600 text-mist hover:border-glow/30 hover:text-white transition-colors"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  );
                }
                return (
                  <div
                    key={tx.id}
                    className="rounded-2xl border border-ink-700 bg-ink-900/25 p-5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {tx.source === "manual" && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            Manual/Ghost Funds
                          </span>
                        )}
                        <ExplorerLink chainId={chainId} value={tx.address} type="address" className="text-mist text-xs" />
                        {tx.txHash && (
                          <ExplorerLink chainId={chainId} value={tx.txHash} type="tx" className="text-mist/70 text-xs" startChars={8} endChars={6} />
                        )}
                      </div>
                      <p className="text-success font-semibold mt-0.5">
                        {amountStr} {selectedAsset.symbol}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {tx.source === "manual" && chainId != null && (
                        <button
                          type="button"
                          onClick={() => {
                            watchlistArchive(chainId, tx.address);
                            showToast("Address archived. It will no longer be polled for balances.");
                          }}
                          className="px-2 py-1 text-xs rounded-md border border-neutral-600 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300"
                        >
                          Archive
                        </button>
                      )}
                      {canAnnounceGhostOnchain && ghostEntryAny?.ephemeralPrivKeyHex && (
                        <button
                          type="button"
                          onClick={() =>
                            setGhostAnnounceTarget({
                              stealthAddress: tx.address as `0x${string}`,
                              ephemeralPrivKeyHex: ghostEntryAny.ephemeralPrivKeyHex as `0x${string}`,
                            })
                          }
                          className="px-2 py-1 text-xs rounded-md border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
                        >
                          Announce on-chain
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={
                        !(destinationByTxId[tx.id] ?? "").trim() ||
                        !isAddress((destinationByTxId[tx.id] ?? "").trim()) ||
                        claimingId !== null
                      }
                      onClick={() => {
                        setClaimModalTx(tx);
                        setClaimAsset(selectedAsset);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-glow text-ink-950 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-90"
                    >
                      {claimingId === tx.id ? "Withdrawing…" : "Withdraw"}
                    </button>
                    </div>
                    <div className="w-full mt-2">
                      <input
                        type="text"
                        value={destinationByTxId[tx.id] ?? ""}
                        onChange={(e) => setDestination(tx.id, e.target.value)}
                        placeholder="Destination 0x…"
                        className="input-field text-sm"
                      />
                      {mainWalletAddress && (
                        <button
                          type="button"
                          onClick={() => setDestination(tx.id, mainWalletAddress)}
                          className="mt-1.5 px-2 py-1 text-xs rounded-md btn-secondary"
                        >
                          Use connected wallet
                        </button>
                      )}
                    </div>
                  </div>
                );
              }) ?? null}
          </div>
        </div>
      ) : (
        /* Level 1: Portfolio cards — total per asset */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {portfolio
            .filter((p) => p.totalRaw > 0n)
            .map((p) => {
              const amountStr =
                p.asset.address === null
                  ? formatEther(p.totalRaw)
                  : (Number(p.totalRaw) / 10 ** p.asset.decimals).toFixed(p.asset.decimals);
              return (
                <button
                  key={p.asset.symbol}
                  type="button"
                  onClick={() => setSelectedAsset(p.asset)}
                  className="group text-left rounded-2xl border border-ink-700 bg-ink-900/30 p-6 transition-all hover:border-glow/30 hover:bg-ink-900/45 hover:shadow-[0_0_20px_rgba(94,234,212,0.06)]"
                >
                  <p className="text-mist text-sm">{p.asset.symbol}</p>
                  <p className="font-display text-2xl font-bold text-white mt-1">
                    {amountStr}
                  </p>
                  <p className="text-mist/70 text-xs mt-1">
                    {p.entries.length} address{p.entries.length !== 1 ? "es" : ""}
                  </p>
                  <p className="mt-4 text-xs font-medium text-mist/70 transition-colors group-hover:text-glow">
                    View addresses →
                  </p>
                </button>
              );
            })}
        </div>
      )}


      {claimModalTx && claimAsset && (
        (() => {
          const entry = ghostEntries.find((e) => e.stealthAddress.toLowerCase() === claimModalTx.address.toLowerCase());
          const hasKey = !!(entry?.ephemeralPrivKeyHex && entry?.stealthAddress);
          const showIncorrectlyGenerated = claimModalTx.source === "manual" && !claimModalTx.privateKey && !hasKey;
          return showIncorrectlyGenerated;
        })() ? (
          <ModalShell
            open
            title="Cannot withdraw"
            description="This manual ghost address was generated incorrectly and cannot be spent."
            onClose={() => { setClaimModalTx(null); setClaimAsset(null); setClaimError(null); }}
            maxWidthClassName="max-w-md"
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setClaimModalTx(null); setClaimAsset(null); setClaimError(null); }}
                className="rounded-xl border border-ink-600 bg-ink-950/30 px-4 py-2 text-sm font-medium text-mist hover:border-glow/30 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </ModalShell>
        ) : (
        <ClaimModal
          tx={claimModalTx}
          asset={claimAsset}
          destination={destinationByTxId[claimModalTx.id] ?? ""}
          mainWalletAddress={mainWalletAddress ?? undefined}
          chainId={chainId}
          claiming={claimingId === claimModalTx.id}
          error={claimError}
          gaslessEligible={gaslessEligible}
          gaslessEligibilityChecking={gaslessEligibilityChecking}
          gaslessCheckComplete={gaslessCheckComplete}
          onDestinationChange={(value: string) => setDestination(claimModalTx.id, value)}
          onConfirm={() =>
            handleClaim(claimModalTx, destinationByTxId[claimModalTx.id] ?? "", claimAsset)
          }
          onClose={() => {
            setClaimModalTx(null);
            setClaimAsset(null);
            setClaimError(null);
            setWithdrawalSteps([]);
          }}
          withdrawalSteps={withdrawalSteps}
        />
        )
      )}

      {gasRequiredStealthAddress && (
        <GasRequiredModal
          stealthAddress={gasRequiredStealthAddress}
          onClose={() => setGasRequiredStealthAddress(null)}
        />
      )}

      {/* Manual import: paste a ghost address to add to tracking and check for funds */}
      {ghostAnnounceTarget &&
        chainId != null &&
        keysContext.stealthMetaAddressHex &&
        wasm &&
        publicClient &&
        currentConfig?.announcer && (
          <GhostAnnounceModal
            open
            onClose={() => setGhostAnnounceTarget(null)}
            chainId={chainId}
            ghostStealthAddress={ghostAnnounceTarget.stealthAddress}
            ephemeralPrivKeyHex={ghostAnnounceTarget.ephemeralPrivKeyHex}
            stealthMetaAddressHex={keysContext.stealthMetaAddressHex}
            publicClient={publicClient}
            wasm={wasm}
            getMasterKeys={keysContext.getMasterKeys}
            announcerContract={currentConfig.announcer}
            gasTankInitialized={gasTankInitialized}
            storedGasTankAddress={gasTankAddress}
            onAnnounced={() => {
              setGhostAnnounceTarget(null);
              showToast("Announced on-chain. Removed from manual ghost tracking.");
            }}
          />
        )}

      {manualImportOpen && (
        <ModalShell
          open
          title="Import ghost address"
          description="Add a previously generated 0x stealth address to tracking. Without its ephemeral key, you can view balance but cannot withdraw."
          onClose={() => setManualImportOpen(false)}
          maxWidthClassName="max-w-md"
        >
          <input
            type="text"
            value={manualImportAddress}
            onChange={(e) => {
              setManualImportAddress(e.target.value);
              setManualImportError(null);
            }}
            placeholder="0x…"
            className="input-field w-full mb-2 font-mono text-sm"
          />
          {manualImportError && (
            <p className="text-error text-xs mb-3">{manualImportError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setManualImportOpen(false)}
              className="rounded-xl border border-ink-600 bg-ink-950/30 px-4 py-2 text-sm font-medium text-mist hover:border-glow/30 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                  const trimmed = manualImportAddress.trim();
                  if (!trimmed) {
                    setManualImportError("Enter an address.");
                    return;
                  }
                  if (!isAddress(trimmed)) {
                    setManualImportError("Invalid 0x address.");
                    return;
                  }
                  if (chainId == null) {
                    setManualImportError("Connect to a network first.");
                    return;
                  }
                  const addr = getAddress(trimmed);
                  const allEntries = useGhostAddressStore.getState().entries;
                  const storedEntry = allEntries.find(
                    (e) => e.stealthAddress.toLowerCase() === addr.toLowerCase()
                  );
                  const existsInGhost = ghostEntries.some(
                    (e) => e.stealthAddress.toLowerCase() === addr.toLowerCase()
                  );
                  const existsInWatchlist = watchlistAddresses.some(
                    (a) => a.toLowerCase() === addr.toLowerCase()
                  );
                  if (existsInGhost || existsInWatchlist) {
                    setManualImportError("Address is already in the tracking list.");
                    return;
                  }
                  if (storedEntry?.ephemeralPrivKeyHex) {
                    useGhostAddressStore.getState().add({
                      chainId,
                      stealthAddress: addr,
                      ephemeralPrivKeyHex: storedEntry.ephemeralPrivKeyHex,
                    });
                  }
                  watchlistAdd(chainId, addr);
                  setManualImportOpen(false);
                  showToast("Ghost address added. Checking for funds…");
                }}
              className="rounded-xl bg-glow px-4 py-2 text-sm font-semibold text-ink-950 hover:opacity-90"
            >
              Add & check
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
