/* tslint:disable */
/* eslint-disable */

/**
 * Quick view-tag check before expensive EC operations.
 *
 * # Arguments
 * * `view_tag` - View tag from announcement (number 0-255)
 * * `view_privkey_bytes` - 32-byte viewing private key (Uint8Array)
 * * `ephemeral_pubkey_bytes` - 33-byte ephemeral public key, compressed (Uint8Array)
 *
 * # Returns
 * `"NoMatch"` if view tag doesn't match (skip this announcement),
 * `"PossibleMatch"` if view tag matches (proceed with full check).
 */
export function check_announcement_view_tag_wasm(view_tag: number, view_privkey_bytes: Uint8Array, ephemeral_pubkey_bytes: Uint8Array): string;

/**
 * Checks if an announcement matches this recipient's keys.
 *
 * # Arguments
 * * `announcement_stealth_address` - Stealth address from announcement (hex string)
 * * `view_tag` - View tag from announcement (number 0-255)
 * * `view_privkey_bytes` - 32-byte viewing private key (Uint8Array)
 * * `spend_pubkey_bytes` - 33-byte spending public key, compressed (Uint8Array)
 * * `ephemeral_pubkey_bytes` - 33-byte ephemeral public key, compressed (Uint8Array)
 *
 * # Returns
 * `true` if the announcement is for this recipient, `false` otherwise.
 */
export function check_announcement_wasm(announcement_stealth_address: string, view_tag: number, view_privkey_bytes: Uint8Array, spend_pubkey_bytes: Uint8Array, ephemeral_pubkey_bytes: Uint8Array): boolean;

/**
 * Derives a stealth address and view tag from the given keys.
 *
 * # Arguments
 * * `view_privkey_bytes` - 32-byte viewing private key (Uint8Array)
 * * `spend_pubkey_bytes` - 33-byte spending public key, compressed (Uint8Array)
 * * `ephemeral_pubkey_bytes` - 33-byte ephemeral public key, compressed (Uint8Array)
 *
 * # Returns
 * A JavaScript object with:
 * * `stealthAddress` - Ethereum address as hex string (0x...)
 * * `viewTag` - View tag as number (0-255)
 */
export function derive_stealth_address_wasm(view_privkey_bytes: Uint8Array, spend_pubkey_bytes: Uint8Array, ephemeral_pubkey_bytes: Uint8Array): any;

export function init(): void;

/**
 * Reconstructs the one-time signing key (private key) for a stealth address.
 *
 * # Arguments
 * * `master_spend_priv_bytes` - 32-byte spending private key (Uint8Array)
 * * `master_view_priv_bytes` - 32-byte viewing private key (Uint8Array)
 * * `ephemeral_pubkey_bytes` - 33-byte ephemeral public key, compressed (Uint8Array)
 *
 * # Returns
 * 32-byte stealth private key as Uint8Array (for use with ethers.Wallet or viem privateKeyToAccount).
 */
export function reconstruct_signing_key_wasm(master_spend_priv_bytes: Uint8Array, master_view_priv_bytes: Uint8Array, ephemeral_pubkey_bytes: Uint8Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly check_announcement_view_tag_wasm: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly check_announcement_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly derive_stealth_address_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly reconstruct_signing_key_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly init: () => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
