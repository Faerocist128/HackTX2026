/** Gray title strip at the top of each step page (toyota.com deals-page header). */
export function PageBand({ eyebrow, title, width = "max-w-[1248px]", children }: { eyebrow?: string; title: string; width?: string; children?: React.ReactNode }) {
  return (
    <div className="page-band">
      <div className={`mx-auto w-full ${width} px-4 sm:px-8 py-8 sm:py-10`}>
        {eyebrow && <p className="eyebrow" style={{ color: "var(--ink2)" }}>{eyebrow}</p>}
        <h1 className="h-page mt-1">{title}</h1>
        {children && <div className="mt-2 text-[17px] max-w-[680px]" style={{ color: "var(--ink2)" }}>{children}</div>}
      </div>
    </div>
  );
}
