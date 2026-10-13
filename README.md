# Kuntakuva

Kuntakuva is a web application for exploring Finnish municipalities. Users
can search for a municipality and explore its population and development
over time using Statistics Finland's public data.

## Project status

The dashboard has five separate URL-backed views: Overview (`yleiskuva`),
Trends (`trendit`), Comparison (`vertailu`), Map (`kartta`) and Statistics (`tilastot`).
Municipality and year selection preserve the active view and comparison peer.
Overview holds headline indicators and three short topic summaries;
Trends holds time series; Statistics holds all detailed distributions and accounts.
The map uses Statistics Finland's code-matched 2026 municipal boundaries and
OSM places. See [the October 2026 audit](docs/audit-2026-10-12.md) for findings,
source verification, testing, product decisions and remaining limitations.

The population dashboard includes municipality search, available-year selection,
population trends, a 5/10/20-observation chart, an accessible data table,
and CSV export. The responsive interface includes loading and retry states.
Statistics includes age structure, languages, density and average age.
A compact direction profile covers population, unemployment and financial
coverage. A Treasury actual-accounts section shows operating spending, investments
and annual surplus/deficit, with expandable expenses and revenue sources.
No budget plans or forecasts are displayed as actual data.

Overview and Statistics also include registered building heating sources.
Statistics displays building counts and shares for every source category;
Overview shows only the leading heating group and links to Statistics.
Energy sections appear in this order: heating, local wind generation, then energy
consumption and emissions. Sector tables remain in Statistics.

### Municipality Comparison And Trends

Comparison has a separate typo-tolerant peer search and shareable `vertaa=KUxxx`
parameter. Duplicate or invalid peers are ignored; swap and remove controls are
available. Each metric uses the latest common observation year at or before the
selection. Categories include demographics, education, actual finances, heating,
energy and emissions. Finance uses same-year population denominators; climate
figures remain explicitly labelled totals. Missing data never becomes zero and a
failed source does not suppress other sections. Regional-boundary caveats remain
visible, especially for per-resident finance figures and municipality mergers.

Trends adds ten published education observations via one batched JSON-stat query,
resolving returned year and category indexes separately. Energy and emissions use
up to twenty final Syke observations; preliminary years are excluded. Charts and
tables use explicit units, and lines break at missing observations or skipped
years. Heating has no trend line: the current table only covers 2025 and archival
tables have different coverage. No synthetic history is created.

## MVP

The first version will:

- let users search for a Finnish municipality
- retrieve public data from Statistics Finland
- show key demographic statistics
- visualize selected changes over time
- work on desktop and mobile browsers

Municipality news and additional public data sources may be added after the
core statistics experience works reliably.

## Technology

- Next.js
- React
- TypeScript
- Tailwind CSS
- Statistics Finland public APIs
- GitHub
- Vercel

## Local development

Install the project dependencies:

```powershell
npm.cmd install
```

Start the development server:

