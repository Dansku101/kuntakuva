import { Suspense } from "react";
import { getComparisonSections, loadComparisonSection } from "@/lib/comparison";
import type { Municipality } from "@/lib/statfin";
import ComparisonSection from "./comparison-section";

type Props = { primary: Municipality; peer: Municipality; year: string };
type Section = ReturnType<typeof getComparisonSections>[number];

async function LoadedSection({ section, ...props }: Props & { section: Section }) {
  const group = await loadComparisonSection(section);
  return <ComparisonSection {...props} id={section.id} initialGroup={group} />;
}

export default function MunicipalityComparison(props: Props) {
  const sections = getComparisonSections([props.primary.code, props.peer.code], props.year);
  return <div className="comparison-results">{sections.map((section) =>
    <Suspense key={section.id} fallback={<section className="comparison-section comparison-loading" aria-busy="true">
      <h2>{section.title}</h2><p role="status">Haetaan tietoja…</p>
    </section>}>
      <LoadedSection section={section} {...props} />
    </Suspense>,
  )}</div>;
}
