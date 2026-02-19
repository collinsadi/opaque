import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress, keccak256, stringToHex, toHex } from "viem";
import { network } from "hardhat";

const SCHEME_ID = 1n;
// 65-byte spending pubkey (0x04 + 64 zeros) + 65-byte viewing pubkey, as hex
const META_ADDRESS_BYTES = new Uint8Array(130);
META_ADDRESS_BYTES[0] = 0x04;
META_ADDRESS_BYTES[65] = 0x04;
const META_ADDRESS_HEX = toHex(META_ADDRESS_BYTES) as `0x${string}`;

describe("StealthMetaAddressRegistry", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  it("should deploy and expose DOMAIN_SEPARATOR and type hash", async function () {
    const registry = await viem.deployContract("StealthMetaAddressRegistry");
    const domainSeparator = await registry.read.DOMAIN_SEPARATOR();
    const typeHash = await registry.read.ERC6538REGISTRY_ENTRY_TYPE_HASH();
    assert.ok(domainSeparator !== "0x" + "00".repeat(32));
    const expectedTypeHash = keccak256(
      stringToHex("Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)"),
    );
    assert.equal(typeHash, expectedTypeHash);
  });

  it("should set and read stealth meta-address via registerKeys", async function () {
    const registry = await viem.deployContract("StealthMetaAddressRegistry");
    const [account] = await viem.getWalletClients();
    assert.ok(account);

    await registry.write.registerKeys([SCHEME_ID, META_ADDRESS_HEX]);
    const stored = await registry.read.stealthMetaAddressOf([account.account.address, SCHEME_ID]);
    const storedHex = typeof stored === "string" ? stored : toHex(stored);
    assert.equal(storedHex, META_ADDRESS_HEX);
  });

  it("should set via register (alias) and read nonceOf", async function () {
    const registry = await viem.deployContract("StealthMetaAddressRegistry");
    const [account] = await viem.getWalletClients();
    assert.ok(account);

    const initialNonce = await registry.read.nonceOf([account.account.address]);
    assert.equal(initialNonce, 0n);

    await registry.write.register([SCHEME_ID, META_ADDRESS_HEX]);
    const stored = await registry.read.stealthMetaAddressOf([account.account.address, SCHEME_ID]);
    const storedHex = typeof stored === "string" ? stored : toHex(stored);
    assert.equal(storedHex, META_ADDRESS_HEX);
  });

  it("should emit StealthMetaAddressSet on registerKeys", async function () {
    const registry = await viem.deployContract("StealthMetaAddressRegistry");
    const [account] = await viem.getWalletClients();
    assert.ok(account);

    await viem.assertions.emitWithArgs(
      registry.write.registerKeys([SCHEME_ID, META_ADDRESS_HEX]),
      registry,
      "StealthMetaAddressSet",
      [getAddress(account.account.address), SCHEME_ID, META_ADDRESS_HEX],
    );
  });

  it("should increment nonce and emit NonceIncremented", async function () {
    const registry = await viem.deployContract("StealthMetaAddressRegistry");
    const [account] = await viem.getWalletClients();
    assert.ok(account);

    await registry.write.incrementNonce();
    let nonce = await registry.read.nonceOf([account.account.address]);
    assert.equal(nonce, 1n);

    await viem.assertions.emitWithArgs(
      registry.write.incrementNonce(),
      registry,
      "NonceIncremented",
      [getAddress(account.account.address), 2n],
    );
    nonce = await registry.read.nonceOf([account.account.address]);
    assert.equal(nonce, 2n);
  });

  it("should register on behalf of account with valid EOA signature", async function () {
    const registry = await viem.deployContract("StealthMetaAddressRegistry");
    const [signer] = await viem.getWalletClients();
    assert.ok(signer);
    const registrant = signer.account.address;
    const nonce = 0n;

    const chainId = await publicClient.getChainId();

    const signature = await signer.signTypedData({
      domain: {
        name: "ERC6538Registry",
        version: "1.0",
        chainId,
        verifyingContract: registry.address,
      },
      types: {
        Erc6538RegistryEntry: [
          { name: "schemeId", type: "uint256" },
          { name: "stealthMetaAddress", type: "bytes" },
          { name: "nonce", type: "uint256" },
        ],
      },
      primaryType: "Erc6538RegistryEntry",
      message: {
        schemeId: SCHEME_ID,
        stealthMetaAddress: META_ADDRESS_HEX,
        nonce,
      },
    });

    await registry.write.registerKeysOnBehalf([
      registrant,
      SCHEME_ID,
      signature,
      META_ADDRESS_HEX,
    ]);

    const stored = await registry.read.stealthMetaAddressOf([registrant, SCHEME_ID]);
    const storedHex = typeof stored === "string" ? stored : toHex(stored);
    assert.equal(storedHex, META_ADDRESS_HEX);
  });

  it("should revert registerKeysOnBehalf with invalid signature", async function () {
    const registry = await viem.deployContract("StealthMetaAddressRegistry");
    const [account] = await viem.getWalletClients();
    assert.ok(account);

    const wrongSignature = ("0x" + "00".repeat(65)) as `0x${string}`;
    await assert.rejects(
      async () =>
        registry.write.registerKeysOnBehalf([
          account.account.address,
          SCHEME_ID,
          wrongSignature,
          META_ADDRESS_HEX,
        ]),
      /StealthMetaAddressRegistry__InvalidSignature|revert/,
    );
  });
});
