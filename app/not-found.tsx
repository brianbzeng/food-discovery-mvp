import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "./components/site-footer";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="not-found-shell">
      <section className="not-found-card">
        <p className="eyebrow">404 · OFF THE MENU</p>
        <span className="not-found-card__number" aria-hidden="true">
          404
        </span>
        <h1>We could not find that page.</h1>
        <p>
          The link may be old, or this part of the neighborhood is not ready
          yet.
        </p>
        <div className="not-found-card__actions">
          <Link href="/">Return to discovery</Link>
          <Link href="/about">About this MVP</Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
