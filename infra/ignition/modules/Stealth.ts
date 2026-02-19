import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("StealthModule", (m) => {
  const announcer = m.contract("StealthAddressAnnouncer");
  const registry = m.contract("StealthMetaAddressRegistry");

  return { announcer, registry };
});
