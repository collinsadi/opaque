import { Bytes } from "@graphprotocol/graph-ts"
import { Announcement as AnnouncementEvent } from "../generated/StealthAddressAnnouncer/StealthAddressAnnouncer"
import { Announcement } from "../generated/schema"

export function handleAnnouncement(event: AnnouncementEvent): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let entity = new Announcement(id)

  entity.etherealPublicKey = event.params.ephemeralPubKey
  entity.viewTag = event.params.schemeId.toI32()
  entity.metadata = event.params.metadata
  entity.stealthAddress = Bytes.fromHexString(event.params.stealthAddress.toHexString())

  entity.blockNumber = event.block.number
  entity.timestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex.toI32()

  entity.save()
}
