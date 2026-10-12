# Kuntakuva

Kuntakuva is a web application for exploring Finnish municipalities. A user
searches for a municipality and receives a clear overview of its population,
demographics, and development over time.

## MVP

The first version will:

- let the user search for a Finnish municipality
- retrieve public data from Statistics Finland
- show key demographic statistics
- visualize selected changes over time
- work on desktop and mobile browsers

Municipality news and additional public data sources may be added after the
core statistics experience works reliably.

## Planned technology

- Next.js and TypeScript for the web application
- Statistics Finland APIs as the primary data source
- Git and GitHub for version control and collaboration
- Vercel for building and hosting the application

## Status

The population dashboard is implemented: municipality search, year selection,
population trends, annual changes, CSV export, and responsive loading/error states.
Age structure, language distribution, employment trends and verified 2024–2025
municipal accounts are implemented. Overview, Trends, Map and Statistics are
separate views sharing municipality and year selection. The map uses code-matched
Statistics Finland boundaries and OSM place data. The next priorities are two-
municipality comparison, age-structure trends and saved municipalities; see
[the product and engineering audit](audit-2026-10-12.md).
