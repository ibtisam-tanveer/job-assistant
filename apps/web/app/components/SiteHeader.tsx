import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="ja-header">
      <Link href="/" className="ja-brand">
        <span className="ja-brand-mark" aria-hidden>
          JA
        </span>
        Job Assistant
      </Link>
      <nav className="ja-nav" aria-label="Main">
        <Link href="/">Inbox</Link>
      </nav>
    </header>
  );
}
