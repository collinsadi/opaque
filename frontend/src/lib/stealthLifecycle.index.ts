/**
 * Phase 3 stealth lifecycle — public API.
 * Use these together: StealthScanner (discovery), VaultStore (persistence), getStealthWallet + withdrawStealthFunds (spending).
 */

export {
  StealthScanner,
  refreshBalances,
  getStealthWallet,
  withdrawStealthFunds,
  executeStealthWithdrawal,
  claimStealthFunds,
  formatEther,
  type StealthLifecycleWasm,
  type ScanStatus,
  type ScanningProgress,
  type MasterKeys,
  type RelayerHint,
  type WithdrawalStepTag,
  type WithdrawalStatus,
  type WithdrawalStatusCallback,
} from "./stealthLifecycle";
export { useVaultStore, type StealthVaultEntry } from "../store/vaultStore";
