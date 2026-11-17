# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jxqlovejava/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jxqlovejava/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It reads the sealed DefiLlama snapshot, fits a market-cap-to-TVL multiple for every category from the protocols whose token already trades (shrunk toward the global median by sample size), and ranks every protocol that records no token yet by its implied value: TVL × category multiple × a 7-day growth factor × a maturity factor for time running tokenless. The board covers the whole $50M watchlist plus every other rankable pre-token protocol in the snapshot, gives each one a concrete farm plan with costs and durations, and renders it as a static, offline dashboard with sortable and filterable rows, a per-protocol detail view showing the model's own arithmetic, and the already-trading protocols kept apart as the model's evidence.

## Run it

```sh
node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=9bctwgz1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
