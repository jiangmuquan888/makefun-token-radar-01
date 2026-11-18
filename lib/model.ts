// Token Launch Radar, model radar-2: one sealed snapshot in, one ranked board out.
//
// What is different from a flat TVL-times-a-constant model, and why it should rank better:
//
// 1. The base multiple is LEARNED FROM THE SNAPSHOT ITSELF. Every protocol in the snapshot whose
//    token already trades carries a market cap and a TVL, so the market's own pricing of a category
//    is sitting in the input. For each category we take the median market-cap / TVL ratio of its
//    live-token protocols (at least 3 live peers, else the global median of all live protocols) and
//    use that median as the base multiple for the pre-token protocols of the same category. A lending
//    market and a DEX are not priced alike by the market, so the radar does not price them alike
//    either. The multiple is clamped to [0.08, 2.5] so one thin category cannot explode a row.
// 2. Growth is damped, not raw. change_7d is clamped to [-50, 150]; above +60 the excess counts at
//    a quarter weight, so a one-week spike (the snapshot's largest is +4,448%) cannot buy rank 1.
// 3. Maturity rewards survival: a protocol tracked for years with no token has a record a launch
//    can be priced on; a protocol listed last month has mostly hope. Age scales value 0.65 to 1.00
//    over four years.
// 4. Reach is a small factor: each extra chain is distribution a token launches into, worth at
//    most +12% in total.
//
//   implied = TVL x categoryMultiple(median live mcap/TVL, clamped)
//             x growthMult(damped 7d change) x maturityMult(age) x reachMult(chains)
//
// No protocol name, slug or category string is ever priced by hand: categories only group the
// snapshot's own live ratios, and the same function scores every row. Protocols whose token
// already trades are never ranked here; they are carried apart as the live set, priced by the
// market itself, and they are the peers the multiples are learned from.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// the largest pre-token protocols below the floor: the early rows a radar exists to find.

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

/** The model's constants, as the dashboard states them. The category multiples are not here: they are computed from the snapshot on every run. */
export interface ModelConstants {
  multiple_floor: number;
  multiple_cap: number;
  min_live_peers: number;
  growth_floor: number;
  growth_cap: number;
  growth_knee: number;
  growth_knee_weight: number;
  growth_weight: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_per_chain: number;
  reach_cap: number;
}

export const MODEL: ModelConstants = {
  multiple_floor: 0.08,
  multiple_cap: 2.5,
  min_live_peers: 3,
  growth_floor: -50,
  growth_cap: 150,
  growth_knee: 60,
  growth_knee_weight: 0.25,
  growth_weight: 0.45,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1460,
  unknown_age_days: 300,
  reach_per_chain: 0.03,
  reach_cap: 0.12,
};

/** The model's version label: the dashboard names it and the board's rows carry it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 220;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 36;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row, with the model's whole working shown. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  radar_score: number;
  model: {
    category_multiple: number;
    multiple_source: 'category' | 'global';
    live_peers: number;
    base_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan, so the page shows the board's own numbers and never recomputes different ones. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  radar_score: number;
  watchlist: boolean;
  category_multiple: number;
  multiple_source: 'category' | 'global';
  live_peers: number;
  base_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
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

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
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

/** What the market pays for the snapshot's live protocols, learned per category. */
export interface CategoryMultiples {
  /** The median mcap/TVL of every live protocol in the snapshot: the fallback multiple. */
  global: number;
  /** Per-category medians, only for categories with at least MODEL.min_live_peers live protocols. */
  byCategory: Map<string, { multiple: number; peers: number }>;
  /** Live peer counts for every category, so a row can say how much evidence its multiple rests on. */
  peerCounts: Map<string, number>;
}

/** Learn the base multiples from the snapshot's live-token protocols. Nothing is hardcoded: change the snapshot and the multiples change. */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): CategoryMultiples {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = ratiosByCategory.get(key) ?? [];
    list.push(ratio);
    ratiosByCategory.set(key, list);
  }
  const globalRaw = all.length > 0 ? median(all) : model.multiple_floor;
  const byCategory = new Map<string, { multiple: number; peers: number }>();
  const peerCounts = new Map<string, number>();
  for (const [key, list] of ratiosByCategory) {
    peerCounts.set(key, list.length);
    if (list.length >= model.min_live_peers) {
      byCategory.set(key, { multiple: clamp(median(list), model.multiple_floor, model.multiple_cap), peers: list.length });
    }
  }
  return { global: clamp(globalRaw, model.multiple_floor, model.multiple_cap), byCategory, peerCounts };
}

