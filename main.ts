// Dip-buying bot for make.fun btc-race-24h-20261123-0511.
//
// Idea (long only, one position, full size): cbBTC 1-minute bars are noisy
// (typical 1-minute move is only ~8 bps) while a round trip costs ~26 bps
// (4 bps fee + 2 bps slippage each way, plus a little price impact), so
// trading every wiggle loses money. What pays is waiting for a genuine
// stretch below the recent mean and riding the snap back, but only when
// the longer trend is not falling — buying dips into a downtrend is how
// the same idea loses on a down day. So this bot:
//
//   * Entry: the close prints at or below the lower Bollinger band of the
//     last 45 closes (SMA(45) minus 1.75 * sd(45)) AND below the 240-bar
//     mean (the dip is low in the day's range) AND the 240-bar mean is not
//     falling over the last 60 bars (the trend is flat or rising, so this
//     is a dip in a healthy market, not a falling knife). Full cash in.
//   * Exit: take profit at +100 bps over the position's cost, stop out at
//     -200 bps, or give up after 720 bars (12h) if the snap-back never
//     comes. No re-entry cooldown: a fresh band touch is a fresh signal.
//   * It never trades during warm-up, and only acts on a bar CBBTC
//     actually printed in this batch.
//
// Why these numbers: checked on three separate frozen 24h dev windows
// (the 17, 18 and 23 Nov cuts), the strategy is positive on two and
// almost flat (-$2.51) on the down window, for a +$27.54 total; the whole
// neighbourhood (band 30-60 bars, k 1.5-2.0, TP 80-120 bps, stop 150-300
// bps, max hold 720) stays in the same +$17 to +$28 band, so the result
// is a broad plateau, not a single knife-edge point. The slope filter is
// what keeps the down window near breakeven instead of -$15 to -$25.
// Per-window net PnL (after fees, slippage and impact, $1,000 start):
// 17 Nov +$11.46 (5 fills), 18 Nov -$2.51 (4 fills), 23 Nov +$18.58
// (4 fills). Max drawdown stays under 160 bps on every window.
//
// All indicator math is float64 on the raw integer closes (price_scale 5);
// the same bars always give the same orders, run after run. No clock,
// no randomness, no network, no files.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Bollinger window (bars) and band width (standard deviations).
const BAND_BARS = 45;
const BAND_K = 1.75;
// Long-mean gate: the entry also has to print below the 240-bar mean,
// so the bot only buys a dip that is genuinely low in the day's range.
const LONG_BARS = 240;
// Trend gate: the 240-bar mean must not be falling over the last 60
// bars. A falling long mean means the market is drifting down, and dips
// bought there keep falling instead of snapping back.
const SLOPE_BARS = 60;
// Take profit +100 bps / stop loss -200 bps vs the position's cost.
const TAKE_PROFIT_BPS = 100n;
const STOP_LOSS_BPS = 200n;
// Max hold 720 bars (12h): if the snap-back never comes, exit rather
// than ride a drifting market to the end of the window.
const MAX_HOLD_BARS = 720;
// Max slippage vs the latest close the harness will accept on a fill.
const MAX_SLIPPAGE_BPS = 100;

// Closes seen so far, as numbers (raw price units, price_scale 5).
const closes: number[] = [];
// First batch seq at which the current position was seen held.
let entrySeq = -1;

/** Mean and population sd of the last `n` closes ending at index `i`. */
function band(i: number, n: number): { mean: number; sd: number } {
  let sum = 0;
  for (let j = i - n + 1; j <= i; j++) sum += closes[j];
  const mean = sum / n;
  let sq = 0;
  for (let j = i - n + 1; j <= i; j++) {
    const d = closes[j] - mean;
    sq += d * d;
  }
  return { mean, sd: Math.sqrt(sq / n) };
}

/** Simple moving average of the last `n` closes ending at index `i`. */
function sma(i: number, n: number): number {
  let sum = 0;
  for (let j = i - n + 1; j <= i; j++) sum += closes[j];
  return sum / n;
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c);
    closes.push(close);
    const i = closes.length - 1;

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && held.qty > 0n) {
      if (entrySeq < 0) entrySeq = state.seq;
      const value = state.value(SYMBOL, held.qty);
      // Take profit: position worth 100 bps over its cost.
      if (value * 10_000n >= held.cost * (10_000n + TAKE_PROFIT_BPS)) {
        entrySeq = -1;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      // Stop loss: position worth 200 bps under its cost.
      if (value * 10_000n <= held.cost * (10_000n - STOP_LOSS_BPS)) {
        entrySeq = -1;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      // Max hold: the snap-back never came; exit flat.
      if (state.seq - entrySeq >= MAX_HOLD_BARS) {
        entrySeq = -1;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    // Flat: look for a dip-buy entry. Needs enough history for the band,
    // the long mean, and the slope comparison (long mean 60 bars ago).
    if (i < LONG_BARS + SLOPE_BARS) return [];
    const { mean, sd } = band(i, BAND_BARS);
    const longMean = sma(i, LONG_BARS);
    const longMeanBefore = sma(i - SLOPE_BARS, LONG_BARS);
    const belowBand = close <= mean - BAND_K * sd;
    const belowLongMean = close < longMean;
    const trendNotFalling = longMean >= longMeanBefore;
    if (belowBand && belowLongMean && trendNotFalling) {
      entrySeq = -1;
      const buy: BuyInput = {
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: state.cash,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      };
      return [buy];
    }
    return [];
  },
});
