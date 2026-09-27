# Kuntakuva

Kuntakuva is a web application for exploring Finnish municipalities. Users
will be able to search for a municipality and view a clear overview of its
population, demographics, and development over time.

## Project status

The initial Next.js foundation is complete and verified. Municipality search,
Statistics Finland API integration, and data visualizations are not yet
implemented.

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

Create a production build:

```powershell
npm.cmd run build
```

## Documentation

The initial product scope and technical direction are recorded in
[`docs/project-brief.md`](docs/project-brief.md).
