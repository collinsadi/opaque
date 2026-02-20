import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
import { handleAnnouncement } from "../src/mapping"
import { createAnnouncementEvent } from "./stealth-address-announcer-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let schemeId = BigInt.fromI32(234)
    let stealthAddress = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let caller = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let ephemeralPubKey = Bytes.fromI32(1234567890)
    let metadata = Bytes.fromI32(1234567890)
    let newAnnouncementEvent = createAnnouncementEvent(
      schemeId,
      stealthAddress,
      caller,
      ephemeralPubKey,
      metadata
    )
    handleAnnouncement(newAnnouncementEvent)
  })

  afterAll(() => {
    clearStore()
  })

  test("Announcement created and stored with raw hex fields for stealth derivation", () => {
    assert.entityCount("Announcement", 1)

    // id = txHash-logIndex (default mock tx hash from newMockEvent)
    assert.fieldEquals(
      "Announcement",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "etherealPublicKey",
      "1234567890"
    )
    assert.fieldEquals(
      "Announcement",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "metadata",
      "1234567890"
    )
    assert.fieldEquals(
      "Announcement",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "stealthAddress",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "Announcement",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "logIndex",
      "1"
    )
  })
})
