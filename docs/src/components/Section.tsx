export function SectionTitle({
  id,
  children,
  subtitle,
}: {
  id?: string;
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="mb-8 scroll-mt-24" id={id}>
      <h2 className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
        {children}
      </h2>
      {subtitle ? (
        <p className="mt-2 max-w-2xl text-mist">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-none space-y-4 text-[15px] leading-relaxed text-slate-300 [&_a]:text-glow [&_a]:underline-offset-2 hover:[&_a]:underline [&_strong]:font-semibold [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_li]:marker:text-glow/60">
      {children}
    </div>
  );
}
