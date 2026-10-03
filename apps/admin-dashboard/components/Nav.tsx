import Link from 'next/link';

export function Nav() {
  return (
    <nav className="nav">
      <strong>Eliminacode</strong>
      <Link href="/">Panoramica</Link>
      <Link href="/locations">Sedi</Link>
      <Link href="/departments">Reparti</Link>
      <Link href="/queues">Code</Link>
      <Link href="/feedback">Feedback</Link>
    </nav>
  );
}
