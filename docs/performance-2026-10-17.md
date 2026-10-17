# Reliability follow-up: 17 October 2026

This follows the completed fixes in [the 13 October audit](audit-2026-10-13.md).
It changes loading behavior and coverage communication, without adding datasets.

**Final scope:** after the reliability work below, the user chose to remove the
separate OSM names and places altogether. The map now makes one boundary request
and retains the basemap, optional population grid, boundary validation, retry and
cancellation. Overpass queries, place controls/lists/popups, the process-local
place cache and its tests were removed. The timeout/cooldown work described below
records the intermediate implementation, not the current map behavior.

Final validation: 61 tests pass, lint passes and the production build passes.
Retired place/cache tests were removed; boundary validation, source outages and
cancellation remain covered. The API regression also verifies that only the
boundary source is requested and no place data or detail-loading state is returned.

## Investigation

Read-only probes of the existing loaders reproduced the Vantaa 2025 Statistics
delay in StatFin's civil-status table, 11rz: the observation POST took 10.93 s
and the complete loader took 11.16 s. Education took 2.94 s, finance 1.72 s,
heating 0.62 s, climate 0.51 s and demographics 0.56 s. These are individual
measurements, not latency percentiles or proof of the exact earlier logged request.

The live 11rz metadata exposes individual ages, 100+, and an all-ages total;
there is no 18+ aggregate category. The existing sum of 83 adult age categories
is retained. Using all ages would change the denominator. Requests still use
Next's persistent fetch cache with daily revalidation, including observation POSTs.

Live boundary requests succeeded in 63–94 ms. The primary Overpass provider
returned HTTP 500 for both Kauniainen and Helsinki. The fallback returned 502
for Kauniainen and timed out after 30 s for Helsinki. This demonstrates an
upstream place-source failure, independently of the working boundary source.

## Changes

- Map places: at most 8 s per provider within a shared 16 s deadline, including
  response download; the Overpass execution timeout is 7 s. Boundary loading
  retains its separate 15 s limit and 14-day persistent fetch cache.
- Successful Overpass results remain process-local for one hour, timed from
  completion. Concurrent viewers share work. Failure results have a one-minute
  cooldown; HTTP partial-data responses remain uncached and explicitly mark
  details unavailable. There is no stale-success fallback after cache expiry.
- Incoming map cancellation reaches boundary requests. Shared place work stops
  when its final viewer leaves; one departing viewer cannot cancel another's
  request. Cancelled work is removed immediately and does not create a cooldown.
  A cancelled handler returns 499 without reporting a source outage.
- Place-provider failures/fallbacks and slow or failed resident fetches log
  source/provider, duration, status and municipality context. Timings include
  body download and JSON decoding. Query bodies and returned data are not logged.
- Education and civil status have independent Suspense/loading/failure states.
- The boundary stays visible while retrying failed places.
- Trends no longer has an empty heating panel. The heating distribution remains
  in Statistics. Overview's education card is labelled Koulutus.
- Observation years, source update dates, the selected cutoff, current OSM
  coverage and fixed 2026 map geography are more explicit.

## Verification

- 67 tests pass; lint, TypeScript and production build pass.
- New controlled cases cover shared-viewer cancellation, abort without fallback,
  the overall deadline, partial boundary responses, and education resolving
  while civil status is pending. Existing map tests now cover failure cooldown
  and recovery after it expires, as well as successful cache reuse.
- Local production HTTP streaming: Vantaa Statistics sent headers at 111 ms,
  education at 3.15 s, and civil status at 12.75 s. The next complete request
  took 59 ms. The slow POST was logged as residents-marital (11.73 s).
- Local production Trends returned 200 without the heating placeholder;
  Statistics still included the heating section.
- Local production Helsinki map: boundary-only response 119 ms; failed details
  response 320 ms, HTTP 200, with boundary and unavailable details; repeat
  details request 4 ms during cooldown. Both partial responses were no-store.
- No new visual browser inspection or public deployment was performed. The
  existing parent-directory lockfile warning remains during build/start.

## Remaining limits

Overpass remains optional and can be unavailable. The shorter deadline may
reject a query that would eventually succeed; the boundary and honest missing-data
message remain usable. The place cache and cooldown are per process, not shared
across server instances, and restarting clears them.

Cancellation depends on the runtime forwarding disconnects into request.signal.
Controlled handler tests verify the application behavior once that signal aborts;
they do not establish disconnect propagation on every deployment platform.
Resident Server Component fetches still have their own source timeouts; this
change does not claim general cancellation of all statistics work on navigation.

The underlying cold civil-status query is still slow. Independent rendering and
verified cache reuse improve the experience without altering the adult population
definition. Any further query optimization needs an equivalent, reconciled source
or aggregation mechanism.
