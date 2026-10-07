# Kuntakuva

Kuntakuva is a web application for exploring Finnish municipalities. Users
can search for a municipality and explore its population and development
over time using Statistics Finland's public data.

## Project status

The population dashboard includes municipality search, available-year selection,
population trends, a 5/10/20-observation chart, an accessible data table,
and CSV export. The responsive interface includes loading and retry states.
The municipality overview includes age structure, languages, density and average
age. The interface focuses on one municipality; old `vertaa` URL parameters are
ignored. A compact direction profile covers population, unemployment and financial
coverage. A Treasury actual-accounts section shows operating spending, investments
and annual surplus/deficit, with expandable expenses and revenue sources.
No budget plans or forecasts are displayed as actual data.

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

The initial product scope and technical direction are recorded in
[`docs/project-brief.md`](docs/project-brief.md).
