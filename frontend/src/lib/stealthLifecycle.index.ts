/**
 * Phase 3 stealth lifecycle — public API.
 * Use these together: StealthScanner (discovery), VaultStore (persistence), getStealthWallet + withdrawStealthFunds (spending).
 */

export {
  StealthScanner,
  refreshBalances,
  getStealthWallet,
  withdrawStealthFunds,
  formatEther,
  type StealthLifecycleWasm,
  type ScanStatus,
  type ScanningProgress,
  type MasterKeys,
  type RelayerHint,
} from "./stealthLifecycle";
export { useVaultStore, type StealthVaultEntry } from "../store/vaultStore";
