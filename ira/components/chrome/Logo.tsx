import Link from "next/link";
import { brand } from "@/lib/brand";

/** The Toyota emblem, three overlapping ellipses. */
function ToyotaEmblem({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size * 18 / 26} viewBox="0 0 26 18" fill="none" stroke="#fff" strokeWidth="1.8" aria-hidden>
      <ellipse cx="13" cy="9" rx="11.5" ry="7.6" />
      <ellipse cx="13" cy="6.2" rx="5.6" ry="2.6" />
      <ellipse cx="13" cy="10.4" rx="2.3" ry="5.5" />
    </svg>
  );
}

/** Red square tile with the Toyota emblem, then the wordmark (toyota.com layout). */
function IraLogo() {
  return (
    <>
      <span className="grid place-items-center w-8 h-8 shrink-0" style={{ background: "var(--brand)" }} aria-hidden>
        <ToyotaEmblem size={22} />
      </span>
      <span className="text-[22px] font-bold tracking-[0.04em] leading-none">{brand.product}</span>
    </>
  );
}

/** TFS lockup. Only rendered when NEXT_PUBLIC_BRAND=tfs (needs TFS sign-off). */
function TfsLogo() {
  return (
    <>
      <span className="grid place-items-center w-9 h-9 shrink-0" style={{ background: "var(--brand)" }} aria-hidden>
        <ToyotaEmblem />
      </span>
      <span className="leading-none">
        <span className="block text-[19px] font-bold tracking-[0.03em]">TOYOTA</span>
        <span className="block text-[11.5px] font-semibold mt-0.5">Financial Services</span>
      </span>
      <span className="hidden sm:inline pl-3 ml-1 text-[15px] font-semibold" style={{ borderLeft: "1px solid var(--line)", color: "var(--ink2)" }}>{brand.product}</span>
    </>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 no-underline shrink-0" style={{ color: "var(--ink)" }} aria-label={brand.owner ? `${brand.product} by ${brand.owner}, home` : `${brand.product}, home`}>
      {brand.logo === "tfs" ? <TfsLogo /> : <IraLogo />}
    </Link>
  );
}
