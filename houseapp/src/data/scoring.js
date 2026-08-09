/**
 * scoring.js — Rigorous statistical ranking engine
 *
 * Steps:
 *  A. Z-Score Normalization  — standardises heterogeneous units onto a common scale
 *  B. Directionality         — inverts "bad" metrics so higher is always better
 *  C. Exponential Penalties  — dealbreaker logic for extreme commute / high crime
 *  D. Weighted Linear Combination (WLC) — applies user slider weights (sum to 1)
 *  E. Final Scaling          — applies penalties, then maps to a 55–95 display range
 */

// ─── Statistical utilities ─────────────────────────────────────────────────────
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function std(arr) {
  const m = mean(arr)
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function zScore(x, mu, sigma) {
  return sigma === 0 ? 0 : (x - mu) / sigma
}

/**
 * Clamps a Z-score in [-3, +3] and maps it to a 0–100 display bar value.
 * z = +3  → 100 (best)
 * z =  0  → 50  (average)
 * z = -3  → 0   (worst)
 */
function zToDisplay(z) {
  return Math.max(0, Math.min(100, Math.round(((z + 3) / 6) * 100)))
}

// ─── Weights from user priorities ─────────────────────────────────────────────
function normaliseWeights(priorities) {
  const total = Object.values(priorities).reduce((a, b) => a + b, 0) || 1
  return {
    safety:        priorities.safety        / total,
    convenience:   priorities.convenience   / total,
    cost:          priorities.cost          / total,
    entertainment: priorities.entertainment / total,
  }
}

// ─── PUBLIC: rank top-level areas ─────────────────────────────────────────────
/**
 * @param {object[]} areas        — UK_AREAS array (must have rawMetrics + commuteMin)
 * @param {string}   commuteMode  — 'transit' | 'car'
 * @param {object}   commuteTimes — { [areaId]: { transit: min, car: min } } | null
 * @param {object}   priorities   — { safety, convenience, cost, entertainment }
 * @returns sorted array with .displayScore, .metricBars, .adjData appended
 */
export function rankAreas(areas, commuteMode, commuteTimes, priorities) {
  // ── Step A: gather raw vectors ──────────────────────────────────────────────
  // Use real TfL commute times where available, fall back to static data
  const commutes = areas.map(a =>
    commuteTimes?.[a.id]?.[commuteMode] ?? a.commuteMin[commuteMode]
  )
  const crimes = areas.map(a => a.rawMetrics.crimeRate)
  const rents  = areas.map(a => a.rawMetrics.rentMonthly)
  const ents   = areas.map(a => a.rawMetrics.entertainmentIndex)

  // Population statistics (computed across the full 20-area dataset)
  const stats = {
    commute: { mu: mean(commutes), sigma: std(commutes) },
    crime:   { mu: mean(crimes),   sigma: std(crimes) },
    rent:    { mu: mean(rents),    sigma: std(rents) },
    ent:     { mu: mean(ents),     sigma: std(ents) },
  }

  // Top 10% crime threshold (Step C dealbreaker)
  const sortedCrimes = [...crimes].sort((a, b) => a - b)
  const crimeP90 = sortedCrimes[Math.floor(sortedCrimes.length * 0.9)]

  const W = normaliseWeights(priorities)

  // ── Steps B + C + D per area ───────────────────────────────────────────────
  const scored = areas.map((area, i) => {
    const commuteTime = commutes[i]
    const isRealTime  = !!(commuteTimes?.[area.id]?.[commuteMode])

    // Step B: Z-scores with directionality
    const zSafety        = -zScore(crimes[i],  stats.crime.mu,   stats.crime.sigma)
    const zCost          = -zScore(rents[i],   stats.rent.mu,    stats.rent.sigma)
    const zEntertainment =  zScore(ents[i],    stats.ent.mu,     stats.ent.sigma)
    const zConvenience   = -zScore(commuteTime, stats.commute.mu, stats.commute.sigma)

    // Step C: Exponential penalties
    const pCommute = commuteTime > 90
      ? Math.exp(-0.1 * (commuteTime - 90))
      : 1
    const pCrime = crimes[i] >= crimeP90 ? 0.5 : 1

    // Step D: Weighted Linear Combination
    const wlcScore =
      W.safety        * zSafety        +
      W.convenience   * zConvenience   +
      W.cost          * zCost          +
      W.entertainment * zEntertainment

    // Step E: Apply penalties → raw rank score
    const rankScore = wlcScore * pCommute * pCrime

    return {
      area,
      rankScore,
      commuteTime,
      isRealTime,
      pCrime,
      zScores: { safety: zSafety, convenience: zConvenience, cost: zCost, entertainment: zEntertainment },
    }
  })

  // ── Step E: Sort, then normalise display scores to 55–95 range ─────────────
  const sorted = scored.sort((a, b) => b.rankScore - a.rankScore)
  const rawMin = sorted[sorted.length - 1].rankScore
  const rawMax = sorted[0].rankScore
  const rawRange = rawMax - rawMin || 1

  return sorted.map(s => ({
    ...s.area,
    displayScore: Math.round(((s.rankScore - rawMin) / rawRange) * 40 + 55),
    // Per-metric 0–100 bars derived from Z-scores (z=+3→100, z=0→50, z=-3→0)
    metricBars: {
      safety:        zToDisplay(s.zScores.safety),
      convenience:   zToDisplay(s.zScores.convenience),
      cost:          zToDisplay(s.zScores.cost),
      entertainment: zToDisplay(s.zScores.entertainment),
    },
    // Raw adjData for downstream use
    adjData: {
      commuteTime:  s.commuteTime,
      isRealTime:   s.isRealTime,
      pCrime:       s.pCrime,
      crimePenalty: s.pCrime < 1,
    },
  }))
}

// ─── PUBLIC: rank sub-areas within a parent area ──────────────────────────────
/**
 * Sub-areas don't carry raw metrics — we derive proxy values from baseScores
 * (which are already calibrated 0–100, higher = better) and Z-normalise within
 * the cohort of 5, so rankings are relative to the parent area's sub-areas.
 *
 * @param {object[]} subAreas        — entries from SUB_AREAS[areaId]
 * @param {number}   parentCommute   — resolved commute time for the parent area (mins)
 * @param {object}   priorities      — { safety, convenience, cost, entertainment }
 * @returns sorted array with .displayScore, .metricBars, .commuteTime appended
 */
export function rankSubAreas(subAreas, parentCommute, priorities) {
  if (!subAreas || subAreas.length === 0) return []

  // Derive proxies: invert baseScores into "bad = high" values for crime/rent
  // so the Z-score inversion in Step B is consistent with rankAreas()
  const crimeProxies = subAreas.map(s => 100 - s.baseScores.safety)
  const rentProxies  = subAreas.map(s => 100 - s.baseScores.cost)
  const entValues    = subAreas.map(s => s.baseScores.entertainment)
  const commuteTimes = subAreas.map(s => Math.max(5, parentCommute + (s.commuteOffset ?? 0)))

  // Population stats within this cohort
  const stats = {
    crime:   { mu: mean(crimeProxies), sigma: std(crimeProxies) },
    rent:    { mu: mean(rentProxies),  sigma: std(rentProxies) },
    ent:     { mu: mean(entValues),    sigma: std(entValues) },
    commute: { mu: mean(commuteTimes), sigma: std(commuteTimes) },
  }

  // Top 10% crime threshold within the cohort
  const sortedCrime = [...crimeProxies].sort((a, b) => a - b)
  const crimeP90 = sortedCrime[Math.floor(sortedCrime.length * 0.9)]

  const W = normaliseWeights(priorities)

  const scored = subAreas.map((sub, i) => {
    const commuteTime = commuteTimes[i]

    // Step B: Z-scores with directionality (same sign conventions as rankAreas)
    const zSafety        = -zScore(crimeProxies[i], stats.crime.mu,   stats.crime.sigma)
    const zCost          = -zScore(rentProxies[i],  stats.rent.mu,    stats.rent.sigma)
    const zEntertainment =  zScore(entValues[i],     stats.ent.mu,     stats.ent.sigma)
    const zConvenience   = -zScore(commuteTime,      stats.commute.mu, stats.commute.sigma)

    // Step C: Exponential penalties
    const pCommute = commuteTime > 90
      ? Math.exp(-0.1 * (commuteTime - 90))
      : 1
    const pCrime = crimeProxies[i] >= crimeP90 ? 0.5 : 1

    // Step D: WLC
    const wlcScore =
      W.safety        * zSafety        +
      W.convenience   * zConvenience   +
      W.cost          * zCost          +
      W.entertainment * zEntertainment

    // Step E: penalties
    const rankScore = wlcScore * pCommute * pCrime

    return {
      sub,
      rankScore,
      commuteTime,
      pCrime,
      zScores: { safety: zSafety, convenience: zConvenience, cost: zCost, entertainment: zEntertainment },
    }
  })

  // Sort and normalise display scores to 60–90 range
  const sorted = scored.sort((a, b) => b.rankScore - a.rankScore)
  const rawMin = sorted[sorted.length - 1].rankScore
  const rawMax = sorted[0].rankScore
  const rawRange = rawMax - rawMin || 1

  return sorted.map(s => ({
    sub: s.sub,
    displayScore: Math.round(((s.rankScore - rawMin) / rawRange) * 30 + 60),
    metricBars: {
      safety:        zToDisplay(s.zScores.safety),
      convenience:   zToDisplay(s.zScores.convenience),
      cost:          zToDisplay(s.zScores.cost),
      entertainment: zToDisplay(s.zScores.entertainment),
    },
    commuteTime:  s.commuteTime,
    crimePenalty: s.pCrime < 1,
  }))
}
