import Link from "next/link";
import { Header } from "@/components/chrome/Header";
import { PageBand } from "@/components/chrome/PageBand";

export default function NotFound() {
  return (
    <>
      <Header />
      <PageBand title="We couldn't find that page">The link may be mistyped, or the page has moved.</PageBand>
      <main className="mx-auto w-full max-w-[1248px] px-4 sm:px-8 py-10 flex-1">
        <Link href="/" className="btn btn-primary">Back to the start</Link>
      </main>
    </>
  );
}