/** The damped growth rate the model prices: clamped, with the excess over the knee at quarter weight. */
export function dampedGrowth(change7d: number | null, model: ModelConstants = MODEL): number {
  const raw = clamp(finite(change7d, 0), model.growth_floor, model.growth_cap);
  if (raw <= model.growth_knee) return raw;
  return model.growth_knee + (raw - model.growth_knee) * model.growth_knee_weight;
}

/** One protocol's full scoring: every multiplier, the implied value and the dashboard's radar score. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: CategoryMultiples,
  model: ModelConstants = MODEL,
): { implied: number; score: number; multiple: number; source: 'category' | 'global'; peers: number; base: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const key = protocol.category ?? 'Uncategorized';
  const cat = multiples.byCategory.get(key);
  const multiple = cat !== undefined ? cat.multiple : multiples.global;
  const source: 'category' | 'global' = cat !== undefined ? 'category' : 'global';
  const peers = cat !== undefined ? cat.peers : (multiples.peerCounts.get(key) ?? 0);
  const base = protocol.tvl_usd * multiple;
  const growthPct = dampedGrowth(protocol.change_7d, model);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const reachMult = 1 + Math.min(model.reach_cap, Math.max(0, protocol.chains.length - 1) * model.reach_per_chain);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * reachMult));
  // The radar score is the dashboard's at-a-glance signal, 0..100. It never sets the rank: the rank is the implied value's.
  const tvlScore = clamp((Math.log10(Math.max(protocol.tvl_usd, 1)) - 6) / 3.7, 0, 1);
  const momentum = clamp((growthPct + 20) / 70, 0, 1);
  const maturityScore = clamp(ageForModel / model.maturity_days, 0, 1);
  const reachScore = clamp(protocol.chains.length / 6, 0, 1);
  const score = Math.round(100 * (0.35 * tvlScore + 0.25 * momentum + 0.25 * maturityScore + 0.15 * reachScore));
  return { implied, score, multiple, source, peers, base: Math.round(base), growthPct, growthMult, maturityMult, reachMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const multiples = categoryMultiples(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, multiples, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map(({ p, s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    radar_score: s.score,
    model: {
      category_multiple: round4(s.multiple),
      multiple_source: s.source,
      live_peers: s.peers,
      base_value_usd: s.base,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      reach_multiplier: round4(s.reachMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

const L2_CHAINS = new Set(['Arbitrum', 'Base', 'Optimism', 'Polygon', 'Polygon zkEVM', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Zora', 'Ink', 'Unichain', 'Soneium', 'World Chain', 'Taiko', 'Metis', 'Fraxtal', 'BOB', 'Manta']);

/** What one transaction costs on a chain, in plain dollars a farmer can budget with. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $14 of mainnet gas off-peak';
  if (chain === 'Solana') return 'under $0.05 of network fees';
  if (chain === 'Bitcoin') return 'about $2 of miner fees';
  if (L2_CHAINS.has(chain)) return 'about $0.40 of L2 gas';
  if (chain === 'Binance' || chain === 'BSC') return 'about $0.60 of gas';
  if (chain === 'Tron') return 'about $1 of energy fees';
  return 'about $1.50 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 75;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's primary and secondary farm actions, in words a farmer can follow. Neither names a protocol: the name is filled from the row. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { primary: string; secondary: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      primary: `Supply $${capital} of USDC to ${name} on ${chain} as lending collateral and leave it supplied.`,
      secondary: `Borrow $${Math.round(capital * 0.3)} of USDC against that collateral on ${name}, then supply the borrowed amount back so both sides of the market see your wallet.`,
    };
  }
  if (c.includes('dex') || c.includes('liquidity') || c.includes('yield')) {
    return {
      primary: `Provide $${capital} of liquidity to ${name}'s largest stablecoin pool on ${chain}, split evenly between the two sides of the pair.`,
      secondary: `Stake the LP position inside ${name} (or its auto-compounding vault if it offers one) so the position earns and is recorded every day it stays in.`,
    };
  }
  if (c.includes('bridge') || c.includes('canonical')) {
    return {
      primary: `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name} and keep the bridged funds on the destination chain.`,
      secondary: `Use $${Math.round(capital * 0.5)} of the bridged funds in one destination-chain app the same week, then bridge a small $25 amount back so both directions are on record.`,
    };
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool')) {
    return {
      primary: `Stake $${capital} worth of the chain's native asset through ${name} on ${chain} and keep the staking receipt token in the same wallet.`,
      secondary: `Deposit $${Math.round(capital * 0.4)} of the receipt token into a lending market ${name} integrates with, so the position counts in two protocols at once.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      primary: `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position (long and short the same size) so the account trades without directional risk.`,
      secondary: `Place and cancel two limit orders a week on ${name} and close the week flat, so the account shows regular, real trading activity.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      primary: `Deposit $${capital} of USDC into ${name}'s flagship curated vault on ${chain} and keep the vault shares untouched.`,
      secondary: `Split a second $${Math.round(capital * 0.5)} across one more ${name} vault with a different strategy, so the wallet appears in two of its vaults' snapshots.`,
    };
  }
  if (c.includes('rwa') || c.includes('anchor')) {
    return {
      primary: `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} with USDC and hold the minted asset in the farming wallet.`,
      secondary: `Hold through one full distribution or interest period on ${name} and keep the payout transaction in the wallet's history.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      primary: `Fund $${capital} on ${name} and take one position in its most liquid market, sized under a fifth of the funding.`,
      secondary: `Take a second, smaller position in a different ${name} market each week so the account is active across markets, not parked in one.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      primary: `Buy $${capital} of cover from ${name} on ${chain} for the longest term it offers and keep the policy NFT in the wallet.`,
      secondary: `If ${name} lets members stake into its capital pool, stake $${Math.round(capital * 0.5)} there as well so the wallet is both a buyer and a backer.`,
    };
  }
  if (c.includes('payment')) {
    return {
      primary: `Open a ${name} payment account on ${chain}, fund it with $${capital} and make one real payment of $10 or more.`,
      secondary: `Repeat one payment a week through ${name} for the whole holding window, varying the amount so the history reads as use, not a script.`,
    };
  }
  if (c.includes('stable')) {
    return {
      primary: `Mint or deposit $${capital} of ${name}'s stable asset on ${chain} and hold the stable asset in the farming wallet.`,
      secondary: `Provide $${Math.round(capital * 0.5)} of that stable asset as liquidity in the pool ${name} links from its own app, and keep the LP position open.`,
    };
  }
  return {
    primary: `Deposit $${capital} of USDC into ${name} on ${chain} through its own app and keep the position open.`,
    secondary: `Use ${name}'s second core feature as well (a second vault, market or pool it offers) with $${Math.round(capital * 0.5)}, so the wallet is not a one-click visitor.`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, first chain, TVL tier, age) and never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const weeks = Math.max(1, Math.round(hold / 7));
  const { primary, secondary } = actionsFor(p, capital, chain);
  return [
    {
      text: `Set up one fresh wallet for ${p.name} only, back its seed phrase up offline, and never reuse it for unrelated airdrop hunting.`,
      cost: 'nothing to create, and never pay anyone for a wallet or a claim link',
      time: '10 minutes',
    },
    {
      text: `Fund that wallet on ${chain} with $${capital + 25}: $${capital} for the position and $25 spare for fees, bridged from an exchange withdrawal or a bridge you already trust.`,
      cost: gas,
      time: '15 minutes',
    },
    { text: primary, cost: `$${capital} of capital in the position and ${gas}`, time: '20 minutes to set up' },
    { text: secondary, cost: 'the amount named in the step and ' + gas, time: '15 minutes' },
    {
      text: `Repeat one small qualifying action on ${p.name} every week for ${weeks} weeks (a top-up, a claim of accrued rewards, a vote or a rebalance), so the wallet is active in several weekly snapshots, not one.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days in total, and log every transaction hash, date and amount in a farm log for ${p.name} as you go.`,
      cost: `the $${capital} stays in the position for the whole window`,
      time: `${hold} days`,
    },
    {
      text: `At day ${hold}, open ${p.name}'s own points or rewards page from its official app only, check what the wallet earned, and either roll the position for another window or unwind it in one transaction. Never pay a fee to "unlock" a claim.`,
      cost: 'no fee to check, and ' + gas + ' to unwind',
      time: '20 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view: the peers the multiples are learned from, shown with the market's own prices. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: everything the page renders, farm plan included, so page and board can never disagree. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    radar_score: row.radar_score,
    watchlist: watchlist.has(row.slug),
    category_multiple: row.model.category_multiple,
    multiple_source: row.model.multiple_source,
    live_peers: row.model.live_peers,
    base_value_usd: row.model.base_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const multiples = categoryMultiples(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(multiples.global),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watchlist)),
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
