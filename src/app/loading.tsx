export default function Loading() {
  return (
    <main id="main-content" className="loading-page" aria-busy="true" aria-label="Haetaan kunnan tietoja">
      <p className="sr-only" role="status">Haetaan kunnan tietoja.</p>
      <div className="control-band"><div className="shell skeleton-controls" aria-hidden="true">
        <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
      </div></div>
      <div className="shell dashboard" aria-hidden="true">
        <div className="skeleton skeleton-title" /><div className="skeleton skeleton-subtitle" />
        <div className="metrics">{[1, 2, 3].map((item) => <div className="metric" key={item}>
          <div className="skeleton skeleton-label" /><div className="skeleton skeleton-value" /><div className="skeleton skeleton-label" />
        </div>)}</div>
        <div className="skeleton skeleton-chart" />
      </div>
    </main>
  );
}
