//! # Opaque Cash — WASM Bindings
//!
//! WebAssembly bindings for the stealth address scanner engine (EIP-5564 / DKSAP).

use wasm_bindgen::prelude::*;
use js_sys;
use k256::{ecdsa::SigningKey, PublicKey};
use alloy_primitives::Address;
use std::str::FromStr;

mod scanner;

use scanner::{
    derive_stealth_address, derive_stealth_signing_key, check_announcement,
    check_announcement_view_tag, ViewTagCheck,
};

// Initialize panic hook for better error messages in browser console
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

// =============================================================================
// Type conversions: Rust <-> JavaScript
// =============================================================================

/// Converts a 32-byte Uint8Array to a SigningKey
fn bytes_to_signing_key(bytes: &[u8]) -> Result<SigningKey, JsValue> {
    if bytes.len() != 32 {
        return Err(JsValue::from_str("SigningKey must be 32 bytes"));
    }
    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(bytes);
    SigningKey::from_bytes(&key_bytes.into())
        .map_err(|e| JsValue::from_str(&format!("Invalid signing key: {}", e)))
}

/// Converts a compressed public key (33 bytes) to PublicKey
fn bytes_to_public_key(bytes: &[u8]) -> Result<PublicKey, JsValue> {
    if bytes.len() != 33 {
        return Err(JsValue::from_str("PublicKey must be 33 bytes (compressed)"));
    }
    PublicKey::from_sec1_bytes(bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid public key: {}", e)))
}

/// Converts an Address to a hex string
fn address_to_hex(address: &Address) -> String {
    format!("{:#x}", address)
}

/// Converts a hex string to an Address
fn hex_to_address(hex: &str) -> Result<Address, JsValue> {
    Address::from_str(hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid address hex: {}", e)))
}

// =============================================================================
// WASM Exports
// =============================================================================

/// Derives a stealth address and view tag from the given keys.
///
/// # Arguments
/// * `view_privkey_bytes` - 32-byte viewing private key (Uint8Array)
/// * `spend_pubkey_bytes` - 33-byte spending public key, compressed (Uint8Array)
/// * `ephemeral_pubkey_bytes` - 33-byte ephemeral public key, compressed (Uint8Array)
///
/// # Returns
/// A JavaScript object with:
/// * `stealthAddress` - Ethereum address as hex string (0x...)
/// * `viewTag` - View tag as number (0-255)
#[wasm_bindgen]
pub fn derive_stealth_address_wasm(
    view_privkey_bytes: &[u8],
    spend_pubkey_bytes: &[u8],
    ephemeral_pubkey_bytes: &[u8],
) -> Result<JsValue, JsValue> {
    let view_privkey = bytes_to_signing_key(view_privkey_bytes)?;
    let spend_pubkey = bytes_to_public_key(spend_pubkey_bytes)?;
    let ephemeral_pubkey = bytes_to_public_key(ephemeral_pubkey_bytes)?;

    match derive_stealth_address(&view_privkey, &spend_pubkey, &ephemeral_pubkey) {
        Ok((address, view_tag)) => {
            let result = js_sys::Object::new();
            js_sys::Reflect::set(
                &result,
                &"stealthAddress".into(),
                &address_to_hex(&address).into(),
            )?;
            js_sys::Reflect::set(
                &result,
                &"viewTag".into(),
                &JsValue::from(view_tag as u32),
            )?;
            Ok(result.into())
        }
        Err(e) => Err(JsValue::from_str(&format!("Stealth address error: {}", e))),
    }
}

/// Checks if an announcement matches this recipient's keys.
///
/// # Arguments
/// * `announcement_stealth_address` - Stealth address from announcement (hex string)
/// * `view_tag` - View tag from announcement (number 0-255)
/// * `view_privkey_bytes` - 32-byte viewing private key (Uint8Array)
/// * `spend_pubkey_bytes` - 33-byte spending public key, compressed (Uint8Array)
/// * `ephemeral_pubkey_bytes` - 33-byte ephemeral public key, compressed (Uint8Array)
///
/// # Returns
/// `true` if the announcement is for this recipient, `false` otherwise.
#[wasm_bindgen]
pub fn check_announcement_wasm(
    announcement_stealth_address: &str,
    view_tag: u8,
    view_privkey_bytes: &[u8],
    spend_pubkey_bytes: &[u8],
    ephemeral_pubkey_bytes: &[u8],
) -> Result<bool, JsValue> {
    let address = hex_to_address(announcement_stealth_address)?;
    let view_privkey = bytes_to_signing_key(view_privkey_bytes)?;
    let spend_pubkey = bytes_to_public_key(spend_pubkey_bytes)?;
    let ephemeral_pubkey = bytes_to_public_key(ephemeral_pubkey_bytes)?;

    check_announcement(
        address,
        view_tag,
        &view_privkey,
        &spend_pubkey,
        &ephemeral_pubkey,
    )
    .map_err(|e| JsValue::from_str(&format!("Check announcement error: {}", e)))
}

/// Quick view-tag check before expensive EC operations.
///
/// # Arguments
/// * `view_tag` - View tag from announcement (number 0-255)
/// * `view_privkey_bytes` - 32-byte viewing private key (Uint8Array)
/// * `ephemeral_pubkey_bytes` - 33-byte ephemeral public key, compressed (Uint8Array)
///
/// # Returns
/// `"NoMatch"` if view tag doesn't match (skip this announcement),
/// `"PossibleMatch"` if view tag matches (proceed with full check).
#[wasm_bindgen]
pub fn check_announcement_view_tag_wasm(
    view_tag: u8,
    view_privkey_bytes: &[u8],
    ephemeral_pubkey_bytes: &[u8],
) -> Result<String, JsValue> {
    let view_privkey = bytes_to_signing_key(view_privkey_bytes)?;
    let ephemeral_pubkey = bytes_to_public_key(ephemeral_pubkey_bytes)?;

    match check_announcement_view_tag(view_tag, &view_privkey, &ephemeral_pubkey) {
        ViewTagCheck::NoMatch => Ok("NoMatch".to_string()),
        ViewTagCheck::PossibleMatch => Ok("PossibleMatch".to_string()),
    }
}

/// Reconstructs the one-time signing key (private key) for a stealth address.
///
/// # Arguments
/// * `master_spend_priv_bytes` - 32-byte spending private key (Uint8Array)
/// * `master_view_priv_bytes` - 32-byte viewing private key (Uint8Array)
/// * `ephemeral_pubkey_bytes` - 33-byte ephemeral public key, compressed (Uint8Array)
///
/// # Returns
/// 32-byte stealth private key as Uint8Array (for use with ethers.Wallet or viem privateKeyToAccount).
#[wasm_bindgen]
pub fn reconstruct_signing_key_wasm(
    master_spend_priv_bytes: &[u8],
    master_view_priv_bytes: &[u8],
    ephemeral_pubkey_bytes: &[u8],
) -> Result<Vec<u8>, JsValue> {
    let spend_privkey = bytes_to_signing_key(master_spend_priv_bytes)?;
    let view_privkey = bytes_to_signing_key(master_view_priv_bytes)?;
    let ephemeral_pubkey = bytes_to_public_key(ephemeral_pubkey_bytes)?;

    derive_stealth_signing_key(&view_privkey, &spend_privkey, &ephemeral_pubkey)
        .map(|bytes| bytes.to_vec())
        .map_err(|e| JsValue::from_str(&format!("Reconstruct signing key error: {}", e)))
}
