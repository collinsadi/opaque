import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ReputationModule", (m) => {
  const admin = m.getParameter("admin");
  const groth16Verifier = m.getParameter("groth16Verifier");

  const reputationVerifier = m.contract("OpaqueReputationVerifier", [
    groth16Verifier,
    admin,
  ]);

  return { reputationVerifier };
});
