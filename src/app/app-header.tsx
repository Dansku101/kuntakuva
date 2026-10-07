import { ChartNoAxesCombined, Database } from "lucide-react";
import Link from "next/link";

export default function AppHeader() {
  return (
    <header className="app-header">
      <div className="shell header-inner">
        <Link href="/" className="brand" aria-label="Kuntakuva, etusivu">
          <span className="brand-mark"><ChartNoAxesCombined size={23} aria-hidden="true" /></span>
          <span>Kuntakuva</span>
        </Link>
        <span className="header-label">Suomen kunnat lukuina</span>
        <a href="https://stat.fi/tilasto/vaerak"
          target="_blank" rel="noreferrer" className="source-link">
          <Database size={16} aria-hidden="true" /><span>Tilastokeskus</span>
          <span className="sr-only"> (avautuu uuteen välilehteen)</span>
        </a>
      </div>
    </header>
  );
}
