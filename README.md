# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jiangmuquan888/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jiangmuquan888/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for [make.fun](https://make.fun)'s "Build the best token launch radar" bounty
([token-radar-01](https://make.fun/bounty/token-radar-01)).

The radar ranks pre-token protocols by **implied value**: what each would be worth if it
launched at the price the market already pays its live peers. The model (radar-2, in
`lib/model.ts`) learns a per-category market-cap/TVL multiple from the live-token protocols
inside the snapshot itself — no protocol is priced by hand — then adjusts for 7-day TVL
growth (damped past +60% so a one-week spike cannot buy the top), for years tracked with no
token (maturity), and for multi-chain reach. Protocols that already trade are never ranked;
they sit in the dashboard's Live tab as the peers the multiples are learned from.

The board covers the full watchlist plus early finds below the snapshot's $50M floor. Every
row carries the full arithmetic of its valuation and a concrete 7-step farm plan with
per-chain gas estimates, capital amounts and holding windows.

## Run it

```sh
node main.ts --input /input/snapshot.json
# writes board.json, data.js, dashboard/, screenshots/ and dossier.json to the output dir
# (MAKEFUN_OUTPUT_DIR, default ./out)
```

Open `dashboard/index.html` in the output to browse the board: search, category / chain /
segment filters, five sort orders, a per-protocol detail view with the valuation breakdown
and farm plan, and the Live peers tab.
