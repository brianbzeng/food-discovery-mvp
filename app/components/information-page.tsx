import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "./site-footer";

type InformationPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
};

export function InformationPage({
  eyebrow,
  title,
  intro,
  children,
}: InformationPageProps) {
  return (
    <main className="information-shell">
      <header className="information-header">
        <Link className="working-mark" href="/" aria-label="Food discovery home">
          <span className="mark-dot" aria-hidden="true" />
          FOOD / NEARBY
        </Link>
        <Link className="information-header__home" href="/">
          Back to discovery
        </Link>
      </header>
      <article className="information-page">
        <div className="information-page__hero">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        <div className="information-page__content">{children}</div>
      </article>
      <SiteFooter />
    </main>
  );
}
