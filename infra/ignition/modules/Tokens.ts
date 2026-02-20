import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TokensModule", (m) => {
  const name = m.getParameter("name", "Mock USDT");
  const symbol = m.getParameter("symbol", "USDT");
  const decimals = m.getParameter("decimals", 6);

  const token = m.contract("MockERC20", [name, symbol, decimals]);

  return { token };
});
