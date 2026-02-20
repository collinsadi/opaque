/**
 * Opaque Cash Phase 3: Stealth fund discovery and spending lifecycle.
 * - StealthScanner: historical sync + real-time Announcement listener + WASM filter
 * - VaultStore: persistent owned stealth addresses (see store/vaultStore)
 * - getStealthWallet / withdrawStealthFunds: key reconstruction and withdrawal
 *
 * Security: Master private keys must be passed in at runtime; never stored in localStorage.
 */

import {
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type Chain,
  getAddress,
  formatEther,
  createWalletClient,
  http,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useVaultStore } from "../store/vaultStore";
import { getConfigForChain } from "../contracts/contract-config";
import { getRpcUrl } from "./chain";
import { STEALTH_ANNOUNCER_ABI, SCHEME_ID_SECP256K1 } from "./contracts";

// -----------------------------------------------------------------------------
// WASM module type (extends useOpaqueWasm interface)
// -----------------------------------------------------------------------------

export interface StealthLifecycleWasm {
  check_announcement_view_tag_wasm: (
    view_tag: number,
    view_privkey_bytes: Uint8Array,
    ephemeral_pubkey_bytes: Uint8Array
  ) => string;
  check_announcement_wasm: (
    announcement_stealth_address: string,
    view_tag: number,
    view_privkey_bytes: Uint8Array,
    spend_pubkey_bytes: Uint8Array,
    ephemeral_pubkey_bytes: Uint8Array
  ) => boolean;
  reconstruct_signing_key_wasm: (
    master_spend_priv_bytes: Uint8Array,
    master_view_priv_bytes: Uint8Array,
    ephemeral_pubkey_bytes: Uint8Array
  ) => Uint8Array;
}

// -----------------------------------------------------------------------------
// Scanning progress observable
// -----------------------------------------------------------------------------

export type ScanStatus = "idle" | "syncing" | "watching" | "error";

export type ScanningProgress = {
  status: ScanStatus;
  /** Current block when syncing (optional) */
  fromBlock: bigint | null;
  toBlock: bigint | null;
  lastProcessedBlock: bigint | null;
  /** Total blocks to sync (for progress %) */
  totalBlocks: bigint | null;
  error: string | null;
};

type ProgressListener = (progress: ScanningProgress) => void;

// -----------------------------------------------------------------------------
// Keys supplier: in-memory only, never persisted
// -----------------------------------------------------------------------------

export type MasterKeys = {
  viewPrivKey: Uint8Array; // 32 bytes
  spendPrivKey: Uint8Array; // 32 bytes
  spendPubKey: Uint8Array; // 33 bytes compressed
};

// -----------------------------------------------------------------------------
// StealthScanner
// -----------------------------------------------------------------------------

