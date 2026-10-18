# Vendored: cutcard engine

Source: https://github.com/noahskahn/cutcard (commit `cee4101`), MIT licensed — see `LICENSE`.

Copied unmodified:

- `core/` — action codes, Hi-Lo tags, rule schema and defaults, rules-text parser
- `strategy/` — exact EV engine, generated basic strategy, Hi-Lo deviations, house edge
- `trainer/advisor.js` — correct-play oracle and EV cost of mistakes

CasinoGhost code calls these through `src/engine/strategy.ts`; keep local changes out of this
folder so it can be re-synced from upstream.
