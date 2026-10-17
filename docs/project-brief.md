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

The dashboard includes municipality search, year selection, population trends,
annual changes, CSV export, demographics, education, employment, heating,
climate data and verified 2024–2025 accounts. Overview, Trends, Comparison, Map
and Statistics share municipality and year selection.

The map deliberately stays simple: a code-matched Statistics Finland boundary,
an OpenStreetMap basemap and an optional population grid. Separate OSM names,
place markers and place lists have been removed, along with live Overpass queries.
This is a small passion project; dependable existing views take priority over
expanding its scope. See [the reliability follow-up](performance-2026-10-17.md).
