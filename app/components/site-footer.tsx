import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__identity">
        <span>FOOD / NEARBY</span>
        <p>Local discovery · MVP</p>
      </div>
      <nav className="site-footer__links" aria-label="Project and legal">
        <Link href="/about">About</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