const CHUNK_SIZE = 1000;
const RPC_DELAY_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class StealthScanner {
  private readonly publicClient: PublicClient;
  private readonly announcerAddress: Address;
  private readonly chain: Chain;
  private readonly wasm: StealthLifecycleWasm;
  private readonly getKeys: () => MasterKeys;
  private readonly deployedBlock: bigint;
  private unsubscribeWatch: (() => void) | null = null;
  private progress: ScanningProgress = {
    status: "idle",
    fromBlock: null,
    toBlock: null,
    lastProcessedBlock: null,
    totalBlocks: null,
    error: null,
  };
  private listeners = new Set<ProgressListener>();

  constructor(opts: {
    publicClient: PublicClient;
    announcerAddress?: Address;
    chain: Chain;
    wasm: StealthLifecycleWasm;
    getKeys: () => MasterKeys;
  }) {
    this.publicClient = opts.publicClient;
    this.announcerAddress =
      opts.announcerAddress ??
      (getConfigForChain(opts.chain.id)?.announcer as Address) ??
      ("0x0000000000000000000000000000000000000000" as Address);
    this.chain = opts.chain;
    this.wasm = opts.wasm;
    this.getKeys = opts.getKeys;
    const config = getConfigForChain(opts.chain.id);
    this.deployedBlock = BigInt(config?.deployedBlock ?? 0);
    console.log("👁️ [Opaque] StealthScanner created", { announcer: this.announcerAddress, chainId: this.chain.id, deployedBlock: String(this.deployedBlock) });
  }

  getChain(): Chain {
    return this.chain;
  }

  /** Subscribe to scanning progress updates */
  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    listener(this.progress);
    return () => this.listeners.delete(listener);
  }

  private setProgress(update: Partial<ScanningProgress>) {
    this.progress = { ...this.progress, ...update };
    this.listeners.forEach((l) => l(this.progress));
  }

  /**
   * Historical sync: fetch Announcement logs in chunks to avoid RPC rate limits.
   * Never scans before deployedBlock. Uses lastSyncedBlock + 1 when available.
   * fromBlock/toBlock optional; if omitted uses lastSyncedBlock + 1 -> current, or deployedBlock -> current.
   */
  async updateVault(fromBlock?: bigint, toBlock?: bigint): Promise<void> {
    const to = toBlock ?? (await this.publicClient.getBlockNumber());
    const lastSynced = useVaultStore.getState().lastSyncedBlock;
    const startFrom = lastSynced !== null ? lastSynced + 1n : this.deployedBlock;
    const from = fromBlock ?? startFrom;
    const fromBounded = from < this.deployedBlock ? this.deployedBlock : from;
    console.log("👁️ [Opaque] updateVault", { from: String(fromBounded), to: String(to), lastSynced: lastSynced != null ? String(lastSynced) : null, deployedBlock: String(this.deployedBlock) });
    if (fromBounded > to) {
      console.log("👁️ [Opaque] Nothing to sync, already up to date");
      this.setProgress({ status: "watching", error: null });
      return;
    }

    this.setProgress({
      status: "syncing",
      fromBlock: fromBounded,
      toBlock: to,
      totalBlocks: to - fromBounded + 1n,
      lastProcessedBlock: null,
      error: null,
    });

    const keys = this.getKeys();
    const viewPriv = keys.viewPrivKey;
    const spendPub = keys.spendPubKey;
    let current = fromBounded;
    const announcer = this.announcerAddress;

    try {
      while (current <= to) {
        const end = current + BigInt(CHUNK_SIZE) - 1n > to ? to : current + BigInt(CHUNK_SIZE) - 1n;
        const logs = await this.publicClient.getContractEvents({
          address: announcer,
          abi: STEALTH_ANNOUNCER_ABI as readonly unknown[],
          eventName: "Announcement",
          fromBlock: current,
          toBlock: end,
        });
        if (logs.length > 0) console.log("👁️ [Opaque] Chunk logs", { fromBlock: String(current), toBlock: String(end), count: logs.length });

        for (const log of logs) {
          this.processDecodedLog(log, viewPriv, spendPub);
        }

        current = end + 1n;
        useVaultStore.getState().setLastSyncedBlock(end);
        this.setProgress({ lastProcessedBlock: end });
        await delay(RPC_DELAY_MS);
      }

      console.log("👁️ [Opaque] Historical sync done ✅");
      this.setProgress({ status: "watching", error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("⚠️ [Opaque] updateVault error", { error: msg });
      this.setProgress({ status: "error", error: msg });
      throw err;
    }
  }

  /**
   * Start real-time listener for new Announcement events.
   */
  startWatching(): void {
    if (this.unsubscribeWatch) {
      console.log("👁️ [Opaque] Already watching, skip");
      return;
    }
    console.log("👁️ [Opaque] Starting watchContractEvent");
    const keys = this.getKeys();
    const viewPriv = keys.viewPrivKey;
    const spendPub = keys.spendPubKey;

    this.unsubscribeWatch = this.publicClient.watchContractEvent({
      address: this.announcerAddress,
      abi: STEALTH_ANNOUNCER_ABI as readonly unknown[],
      eventName: "Announcement",
      onLogs: (logs) => {
        if (logs.length > 0) console.log("👁️ [Opaque] New Announcement logs", { count: logs.length });
        logs.forEach((log) => this.processDecodedLog(log, viewPriv, spendPub));
      },
    });
    this.setProgress({ status: "watching", error: null });
    console.log("👁️ [Opaque] Watching ✅");
  }

  stopWatching(): void {
    if (this.unsubscribeWatch) {
      this.unsubscribeWatch();
      this.unsubscribeWatch = null;
      console.log("👁️ [Opaque] Stopped watching");
    }
    this.setProgress({ status: "idle" });
  }

  private processDecodedLog(
    log: { args?: { schemeId?: bigint; stealthAddress?: Address; ephemeralPubKey?: Hex; metadata?: Hex }; blockNumber?: bigint | null; transactionHash?: Hash | null },
    viewPrivKey: Uint8Array,
    spendPubKey: Uint8Array
  ): void {
    const args = log.args;
    if (!args || args.schemeId !== SCHEME_ID_SECP256K1) return;

    const stealthAddress = args.stealthAddress;
    const ephemeralPubKeyHex = args.ephemeralPubKey;
    const metadata = args.metadata;
    if (!stealthAddress || !ephemeralPubKeyHex) return;

    const ephemeralPubKey = hexToBytes(ephemeralPubKeyHex);
    if (ephemeralPubKey.length !== 33) return;

    const viewTag = metadata && metadata.length >= 2 ? parseInt(metadata.slice(2, 4), 16) : 0;
    const viewTagResult = this.wasm.check_announcement_view_tag_wasm(
      viewTag,
      viewPrivKey,
      ephemeralPubKey
    );
    if (viewTagResult === "NoMatch") return;

    const isOurs = this.wasm.check_announcement_wasm(
      getAddress(stealthAddress),
      viewTag,
      viewPrivKey,
      spendPubKey,
      ephemeralPubKey
    );
    if (!isOurs) return;

    const addr = getAddress(stealthAddress);
    console.log("📥 [Opaque] Announcement is ours, upserting vault entry", { stealthAddress: addr, block: log.blockNumber?.toString(), txHash: (log.transactionHash ?? "0x").slice(0, 18) + "…" });
    useVaultStore.getState().upsertEntry({
      stealthAddress: addr,
      ephemeralPubKeyHex: ephemeralPubKeyHex as Hex,
      blockNumber: log.blockNumber ?? 0n,
      txHash: (log.transactionHash ?? "0x") as Hash,
      amountWei: 0n,
      isSpent: false,
    });
  }
}

// -----------------------------------------------------------------------------
// refreshBalances: multicall getBalance for all vault addresses
// -----------------------------------------------------------------------------

export async function refreshBalances(publicClient: PublicClient): Promise<void> {
  const entries = useVaultStore.getState().entries;
  const addresses = entries.map((e) => e.stealthAddress);
  if (addresses.length === 0) {
    console.log("💰 [Opaque] refreshBalances: no entries, skip");
    return;
  }
  console.log("💰 [Opaque] refreshBalances", { count: addresses.length });

  const balances = await Promise.all(
    addresses.map((addr) => publicClient.getBalance({ address: addr }))
  );
  useVaultStore.getState().setBalances(
    addresses.map((addr, i) => ({ stealthAddress: addr, amountWei: balances[i] }))
  );
  console.log("💰 [Opaque] Balances updated ✅", addresses.map((a, i) => ({ addr: a.slice(0, 10) + "…", wei: String(balances[i]) })));
}

// -----------------------------------------------------------------------------
// getStealthWallet: reconstruct one-time key and return viem account
// -----------------------------------------------------------------------------

export function getStealthWallet(
  stealthAddress: Address,
  wasm: StealthLifecycleWasm,
  masterKeys: MasterKeys
): ReturnType<typeof privateKeyToAccount> {
  const entry = useVaultStore.getState().getEntry(stealthAddress);
  if (!entry) {
    console.error("⚠️ [Opaque] getStealthWallet: entry not found", { stealthAddress });
    throw new Error(`Stealth address ${stealthAddress} not found in vault`);
  }
  console.log("🔐 [Opaque] Reconstructing stealth wallet", { stealthAddress: stealthAddress.slice(0, 14) + "…" });

  const ephemeralPubKey = hexToBytes(entry.ephemeralPubKeyHex);
  if (ephemeralPubKey.length !== 33) {
    throw new Error("Invalid ephemeral public key in vault entry");
  }

  const stealthPrivKey = wasm.reconstruct_signing_key_wasm(
    masterKeys.spendPrivKey,
    masterKeys.viewPrivKey,
    ephemeralPubKey
  );
  const hexKey = ("0x" + Array.from(stealthPrivKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")) as Hex;
  return privateKeyToAccount(hexKey);
}

// -----------------------------------------------------------------------------
// withdrawStealthFunds: sign and send; relayer hook if no gas
// -----------------------------------------------------------------------------

export type RelayerHint = "no_gas" | "ok";

export async function withdrawStealthFunds(
  stealthAddress: Address,
  destinationAddress: Address,
  publicClient: PublicClient,
  wasm: StealthLifecycleWasm,
  masterKeys: MasterKeys,
  opts?: {
    /** If provided, called when stealth address has 0 ETH (no gas for tx). Return true to abort. */
    onNoGas?: (hint: RelayerHint) => boolean | void;
    /** Optional gas limit override */
    gas?: bigint;
  }
): Promise<Hash> {
  console.log("📤 [Opaque] withdrawStealthFunds", { stealth: stealthAddress.slice(0, 14) + "…", to: destinationAddress.slice(0, 14) + "…" });
  const entry = useVaultStore.getState().getEntry(stealthAddress);
  if (!entry) {
    console.error("⚠️ [Opaque] withdrawStealthFunds: entry not found", { stealthAddress });
    throw new Error(`Stealth address ${stealthAddress} not found in vault`);
  }

  const balance = entry.amountWei;
  if (balance === 0n) {
    const abort = opts?.onNoGas?.("no_gas");
    if (abort === true) {
      throw new Error("Withdrawal aborted: stealth address has 0 ETH for gas. Use a relayer or fund the address.");
    }
    // Caller may still want to try (e.g. relayer will pay); we warn via callback only.
  }

  const account = getStealthWallet(stealthAddress, wasm, masterKeys);
  const chain = publicClient.chain;
  const rpcUrl = chain ? getRpcUrl(chain) : undefined;
  if (!rpcUrl) {
    throw new Error("Cannot send transaction: no RPC URL on public client chain");
  }
  const walletClient = createWalletClient({
    account,
    chain: chain ?? undefined,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.sendTransaction({
    account,
    chain: chain ?? undefined,
    to: destinationAddress,
    value: balance,
    gas: opts?.gas,
  });

  console.log("📤 [Opaque] Withdrawal tx sent ✅", { hash });
  useVaultStore.getState().markSpent(stealthAddress);
  return hash;
}

// -----------------------------------------------------------------------------
// Withdrawal status (for live UI feedback)
// -----------------------------------------------------------------------------

export type WithdrawalStepTag = "CALC" | "SIGN" | "SEND" | "DONE";

export type WithdrawalStatus = {
  tag: WithdrawalStepTag;
  label: string;
  detail?: string;
};

export type WithdrawalStatusCallback = (status: WithdrawalStatus) => void;

// Minimal ABI for gas estimation (transfer only); full ERC20_TRANSFER_ABI is below.
const ERC20_TRANSFER_ONLY_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// -----------------------------------------------------------------------------
// checkStealthWithdrawalGas: P_balance vs G for UI intercept (no key required)
// -----------------------------------------------------------------------------
export type CheckStealthGasResult = {
  sufficient: boolean;
  balanceWei: bigint;
  estimatedGasCostWei: bigint;
};

async function getGasPriceWei(publicClient: PublicClient): Promise<bigint> {
  const fees = await publicClient.estimateFeesPerGas().catch(() => null);
  if (fees && "maxFeePerGas" in fees && fees.maxFeePerGas != null) {
    return fees.maxFeePerGas;
  }
  return publicClient.getGasPrice();
}

/**
 * Check if a stealth address has enough ETH to cover gas for a withdrawal.
 * Use this before calling executeStealthWithdrawal/executeTokenWithdrawal to show
 * the "Gas Required" modal when P_balance < G.
 */
export async function checkStealthWithdrawalGas(
  publicClient: PublicClient,
  stealthAddress: Address,
  options:
    | { type: "native"; destination: Address }
    | { type: "token"; tokenAddress: Address; destination: Address; tokenBalance: bigint }
): Promise<CheckStealthGasResult> {
  const balanceWei = await publicClient.getBalance({ address: stealthAddress });

  let gasLimit: bigint;
  if (options.type === "native") {
    gasLimit = await publicClient.estimateGas({
      account: stealthAddress,
      to: options.destination,
      value: 1n,
      data: "0x",
    });
  } else {
    gasLimit = await publicClient.estimateGas({
      account: stealthAddress,
      to: options.tokenAddress,
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ONLY_ABI,
        functionName: "transfer",
        args: [options.destination, options.tokenBalance],
      }),
    });
  }

  const gasPriceWei = await getGasPriceWei(publicClient);
  const estimatedGasCostWei = gasLimit * gasPriceWei;
  const sufficient = balanceWei > estimatedGasCostWei;

  return { sufficient, balanceWei, estimatedGasCostWei };
}

// -----------------------------------------------------------------------------
// executeStealthWithdrawal: gas-aware sweep (max spendable = balance - gas)
// -----------------------------------------------------------------------------
/**
 * Sweeps the full spendable balance from a stealth address to a destination.
 * Gas is paid by the stealth address; the sendable amount is balance minus total gas cost.
 *
 * Math:
 *   TotalGasCost = GasLimit × GasPrice (or GasLimit × maxFeePerGas for EIP-1559)
 *   SendableAmount = StealthBalance - TotalGasCost
 *
 * @param stealthPrivKey - Hex string of the 32-byte stealth private key (0x…)
 * @param destinationAddress - Where to send the ETH
 * @param publicClient - Viem public client for the chain
 * @param onStatus - Optional callback for live UI steps ([ CALC ], [ SIGN ], [ SEND ], [ DONE ])
 * @returns Transaction hash
 */
export async function executeStealthWithdrawal(
  stealthPrivKey: Hex,
  destinationAddress: Address,
  publicClient: PublicClient,
  onStatus?: WithdrawalStatusCallback
): Promise<Hash> {
  const report = (tag: WithdrawalStepTag, label: string, detail?: string) => {
    onStatus?.({ tag, label, detail });
  };

  const normalizedKey = (stealthPrivKey.startsWith("0x") ? stealthPrivKey : `0x${stealthPrivKey}`) as Hex;
  const account = privateKeyToAccount(normalizedKey);

  const chain = publicClient.chain;
  const rpcUrl = chain ? getRpcUrl(chain) : undefined;
  if (!rpcUrl) {
    throw new Error("Cannot send transaction: no RPC URL on public client chain");
  }

  report("CALC", "Reconstructing one-time private key from vault…");
  // Account already derived above; this step is logical (key is ready for signing)
  report("CALC", "Estimating network gas requirements…");

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    throw new Error("Insufficient funds to cover gas fees.");
  }

  let gasLimit: bigint;
  try {
    gasLimit = await publicClient.estimateGas({
      account: account.address,
      to: destinationAddress,
      value: 1n, // Gas for simple ETH transfer is independent of value
      data: "0x",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Gas estimation failed: ${msg}`);
  }

  type Eip1559Fees = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  let gasPriceWei: bigint;
  let eip1559Fees: Eip1559Fees | null = null;
  try {
    const fees = await publicClient.estimateFeesPerGas().catch(() => null);
    if (fees && "maxFeePerGas" in fees && fees.maxFeePerGas != null) {
      gasPriceWei = fees.maxFeePerGas;
      eip1559Fees = fees as Eip1559Fees;
    } else {
      gasPriceWei = await publicClient.getGasPrice();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to fetch gas price: ${msg}`);
  }

  const totalGasCost = gasLimit * gasPriceWei;
  if (totalGasCost >= balance) {
    throw new Error("Insufficient funds to cover gas fees.");
  }
  const sendableAmount = balance - totalGasCost;
  const gasEth = formatEther(totalGasCost);
  const sendEth = formatEther(sendableAmount);

  report("CALC", `Optimizing transaction value: Deducting ${gasEth} ETH for gas.`, `Sending ${sendEth} ETH to destination`);

  report("SIGN", "Signing transaction with ephemeral stealth key…");

  const walletClient = createWalletClient({
    account,
    chain: chain ?? undefined,
    transport: http(rpcUrl),
  });

  report("SEND", "Broadcasting to network via stealth address [0x…]", account.address);

  const txRequest = {
    account,
    chain: publicClient.chain ?? undefined,
    to: destinationAddress,
    value: sendableAmount,
    data: "0x" as const,
    gas: gasLimit,
    ...(eip1559Fees
      ? { maxFeePerGas: eip1559Fees.maxFeePerGas, maxPriorityFeePerGas: eip1559Fees.maxPriorityFeePerGas }
      : { gasPrice: gasPriceWei }),
  };

  let hash: Hash;
  try {
    hash = await walletClient.sendTransaction(txRequest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("reject") || msg.includes("denied") || msg.includes("User")) {
      throw new Error("User rejected signature.");
    }
    throw new Error(`Transaction failed: ${msg}`);
  }

  report("DONE", "Funds successfully swept to [Destination].", destinationAddress);
  console.log("📤 [Opaque] Stealth withdrawal tx sent ✅", { hash, from: account.address.slice(0, 14) + "…", to: destinationAddress.slice(0, 14) + "…" });
  return hash;
}

// -----------------------------------------------------------------------------
// claimStealthFunds: transfer from derived one-time key to destination
// -----------------------------------------------------------------------------
/**
 * Sends ETH from a stealth address to a destination. The transaction is signed
 * by the one-time stealth private key so the on-chain "from" is the stealth
 * address itself, preserving unlinkability.
 *
 * For sweeping the full balance with gas deduction, use executeStealthWithdrawal instead.
 *
 * @param stealthPrivateKey - Hex string of the 32-byte stealth private key (0x…)
 *   derived in the previous step; must correspond to the stealth address holding the funds.
 * @param amount - Amount in wei to transfer
 * @param toAddress - Destination address (e.g. a fresh wallet; avoid connected wallet to preserve privacy)
 * @param publicClient - Viem public client for the chain
 * @returns Transaction hash
 */
export async function claimStealthFunds(
  stealthPrivateKey: Hex,
  amount: bigint,
  toAddress: Address,
  publicClient: PublicClient
): Promise<Hash> {
  const normalizedKey = (stealthPrivateKey.startsWith("0x") ? stealthPrivateKey : `0x${stealthPrivateKey}`) as Hex;
  const account = privateKeyToAccount(normalizedKey);

  const chain = publicClient.chain;
  const rpcUrl = chain ? getRpcUrl(chain) : undefined;
  if (!rpcUrl) {
    throw new Error("Cannot send transaction: no RPC URL on public client chain");
  }

  const balance = await publicClient.getBalance({ address: account.address });
  const gasEstimate = await publicClient.estimateGas({
    account: account.address,
    to: toAddress,
    value: amount,
  });
  const gasCost = gasEstimate * (await publicClient.getGasPrice());
  if (balance < amount + gasCost) {
    throw new Error(
      "Insufficient Gas. Please fund this stealth address from a neutral source (like an exchange) to maintain privacy."
    );
  }

  const walletClient = createWalletClient({
    account,
    chain: chain ?? undefined,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.sendTransaction({
    account,
    chain: chain ?? undefined,
    to: toAddress,
    value: amount,
    gas: gasEstimate,
  });

  console.log("📤 [Opaque] Claim tx sent ✅", { hash, from: account.address.slice(0, 14) + "…", to: toAddress.slice(0, 14) + "…" });
  return hash;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function hexToBytes(hex: Hex | string): Uint8Array {
  const s = typeof hex === "string" && hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = s.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// -----------------------------------------------------------------------------
// executeTokenWithdrawal: sweep ERC20 from stealth address to destination
// -----------------------------------------------------------------------------
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

export async function executeTokenWithdrawal(
  stealthPrivKey: Hex,
  tokenAddress: Address,
  destinationAddress: Address,
  publicClient: PublicClient,
  onStatus?: WithdrawalStatusCallback
): Promise<Hash> {
  const report = (tag: WithdrawalStepTag, label: string, detail?: string) => {
    onStatus?.({ tag, label, detail });
  };
  const normalizedKey = (stealthPrivKey.startsWith("0x") ? stealthPrivKey : `0x${stealthPrivKey}`) as Hex;
  const account = privateKeyToAccount(normalizedKey);

  const chain = publicClient.chain;
  const rpcUrl = chain ? getRpcUrl(chain) : undefined;
  if (!rpcUrl) throw new Error("Cannot send transaction: no RPC URL on public client chain");

  report("CALC", "Reading token balance…");
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_TRANSFER_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance === 0n) throw new Error("Zero token balance.");

  report("CALC", "Estimating gas for token transfer…");
  let gasLimit: bigint;
  try {
    gasLimit = await publicClient.estimateGas({
      account: account.address,
      to: tokenAddress,
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [destinationAddress, balance],
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Gas estimation failed: ${msg}`);
  }

  const ethBalance = await publicClient.getBalance({ address: account.address });
  type Eip1559Fees = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  let gasPriceWei: bigint;
  let eip1559Fees: Eip1559Fees | null = null;
  try {
    const fees = await publicClient.estimateFeesPerGas().catch(() => null);
    if (fees && "maxFeePerGas" in fees && fees.maxFeePerGas != null) {
      gasPriceWei = fees.maxFeePerGas;
      eip1559Fees = fees as Eip1559Fees;
    } else {
      gasPriceWei = await publicClient.getGasPrice();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to fetch gas price: ${msg}`);
  }
  const totalGasCost = gasLimit * gasPriceWei;
  if (ethBalance < totalGasCost) {
    throw new Error("Insufficient ETH on stealth address to pay for gas.");
  }

  report("SIGN", "Signing token transfer with stealth key…");
  const walletClient = createWalletClient({
    account,
    chain: chain ?? undefined,
    transport: http(rpcUrl),
  });

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [destinationAddress, balance],
  });

  report("SEND", "Broadcasting token transfer…");
  const hash = await walletClient.sendTransaction({
    account,
    chain: chain ?? undefined,
    to: tokenAddress,
    value: 0n,
    data,
    gas: gasLimit,
    ...(eip1559Fees
      ? { maxFeePerGas: eip1559Fees.maxFeePerGas, maxPriorityFeePerGas: eip1559Fees.maxPriorityFeePerGas }
      : { gasPrice: gasPriceWei }),
  });
  report("DONE", "Token transfer sent.", hash);
  return hash;
}

export { formatEther };
