# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/framicks/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/framicks/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A dip-buying trading bot for cbBTC (CBBTC/USDC, Orca Whirlpool) that races live for 24 hours on make.fun. Long only, one position, full size: it waits for the close to stretch below the lower Bollinger band of the last 45 one-minute closes while also sitting below the 240-bar mean — a dip that is genuinely low in the day's range — and only buys when the 240-bar mean is not falling, so it buys dips in a healthy market instead of catching a falling knife. It exits at +100 bps take profit, −200 bps stop loss, or after 720 bars (12h) if the snap-back never comes.

Dev-gate result on the frozen 24h window (grade-local, reproduced byte for byte on regrade): **net PnL +$18.58 USDC** on $1,000 start, 4 trades, 100% win rate, max drawdown 1.58%, fees $1.61. The same rules were checked on two other frozen 24h windows (+$11.46 and −$2.51), and the whole parameter neighbourhood stays positive, so the result is a broad plateau rather than a single tuned point. At 2x fees the dev net PnL is still +$16.96.

## Run

The bot speaks the `agent-fun/bars-replay/v1` line protocol (NDJSON on stdin/stdout) via the vendored shim in `vendor/makefun-bars.ts`. It needs Node 22+ and no dependencies:

```sh
node main.ts
```

It reads one JSON line per minute (the bar that just closed, plus fills and account state) and answers each batch with exactly one reply line carrying its orders. It is fully deterministic: no clock, no randomness, no network, no files — the same bars always produce the same orders.

## Files

- `main.ts` — the strategy.
- `vendor/makefun-bars.ts` — the protocol shim from the competition kit.
- `LICENSE` — MIT.
- `.makefun/owner.json` — payout wallet for the entry.

<sub>Entered on [make.fun](https://make.fun/?ref=erdians&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
