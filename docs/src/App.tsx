import { Routes, Route } from "react-router-dom";
import { DocsLayout } from "@/layouts/DocsLayout";
import { Overview } from "@/pages/Overview";
import { Install } from "@/pages/Install";
import { QuickStartUnified } from "@/pages/sdk/QuickStartUnified";
import { Configuration } from "@/pages/sdk/Configuration";
import { IndexerFormat } from "@/pages/sdk/IndexerFormat";
import { ApiReference } from "@/pages/sdk/ApiReference";
import { GuideRegister } from "@/pages/guides/Register";
import { GuideSend } from "@/pages/guides/Send";
import { GuideReceive } from "@/pages/guides/Receive";
import { GuideGhost } from "@/pages/guides/Ghost";
import { GuideSweep } from "@/pages/guides/Sweep";
import { GuidePsr } from "@/pages/guides/Psr";
import { GuidePsrMetadataAndAssignment } from "@/pages/guides/psr/MetadataAndAssignment";
import { GuidePsrAssignTransaction } from "@/pages/guides/psr/AssignTransaction";
import { GuidePsrDiscoverTraits } from "@/pages/guides/psr/DiscoverTraits";
import { GuidePsrWitnessJson } from "@/pages/guides/psr/WitnessJson";
import { GuidePsrStealthSignerKey } from "@/pages/guides/psr/StealthSignerKey";
import { GuidePsrGenerateProof } from "@/pages/guides/psr/GenerateProof";
import { GuidePsrReputationRoots } from "@/pages/guides/psr/ReputationRoots";
import { GuidePsrVerifyOnChain } from "@/pages/guides/psr/VerifyOnChain";
import { ModularReference } from "@/pages/reference/Modular";
import { FlowsReference } from "@/pages/reference/Flows";
import { Playground } from "@/pages/Playground";

export default function App() {
  return (
    <Routes>
      <Route element={<DocsLayout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/install" element={<Install />} />
        <Route path="/sdk/quick-start" element={<QuickStartUnified />} />
        <Route path="/sdk/configuration" element={<Configuration />} />
        <Route path="/sdk/indexer" element={<IndexerFormat />} />
        <Route path="/sdk/api" element={<ApiReference />} />
        <Route path="/guides/register" element={<GuideRegister />} />
        <Route path="/guides/send" element={<GuideSend />} />
        <Route path="/guides/receive" element={<GuideReceive />} />
        <Route path="/guides/ghost" element={<GuideGhost />} />
        <Route path="/guides/sweep" element={<GuideSweep />} />
        <Route path="/guides/psr" element={<GuidePsr />} />
        <Route
          path="/guides/psr/metadata-and-assignment"
          element={<GuidePsrMetadataAndAssignment />}
        />
        <Route
          path="/guides/psr/assign-transaction"
          element={<GuidePsrAssignTransaction />}
        />
        <Route
          path="/guides/psr/discover-traits"
          element={<GuidePsrDiscoverTraits />}
        />
        <Route path="/guides/psr/witness-json" element={<GuidePsrWitnessJson />} />
        <Route
          path="/guides/psr/stealth-signer-key"
          element={<GuidePsrStealthSignerKey />}
        />
        <Route path="/guides/psr/generate-proof" element={<GuidePsrGenerateProof />} />
        <Route
          path="/guides/psr/reputation-roots"
          element={<GuidePsrReputationRoots />}
        />
        <Route
          path="/guides/psr/verify-on-chain"
          element={<GuidePsrVerifyOnChain />}
        />
        <Route path="/reference/modular" element={<ModularReference />} />
        <Route path="/reference/flows" element={<FlowsReference />} />
        <Route path="/playground" element={<Playground />} />
      </Route>
    </Routes>
  );
}
