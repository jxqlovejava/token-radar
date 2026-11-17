// Token Launch Radar: the valuation model.
//
// One sealed DefiLlama snapshot in, one ranked board out. The board ranks every protocol that
// records no token yet: the snapshot's whole watchlist (the floor, never the ceiling) plus every
// other rankable pre-token protocol the snapshot carries, down to its $5M TVL cutoff. Wrapped,
// staked and bridged products of tokens that already trade, and exchanges, are left out at every
// size (see isProductOfAnother): they are not launches waiting to happen. Protocols whose token
// already trades are never ranked; the dashboard shows them apart, at the market's own values,
// because they are the evidence the model is fitted on.
//
// The model is fitted from the snapshot itself, at run time, from the protocols whose token
// already trades (market cap and TVL both recorded):
//
//   multiple(category) = (n * median(mcap / TVL in category) + K * globalMedian) / (n + K)
//                        with K = SHRINKAGE_K, clamped to [MULTIPLE_FLOOR, MULTIPLE_CAP]
//
// A category with few traded members borrows most of its multiple from the global median; a
// category with many stands on its own. No protocol name is ever special-cased: the same fitted
// function scores every row, and the fit itself is written into the dashboard's data so a reader
// can re-derive every number on the page.
//
// One pre-token protocol's implied value:
//
//   implied = TVL x multiple(category) x growthFactor x maturityFactor
//   growthFactor   = 1 + clamp(change_7d, -30, +50) / 100 x 0.6   (a hot week is worth up to x1.30,
//                    a bad one as little as x0.82; an unreported change counts as 0)
//   maturityFactor = 0.75 + 0.5 x min(age_days, 1460) / 1460      (a protocol that has run four
//                    years with no token is worth up to x1.25 of a two-day-old one; an unknown
//                    listing date counts as 365 days)

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it, so a screenshot and the code agree. */
export const MODEL_VERSION = 'catfit-2';

/** How hard a thin category is pulled toward the global median when its multiple is fitted. */
export const SHRINKAGE_K = 4;
/** Fitted multiples are clamped to this band, so one wild category cannot price the whole board. */
export const MULTIPLE_FLOOR = 0.02;
export const MULTIPLE_CAP = 3.0;
/** The growth adjustment's shape: the 7-day change is clamped, then weighted. */
export const GROWTH_FLOOR_PCT = -30;
export const GROWTH_CAP_PCT = 50;
export const GROWTH_WEIGHT = 0.6;
/** The maturity adjustment's shape: a factor rising from MATURITY_BASE over MATURITY_DAYS. */
export const MATURITY_BASE = 0.75;
export const MATURITY_RANGE = 0.5;
export const MATURITY_DAYS = 1460;
export const UNKNOWN_AGE_DAYS = 365;
/** How many already-trading protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 40;

/** One category's fitted multiple, with the evidence behind it. */
export interface CategoryFit {
  category: string;
  /** Traded protocols in the category with both a market cap and a TVL. */
  sample: number;
  /** Their median market-cap-to-TVL ratio, before shrinkage; null when the sample is empty. */
  median_ratio: number | null;
  /** The multiple the model actually uses for the category. */
  multiple: number;
}

/** The fitted model: one global median and one multiple per category. */
export interface FittedModel {
  version: string;
  /** Traded protocols the fit drew on. */
  sample_size: number;
  /** The median mcap/TVL across every traded protocol in the snapshot. */
  global_median: number;
  shrinkage_k: number;
  categories: CategoryFit[];
}

/** One row of board.json: the ranked board's row, with the model's arithmetic kept beside it. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  multiple: number;
  growth_factor: number;
  maturity_factor: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** An already-trading protocol, shown apart at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_to_tvl: number;
  symbol: string | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: FittedModel;
  counts: { protocols: number; watchlist: number; board: number; early: number; live: number; excluded_products: number };
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from the listing date to the snapshot's date; null when either is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * The product categories the house's own watchlist rule keeps out, at every size: a wrapped,
 * staked or bridged product of a token that already trades is not a protocol waiting on a launch
 * of its own (WBTC is Bitcoin on Ethereum, a staked-ETH product is ETH in a wrapper), and an
 * exchange is not a launch candidate either. The first local run ranked WBTC and Coinbase Bridge
 * at the top of the board on raw TVL; these exclusions are the fix, applied with the same tests
 * the watchlist itself uses, so far as the snapshot's ten fields allow them to be applied.
 */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol is a wrapped, staked or bridged product, or an exchange, by its record. */
export function isProductOfAnother(p: SnapshotProtocol): boolean {
  return PRODUCT_CATEGORIES.has(p.category ?? '') || WRAPPED_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name);
}

