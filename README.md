# Marchlands

A persistent turn-based frontier strategy game built for mobile portrait screens. It runs in the browser, installs to a phone's Home Screen, and plays offline with automatic IndexedDB saves.

- **Play (live):** https://jtschick7-cyber.github.io/marchlands/

On iPhone, install the app to your Home Screen (**Share → Add to Home Screen**) before starting a campaign; the installed app keeps its own storage, apart from Safari. You can also export or import your campaign JSON anytime from **Menu → Export / Import Save JSON**.

## For whoever builds it

Start with [`AGENTS.md`](AGENTS.md). The full specification lives in [`docs/`](docs/): the game design (`GDD.md`), combat & economy balance (`BALANCE_MODEL.md`), content catalog (`CONTENT_CATALOG.md`), edge-case rulings (`EDGE_CASE_RULINGS.md`), design tokens (`DESIGN_TOKENS.md`), UX microcopy (`UX_MICROCOPY.md`), AI architecture (`AI_ARCHITECTURE.md`), and simulation gates (`SIMULATION_HARNESS.md`).

```bash
npm ci
npm run dev       # local dev server
npm run lint      # ESLint check
npx vitest run    # headless engine, storage & CI simulation tests
npm run build     # production PWA build (base: /marchlands/)
```

Node 22 recommended.