```powershell
npm.cmd run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Check the code with ESLint:

```powershell
npm.cmd run lint
```

Run the data and CSV tests (no network requests):

```powershell
npm.cmd test
```

Create a production build:

```powershell
npm.cmd run build
```

## Data behavior

The municipality and year are stored in URL parameters (`kunta` and `vuosi`).
Missing or invalid parameters fall back to Helsinki and the latest available
year. Available municipalities and years come from table 11ra metadata.

The server caches successful API responses for one day and limits each request
to 15 seconds. Population values are paired with their returned JSON-stat year
indexes. Missing values remain missing; a zero baseline has no percentage change.

The historical series follows the regional classification reported by the table,
currently 1 January 2026. It is not a series of historical municipal boundaries.
CSV exports contain the currently displayed observations, using UTF-8 with a BOM
and semicolon separators for Finnish spreadsheet settings.

Fonts use a system stack, so builds do not require a Google Fonts download.

## Actual Accounts And Trends

The overview has three signals: five-year population change, year-end
unemployment among the 18-64-year-old workforce, and annual margin as a percentage
of depreciation plus impairments. These are separate indicators, not an official
health classification or weighted overall score. Financial coverage >=100%
means annual margin covers depreciation and impairments, not all investment
spending or debt repayments. One-off items may affect the result.

Employment uses Statistics Finland table 115b and its 2025 regional classification.
The parser indexes every returned JSON-stat dimension rather than depending on
query order. It requests workforce (11+12) and unemployed (12), total sexes,
ages 18-64. The newest published year at or before the selection is shown with its
own explicit year, currently 2024. This is year-end register data, not a monthly
series or an annual average. Annual changes require consecutive years.

The official environment-directory API resolves municipality codes to business
IDs. The [Treasury API](https://prodkuntarest.westeurope.cloudapp.azure.com/)
catalogue selects the latest final or corrected KKNR C12 year-end report.
KTAS budgets, KKTPA forecasts, quarterly periods and KKOTR consolidated group
accounts are never substituted for actual municipal accounts.
Financial API requests time out after 20 seconds; other responses are cached for
one day. The oversized catalogue bypasses Next's fetch cache; only year-end KKNR
entries remain in process memory for one hour. Failed catalogue requests can retry.

Verified financial coverage is deliberately limited to **2024 and 2025**:
- 2024: taxonomy `jhs-2018-01/2023-04-02`.
- 2025: taxonomy `jhs-2018-01/2024-03-26`.

Unsupported years display unavailable data, not guessed field mappings.
Income statement fields come from k-t07; gross investments (1374) from k-t13.
Annual result (159456) is before transfers; surplus/deficit (1447) after transfers.
Annual margin (1400) and depreciation/impairments (1470) determine coverage.
Amounts are euros. Signs are preserved, absent values remain null, and duplicate
facts or incompatible reporting scopes fail closed. Expense shares require all
five nonnegative categories to reconcile to operating expenses within EUR 0.05.

Income-statement income totals operating revenue, taxes, state transfers,
interest income (973), other financial income (925) and extraordinary income
(1117). Expense totals include operating expenses, interest expenses (556),
other financial expenses (574), depreciation/impairments and extraordinary
expenses (1101). Capitalized own work (1599) is an accounting adjustment, not
external income. Both totals are shown only when income minus expenses plus
capitalized own work reconciles to the reported annual result within EUR 0.05.
Investments, borrowing and loan repayments are outside these totals.
The additional field IDs were checked in the official KKNR k-t07 x01 column
of the [2023-06-21 and 2024-06-13 reporting templates](https://www.avoindata.fi/data/fi/dataset/sbr-taksonomia).
Live 2024/2025 totals were reconciled for Mustasaari, Kauniainen and Espoo.

### Published Accounts Reconciliation

The field mappings were checked against both municipalities' published 2025
statements and their 2024 comparison columns:

- [Espoo 2025 accounts](https://admin.espoo.fi/sites/default/files/2026-05/Tilinp%C3%A4%C3%A4t%C3%B6s%202025.pdf):
  actual operating expenses EUR 1,417,999,125.41; annual result
  EUR 110,818,200.18; surplus after transfers EUR 126,585,792.48; gross investments
  EUR 341,774,185.14; annual margin EUR 315,934,392.27; depreciation and impairments
  EUR 205,116,192.09.
- [Kauniainen 2025 accounts](https://www.kauniainen.fi/wp-content/uploads/2026/06/tilinpaatoskirja-2025.pdf):
  actual operating expenses EUR 53,367,958.79; annual result and surplus
  EUR 909,641.21; gross investments EUR 14,322,882.56; annual margin
  EUR 10,658,434.20; depreciation and impairments EUR 9,748,792.99.
  Its actual 2024 deficit was EUR 127,292.31.

Regression tests pin these values and reconcile expense components. Municipal
group figures must not be mixed with municipality-only accounts.
Per-resident operating expenses use Statistics Finland's final selected-year
population, which can differ from a statement's preliminary population.
A deficit is an accounting balance, **not a budget overrun**. Service-level
spending, actual loan stock and budget overruns are not shown until independently
verified. Detailed expenses, income, report status and interpretation are
expandable to keep the main overview compact.

## Documentation

### Building Heating Sources

Heating uses [Statistics Finland table 15er](https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/raku/15er.px/),
currently covering 2025 with the 2026 regional classification. Requests select
all building types and construction years, the chosen municipality, and building
counts (`rakennus_lkm`). The latest observation at or before the selected year is
used; earlier selections show unavailable data, never a future observation.
Returned dimension indexes and category totals are validated. Unknown heating
sources remain a separate category and missing observations stay null.

These are shares of registered buildings, not energy consumption, floor area,
dwellings or only municipality-owned buildings. Holiday residences are included;
the source excludes categories such as agricultural, sauna and outbuildings.
Changes of heating source may not reach the register. Oil/gas and wood/peat are
combined in the source and are not split or relabelled as renewable energy.

### Electricity Production, Energy Use And Emissions

[Syke's public emissions service](https://paastot.hiilineutraalisuomi.fi/)
publishes municipality-code-specific CSV files under
`Tulokset_taso_5/kunta_<numeric code>.csv`. The server caches them for one day
and uses the latest final year at or before the selection, currently 2024.
`E`-prefixed preliminary years are excluded. CSV parsing uses `csv-parse` with
validated headers, categories and unique observation keys. Missing observations
remain null; signed source corrections are preserved.

The production section currently covers **wind only** (`Tuu.GWh`). Solar, hydro,
nuclear and other production are not inferred from regional or national figures.
The wind-production row is excluded from consumption totals. Energy and emissions
use the Hinku subset (`hinku_laskenta=1`) and uncredited `kt`, never `kt_tuuli`.
Units are GWh and kilotonnes CO2-equivalent. Missing sectors suppress totals
rather than silently contributing zero.

The [Hinku scope](https://hiilineutraalisuomi.syke.fi/paastotieto/paastotiedot-ja-indikaattorit/kuntien-kayttoperaiset-paastot-ja-ilmastoindikaattorit/)
excludes industrial electricity, ETS industrial fuels, industrial waste treatment,
and pass-through truck, van and bus traffic. Land-use emissions and sinks are
outside this calculation. These are not a municipality's complete carbon footprint
or an estimate of its electricity self-sufficiency.

Verified Mustasaari 2024 source totals: wind 157.223 GWh, Hinku energy consumption
560.799 GWh, and uncredited Hinku emissions 103.831 kt CO2-equivalent. Live parsing
was also checked for Kauniainen and Helsinki.

The initial product scope and technical direction are recorded in
[`docs/project-brief.md`](docs/project-brief.md).
