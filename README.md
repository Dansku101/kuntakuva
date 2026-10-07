# Kuntakuva

Kuntakuva is a web application for exploring Finnish municipalities. Users
can search for a municipality and explore its population and development
over time using Statistics Finland's public data.

## Project status

The population dashboard includes municipality search, available-year selection,
annual and period changes, a 5/10/20-observation chart, an accessible data table,
and CSV export. The responsive interface includes loading and retry states.
Age structure and additional demographic indicators are the next data features.

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

## Documentation

The initial product scope and technical direction are recorded in
[`docs/project-brief.md`](docs/project-brief.md).
