import { CodeBlock } from "@/components/CodeBlock";

export function Install() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">Installation</h1>
      <p className="text-mist">
        <code className="text-glow">@opaquecash/opaque</code> is published on the npm
        registry. Add it to your project like any other dependency.
      </p>
      <CodeBlock
        title="terminal"
        language="bash"
        code="npm install @opaquecash/opaque"
      />
    </div>
  );
}
