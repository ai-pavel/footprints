# 🌍 Footprints

An interactive, single-page visualization of personal travel history built with D3.js. No build tooling, no backend — just a static HTML page served over HTTP.

## Features

- **Interactive world map** with pan/zoom (D3 zoom, scale 1–15) and three switchable projections: Mercator, Natural Earth, and "Flat Earth" (azimuthal).
- **Timeline scrubber** that animates travel history month-by-month with a play/pause button; countries and city dots appear as the timeline advances.
- **Location types** with priority-based coloring per country:
  - 🟣 Residence (highest priority)
  - 🔵 Trip / Visit
  - 🟠 Layover (lowest priority, dashed outline)
  - UK subdivided into England/Scotland/Wales/Northern Ireland on the data side but aggregated under Great Britain on the map.
- **Aviation layer** (toggleable) showing plane/helicopter markers per city.
- **Stats overlay**: country count, % of world, travel-year count, continent coverage accordions, cardinal extremes (northernmost/southernmost/easternmost/westernmost), companion breakdown (solo/partner/family), aviation log, and a yearly accordion breakdown.
- **Sidebar** showing visit cards for a clicked country or city dot.
- **Light/dark theme** via `data-theme` attribute, defaults to OS preference.

## Project structure

```
index.html        # markup + inline event handlers; links styles and scripts
src/
  styles.css      # all CSS (themes, map, panels, sidebar, stats overlay)
  app.js          # all JS: map rendering, timeline, stats, sidebar, theme
data/
  data.json       # travel entries, flight data, aviation icon map
```

## Data format

`data/data.json` contains three top-level keys:

- `travels` — array of trip/residence/layover entries. Each entry has `country_code`, `country_name`, `city`, `continent`, `coordinates` (`[lon, lat]`), `type`, `companion`, and a `visits` array of `{ date, end_date?, approximate? }`. Special flags: `exclude_from_stats` (e.g. birthplace) and `custom_date_label` (e.g. "1994 - 1999").
- `flightData` — aviation entries keyed by city with plane/helicopter modes and dates.
- `aviationIcons` — emoji map for `plane` and `heli`.

## Running locally

A local web server is required because `app.js` fetches `data/data.json` via `d3.json`, which is blocked under `file://`.

```bash
make serve
```

This starts Python's built-in HTTP server on http://localhost:8000. Open that URL in your browser.

## Deployment

The site is deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main` (or manually via **Actions → Deploy to GitHub Pages → Run workflow**). Only `index.html`, `src/` and `data/` are published.

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

Once deployed, the map is available at https://ai-pavel.github.io/footprints/.

## Dependencies

- [D3.js v7](https://d3js.org/) — loaded from CDN in `index.html`.
- World GeoJSON — fetched at runtime from `raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson`. Requires internet access on first load.