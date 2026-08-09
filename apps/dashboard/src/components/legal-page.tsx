import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-brand"><span>AO</span>AI Office Manager</Link>
        <Link href="/" className="legal-back">Torna all'app</Link>
      </header>
      <article className="legal-content">
        <p className="eyebrow">Informazioni legali</p>
        <h1>{title}</h1>
        <p className="legal-intro">{intro}</p>
        <p className="legal-updated">Ultimo aggiornamento: 9 agosto 2026</p>
        {children}
      </article>
      <footer className="legal-footer">
        <Link href="/privacy">Privacy</Link>
        <Link href="/termini">Termini</Link>
        <Link href="/cookie">Cookie</Link>
      </footer>
    </main>
  );
}