/** Whether a protocol is one the board may rank: pre-token, not a product of another, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProductOfAnother(p) && !VERSIONED.test(p.name);
}

/**
 * Fit the multiples from the snapshot's traded protocols: the median mcap/TVL of each category,
 * shrunk toward the global median by sample size, then clamped. Deterministic: the same snapshot
 * always fits the same model, so the program's two runs write the same bytes.
 */
export function fitModel(snapshot: Snapshot): FittedModel {
  const traded = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ratios = traded.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.2;
  const byCategory = new Map<string, number[]>();
  for (const p of traded) {
    const key = p.category ?? '';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const categories: CategoryFit[] = [...byCategory.entries()]
    .map(([category, list]) => {
      const med = median(list);
      const shrunk = (list.length * med + SHRINKAGE_K * globalMedian) / (list.length + SHRINKAGE_K);
      return { category, sample: list.length, median_ratio: round4(med), multiple: round4(clamp(shrunk, MULTIPLE_FLOOR, MULTIPLE_CAP)) };
    })
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { version: MODEL_VERSION, sample_size: traded.length, global_median: round4(globalMedian), shrinkage_k: SHRINKAGE_K, categories };
}

/** The fitted multiple for one category; an unseen or unnamed category takes the global median. */
export function multipleFor(model: FittedModel, category: string | null): number {
  if (category === null) return model.global_median;
  const fit = model.categories.find((c) => c.category === category);
  return fit === undefined ? model.global_median : fit.multiple;
}

/** The growth factor from a 7-day TVL change in per cent; an unreported change is neutral. */
export function growthFactor(change7d: number | null): number {
  const pct = clamp(change7d ?? 0, GROWTH_FLOOR_PCT, GROWTH_CAP_PCT);
  return 1 + (pct / 100) * GROWTH_WEIGHT;
}

/** The maturity factor from a protocol's age in days; an unknown age counts as one year. */
export function maturityFactor(age: number | null): number {
  const days = clamp(age ?? UNKNOWN_AGE_DAYS, 0, MATURITY_DAYS);
  return MATURITY_BASE + (days / MATURITY_DAYS) * MATURITY_RANGE;
}

/** One protocol's implied value and the factors that produced it. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  model: FittedModel,
): { implied: number; multiple: number; growth: number; maturity: number; age: number | null } {
  const multiple = multipleFor(model, p.category);
  const age = ageDays(asOf, p.listed_at);
  // The factors are rounded to the four decimals the board publishes before they are multiplied,
  // so a reader who multiplies a row's own printed factors lands on its implied value exactly:
  // the page, the file and the arithmetic cannot drift apart.
  const growth = round4(growthFactor(p.change_7d));
  const maturity = round4(maturityFactor(age));
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity));
  return { implied, multiple, growth, maturity, age };
}

// ---------------------------------------------------------------- farm plans

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 250_000_000) return 250;
  if (p.tvl_usd >= 50_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/** Gas for one transaction on the protocol's first chain: Ethereum mainnet costs real money, the rest little. */
function gasFor(chain: string): { one: string; week: string } {
  if (chain === 'Ethereum') return { one: '$8-20', week: '$10-25' };
  if (chain === 'Bitcoin') return { one: '$1-5', week: '$2-8' };
  return { one: '$0.10-2', week: '$0.50-5' };
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's core deposit action, in words a farmer can follow. */
function coreAction(category: string | null, name: string, chain: string, capital: number): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('curator'))
    return `Deposit $${capital} of USDC into a ${name} curated vault on ${chain} (pick the vault whose strategy you can read in one sitting) and keep the vault shares in the wallet.`;
  if (c.includes('lend') || c.includes('cdp'))
    return `Supply $${capital} of USDC as collateral to ${name} on ${chain}, then borrow about 40% of it back in the same asset and re-supply it once, so both sides of the market see your wallet.`;
  if (c.includes('dex') || c.includes('liquidity'))
    return `Provide $${capital} split evenly between USDC and the pool's other asset in ${name}'s deepest pool on ${chain}, and keep the LP position open.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then make one swap with the bridged funds in the destination app so the trip is not a dead end.`;
  if (c.includes('liquid staking') || c.includes('staking pool'))
    return `Stake $${capital} of ${chain}'s native asset through ${name} and keep the staking receipt token in the wallet, unstaked and unspent.`;
  if (c.includes('restak') || c.includes('collateral'))
    return `Restake $${capital} of a liquid staking token through ${name} on ${chain} and keep the restaked position untouched.`;
  if (c.includes('rwa'))
    return `Subscribe $${capital} to ${name}'s tokenised asset on ${chain} from the protocol's own app (KYC where it asks) and hold the asset to term.`;
  if (c.includes('basis'))
    return `Deposit $${capital} of USDC into ${name}'s basis-trading vault on ${chain} and keep the shares; the vault runs the hedge, your job is to stay deposited.`;
  if (c.includes('derivative') || c.includes('perpetual'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged pair (long and short of equal size) so the account trades without directional risk.`;
  if (c.includes('prediction'))
    return `Fund $${capital} on ${name} and take one position in its most liquid market, then let it settle rather than trading out.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy until it expires.`;
  if (c.includes('payment'))
    return `Open a ${name} payment channel with $${capital} of capacity on ${chain} and route two real payments through it in the first week.`;
  if (c.includes('chain'))
    return `Bridge $${capital} to ${chain}, keep a small balance of its gas token, and use two of the chain's native apps through ${name}'s ecosystem page.`;
  if (c.includes('yield'))
    return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the shares; do not chase the highest-APY vault if you cannot read its strategy.`;
  if (c.includes('stablecoin') || c.includes('stable'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet rather than looping it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} through its own app and keep the position open.`;
}

/** The category's second qualifying action: what to do after the deposit so the wallet reads as a user, not a drive-by. */
function secondAction(category: string | null, name: string, chain: string): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return `Repay a slice of the borrow and borrow it again the following week, so the position shows ordinary use over time, not one deposit.`;
  if (c.includes('dex') || c.includes('liquidity')) return `Make two ordinary swaps of $25-50 through ${name} on different days, the way a user of the exchange would.`;
  if (c.includes('bridge')) return `Bridge a second, smaller amount ($25-50) back the other way a week later, so both directions of ${name} carry your wallet.`;
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('curator')) return `Move a quarter of the position into a second ${name} vault with a different strategy, so the wallet is not riding on one curator's book.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Close and reopen the hedge once in the second week at the same small size, keeping total fees under $10.`;
  return `Repeat the core action once more with $25-50 a week later, so the wallet's history spans more than one day.`;
}

/**
 * A protocol's farm plan: six steps, each an action with its cost and its time, derived from the
 * protocol's own record (category, first chain, TVL, age) and never from a hand-written list of
 * names. Every step lands inside the gate's 20..600 trimmed characters.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const chainCount = p.chains.length;
  const capital = capitalFor(p);
  const gas = gasFor(chain);
  const hold = holdDaysFor(age);
  const steps = [
    `Set up a fresh wallet for ${p.name} alone, fund it with the position's capital plus gas, and keep its seed phrase offline on paper. Cost: ${gas.one} of gas to fund. Time: 10 minutes.`,
    `${coreAction(p.category, p.name, chain, capital)} Cost: $${capital} of capital plus ${gas.one} of gas. Time: 15-20 minutes.`,
    `${secondAction(p.category, p.name, chain)} Cost: about ${gas.one} of gas. Time: 10 minutes.`,
    `Stay active for at least ${hold} days: one small qualifying action a week (a deposit top-up, a swap, a vote or a claim check) so the wallet appears in several weekly snapshots, not one. Cost: about ${gas.week} of gas a week. Time: 10 minutes a week for ${hold} days.`,
    `Check ${p.name}'s own points or rewards page once a week and claim only from the link the protocol itself publishes; a launch is never announced by direct message. Cost: nothing to check, and never pay a fee to claim. Time: 5 minutes a week.`,
    `Log every transaction (date, hash, amount) in a farm diary${chainCount > 1 ? `, and repeat steps 2-3 on one more of its ${chainCount} chains if the first position runs clean` : ''}; if you exit, withdraw in one transaction and keep the diary. Cost: ${gas.one} of gas to exit. Time: 5 minutes a week, 15 minutes to exit.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n and a farm plan each. */
export function buildBoard(snapshot: Snapshot, model: FittedModel): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || isRankable(p));
  const scored = chosen.map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    on_watchlist: watch.has(s.p.slug),
    multiple: s.multiple,
    growth_factor: round4(s.growth),
    maturity_factor: round4(s.maturity),
    implied_value_usd: s.implied,
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** The already-trading protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      mcap_to_tvl: p.tvl_usd > 0 ? round4(p.mcap_usd! / p.tvl_usd) : 0,
      symbol: p.symbol,
    }));
}

/** Everything the entry writes: the board for board.json and the data for the dashboard. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const model = fitModel(snapshot);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: board.length,
      early: board.filter((r) => !r.on_watchlist).length,
      live: live.length,
      excluded_products: snapshot.protocols.filter((p) => isPreToken(p) && isProductOfAnother(p)).length,
    },
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, size, ranks, order, farm steps, values. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears on the board twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.name.trim().length === 0) return `${r.slug} has an empty name`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.TOKEN_RADAR=${JSON.stringify(radar)};\n`;
}
