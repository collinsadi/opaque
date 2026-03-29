import { FlowExplorer } from "@/components/FlowExplorer";
import { SectionTitle } from "@/components/Section";

export function FlowsReference() {
  return (
    <div className="space-y-10">
      <SectionTitle>
        Flow explorer
      </SectionTitle>
      <p className="text-mist">
        Interactive step-through for stealth-only, PSR-only, and full-stack paths
        (package-oriented view). Prefer the unified client for new apps — see{" "}
        <strong>Unified SDK</strong> in the sidebar.
      </p>
      <div className="max-w-none">
        <FlowExplorer />
      </div>
    </div>
  );
}
