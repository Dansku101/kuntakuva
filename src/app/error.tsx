"use client";

import { CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import { useTransition } from "react";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <main id="main-content" className="shell error-page">
      <CircleAlert size={36} className="error-icon" aria-hidden="true" />
      <p className="eyebrow">TIETOJA EI VOITU HAKEA</p>
      <h1>Yhteys tilastotietoihin katkesi</h1>
      <p>Tilastokeskuksen tiedot eivät juuri nyt latautuneet. Yritä hetken kuluttua uudelleen.</p>
      <button className="button button-primary" type="button" disabled={pending}
        onClick={() => startTransition(() => retry())}>
        {pending ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />}
        {pending ? "Haetaan" : "Yritä uudelleen"}
      </button>
      <span className="sr-only" role="status">{pending ? "Haetaan tietoja uudelleen." : ""}</span>
    </main>
  );
}
