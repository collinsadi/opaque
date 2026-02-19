import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress } from "viem";
import { network } from "hardhat";

const EPHEMERAL_PUB_KEY = ("0x04" + "00".repeat(64)) as `0x${string}`;
const METADATA = "0x01" as `0x${string}`;

describe("StealthAddressAnnouncer", async function () {
  const { viem } = await network.connect();

  it("should deploy", async function () {
    const announcer = await viem.deployContract("StealthAddressAnnouncer");
    assert.ok(announcer.address);
  });

  it("should emit Announcement when announce() is called", async function () {
    const announcer = await viem.deployContract("StealthAddressAnnouncer");
    const [caller] = await viem.getWalletClients();
    assert.ok(caller);

    const schemeId = 1n;
    const stealthAddress = "0x0000000000000000000000000000000000000001" as const;

    await viem.assertions.emitWithArgs(
      announcer.write.announce([
        schemeId,
        getAddress(stealthAddress),
        EPHEMERAL_PUB_KEY,
        METADATA,
      ]),
      announcer,
      "Announcement",
      [
        schemeId,
        getAddress(stealthAddress),
        getAddress(caller.account.address),
        EPHEMERAL_PUB_KEY,
        METADATA,
      ],
    );
  });

  it("should allow any caller to announce", async function () {
    const announcer = await viem.deployContract("StealthAddressAnnouncer");
    const [sender] = await viem.getWalletClients();
    assert.ok(sender);

    const tx = await announcer.write.announce([
      1n,
      "0x0000000000000000000000000000000000000002" as const,
      "0x04",
      "0x01",
    ]);
    assert.ok(tx);
  });
});
