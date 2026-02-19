import { useEffect, useRef } from "react";

export type StepStatus = "wait" | "ok" | "done" | "error";

export type ProtocolStep = {
  id: string;
  status: StepStatus;
  label: string;
  detail?: string;
};

type ProtocolStepperProps = {
  steps: ProtocolStep[];
  className?: string;
};

const statusConfig: Record<
  StepStatus,
  { badge: string; className: string }
> = {
  wait: {
    badge: "WAIT",
    className: "text-amber-400 border-amber-500/50 bg-amber-500/10",
  },
  ok: {
    badge: "OK",
    className: "text-emerald-400 border-emerald-500/50 bg-emerald-500/10",
  },
  done: {
    badge: "DONE",
    className: "text-cyan border-cyan/50 bg-cyan/10",
  },
  error: {
    badge: "ERR",
    className: "text-red-400 border-red-500/50 bg-red-500/10",
  },
};

export function ProtocolStepper({ steps, className = "" }: ProtocolStepperProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps]);

  return (
    <div
      ref={scrollRef}
      className={
        "protocol-stepper max-h-64 overflow-y-auto rounded-xl border border-frost-border bg-charcoal/90 p-3 font-mono text-sm " +
        className
      }
    >
      {steps.length === 0 ? (
        <p className="text-slate-500 text-xs">Protocol log will appear here…</p>
      ) : (
        <ul className="space-y-2">
          {steps.map((step) => {
            const config = statusConfig[step.status];
            return (
              <li
                key={step.id}
                className="flex flex-col gap-0.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={
                      "inline-flex shrink-0 items-center px-1.5 py-0.5 rounded border text-xs font-medium " +
                      config.className
                    }
                  >
                    [ {config.badge} ]
                  </span>
                  <span className="text-slate-300">{step.label}</span>
                </div>
                {step.detail && (
                  <div className="pl-4 text-slate-500 text-xs break-all">
                    {step.detail}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
