import { useEffect, useId, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { highlightToHtml } from "@/lib/highlight";

export function CodeBlock({
  code,
  title,
  language = "ts",
}: {
  code: string;
  title?: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const labelId = useId();
  const trimmed = code.trim();

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    highlightToHtml(trimmed, language)
      .then((h) => {
        if (!cancelled) setHtml(h);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setHtml(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trimmed, language]);

  async function copy() {
    await navigator.clipboard.writeText(trimmed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-ink-600 bg-ink-900/80 shadow-lg shadow-black/40"
      aria-labelledby={labelId}
    >
      <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/50 px-4 py-2">
        <span id={labelId} className="font-mono text-xs text-mist">
          {title ?? language}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-mist transition-colors hover:bg-ink-700 hover:text-glow"
        >
          {copied ? (
            <>
              <Check size={14} className="text-glow" />
              Copied
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy
            </>
          )}
        </button>
      </div>

      <div className="relative max-h-[min(70vh,520px)] overflow-auto">
        {html === null && !failed ? (
          <div
            className="flex items-center gap-2 p-4 font-mono text-[13px] text-mist"
            aria-busy="true"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-glow" />
            Highlighting…
          </div>
        ) : null}

        {failed ? (
          <pre className="p-4 font-mono text-[13px] leading-relaxed text-slate-300">
            <code>{trimmed}</code>
          </pre>
        ) : null}

        {html ? (
          <div
            className="shiki-docs p-4 [&_pre.shiki]:m-0 [&_pre.shiki]:rounded-lg [&_pre.shiki]:bg-ink-950/90 [&_pre.shiki]:p-0 [&_pre.shiki]:font-mono [&_pre.shiki]:text-[13px] [&_pre.shiki]:leading-relaxed [&_code]:font-mono [&_code]:text-[13px]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}
      </div>
    </div>
  );
}
