/*
 * actuarial.js — Pure, dependency-free actuarial measurement functions.
 *
 * These are the "AI Risk Lens" primitives. Each function takes plain numbers
 * or arrays and returns plain objects. No DOM. The stochastic pieces
 * (aggregateLossSim) take an explicit seed, so results are reproducible and
 * the interactive tool and the framework paper report identical numbers.
 *
 * Works in the browser (window.Actuarial) and in Node (module.exports).
 */
(function (global) {
  "use strict";

  // ---- small numerical helpers -------------------------------------------

  function mean(xs) {
    if (!xs.length) return 0;
    var s = 0;
    for (var i = 0; i < xs.length; i++) s += xs[i];
    return s / xs.length;
  }

  function sum(xs) {
    var s = 0;
    for (var i = 0; i < xs.length; i++) s += xs[i];
    return s;
  }

  // Type-7 (R default) linear-interpolation quantile on an UNSORTED array.
  function quantile(xs, p) {
    if (!xs.length) return 0;
    var a = xs.slice().sort(function (x, y) { return x - y; });
    if (p <= 0) return a[0];
    if (p >= 1) return a[a.length - 1];
    var h = (a.length - 1) * p;
    var lo = Math.floor(h);
    var hi = Math.ceil(h);
    return a[lo] + (h - lo) * (a[hi] - a[lo]);
  }

  // ---- seeded RNG + samplers (used only by aggregateLossSim) --------------

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randNormal(rng) {
    var u = 1 - rng(), v = 1 - rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Poisson: Knuth for small lambda, normal approximation for large.
  function poissonSample(rng, lambda) {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      var L = Math.exp(-lambda), k = 0, p = 1;
      do { k++; p *= rng(); } while (p > L);
      return k - 1;
    }
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * randNormal(rng)));
  }
  // Gamma(shape a >= 1, scale 1) via Marsaglia-Tsang.
  function gammaSample(rng, a) {
    var d = a - 1 / 3, c = 1 / Math.sqrt(9 * d), x, v, u;
    for (;;) {
      do { x = randNormal(rng); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; u = rng();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  // ---- 1. Frequency x Severity loss model --------------------------------
  function frequencySeverity(records) {
    var n = records.length;
    var losses = new Array(n);
    var severities = [];
    var errorCount = 0;
    for (var i = 0; i < n; i++) {
      var r = records[i];
      if (r.error) {
        errorCount++;
        severities.push(r.severity);
        losses[i] = r.severity;
      } else {
        losses[i] = 0;
      }
    }
    var frequency = n ? errorCount / n : 0;
    var meanSeverity = mean(severities);
    var expectedLoss = mean(losses);
    return {
      n: n, errorCount: errorCount, frequency: frequency,
      meanSeverity: meanSeverity, expectedLoss: expectedLoss,
      losses: losses, severities: severities
    };
  }

  // ---- 2. Buhlmann / limited-fluctuation credibility ---------------------
  function buhlmannCredibility(n, observedRate, priorRate, k) {
    var Z = n / (n + k);
    var estimate = Z * observedRate + (1 - Z) * priorRate;
    return { n: n, k: k, Z: Z, observedRate: observedRate, priorRate: priorRate, estimate: estimate };
  }

  // ---- 3. Actual-to-Expected (A/E) with control limits -------------------
  // For each cohort, A/E = actual / expected. Under the null (no drift), the
  // actual count ~ Poisson(expected), so SE(A/E) ≈ 1/sqrt(expected). A cohort
  // is FLAGGED only when its departure is BOTH statistically significant
  // (outside the ~95% Poisson control band, |z| > 1.96) AND material
  // (|A/E − 1| > flagThreshold). This stops small, low-exposure cohorts from
  // tripping on noise — consistent with the credibility view.
  function actualToExpected(records, flagThreshold) {
    if (flagThreshold == null) flagThreshold = 0.10;
    var byCohort = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!byCohort[r.cohort]) byCohort[r.cohort] = { cohort: r.cohort, n: 0, actual: 0, expected: 0 };
      var c = byCohort[r.cohort];
      c.n++;
      c.actual += r.error ? 1 : 0;
      c.expected += r.expectedRate;
    }
    var rows = Object.keys(byCohort).map(function (key) {
      var c = byCohort[key];
      c.ae = c.expected > 0 ? c.actual / c.expected : 0;
      var se = c.expected > 0 ? 1 / Math.sqrt(c.expected) : 0; // SE of the A/E ratio
      c.se = se;
      c.ciLow = Math.max(0, 1 - 1.96 * se);
      c.ciHigh = 1 + 1.96 * se;
      c.z = c.expected > 0 ? (c.actual - c.expected) / Math.sqrt(c.expected) : 0;
      c.material = Math.abs(c.ae - 1) > flagThreshold;
      c.significant = c.expected > 0 && Math.abs(c.z) > 1.96;
      c.flag = c.significant && c.material;
      return c;
    });
    var totA = sum(rows.map(function (r) { return r.actual; }));
    var totE = sum(rows.map(function (r) { return r.expected; }));
    return { rows: rows, portfolioAE: totE > 0 ? totA / totE : 0, totalActual: totA, totalExpected: totE };
  }

  // ---- 4. VaR / TVaR (CTE) -----------------------------------------------
  function varTvar(losses, alpha) {
    var v = quantile(losses, alpha);
    var tail = [];
    for (var i = 0; i < losses.length; i++) if (losses[i] >= v) tail.push(losses[i]);
    var t = tail.length ? mean(tail) : v;
    if (t < v) t = v;
    return { alpha: alpha, var: v, tvar: t, tailCount: tail.length };
  }

  // ---- 5. IBNR reserve (development-factor analog) -----------------------
  function ibnrReserve(reportedCount, ldf, meanSeverity, tvarSeverity) {
    if (ldf < 1) ldf = 1;
    var ultimateCount = reportedCount * ldf;
    var ibnrCount = Math.max(0, ultimateCount - reportedCount);
    var bestEstimate = ibnrCount * meanSeverity;
    var riskMargin = ibnrCount * Math.max(0, tvarSeverity - meanSeverity);
    var reserve = Math.max(0, bestEstimate + riskMargin);
    return {
      reportedCount: reportedCount, ldf: ldf, ultimateCount: ultimateCount,
      ibnrCount: ibnrCount, bestEstimate: bestEstimate, riskMargin: riskMargin, reserve: reserve
    };
  }

  // ---- 6. Economic capital (per-decision, undiversified) -----------------
  // The simple version: EC = TVaR_alpha - E[L], scaled to the book. Scaling a
  // per-decision tail by N assumes perfectly dependent decisions, so the
  // portfolio figure is a conservative UPPER BOUND. See aggregateEconomicCapital
  // for the diversified, dependence-aware version.
  function economicCapital(tvar, expectedLoss, exposure) {
    var perDecision = Math.max(0, tvar - expectedLoss);
    return {
      perDecision: perDecision, portfolio: perDecision * (exposure || 1),
      tvar: tvar, expectedLoss: expectedLoss, exposure: exposure || 1
    };
  }

  // ---- 7. Aggregate collective-risk model (dependence-aware capital) ------
  // Monte-Carlo of the AGGREGATE annual loss S = sum of per-decision losses,
  // built as a mixed-Poisson compound model with a shared systemic factor:
  //
  //   G ~ Gamma(mean 1, variance g)     [systemic / common-shock multiplier]
  //   M | G ~ Poisson(frequency * exposure * G)   [correlated error count]
  //   S = sum of M severities drawn from the empirical severity distribution
  //
  // rho in [0,1] maps to the systemic variance g = rho * 0.5:
  //   rho = 0  -> G ≡ 1 -> independent errors -> maximal diversification
  //   rho > 0  -> common-cause failures cluster -> fatter aggregate tail
  //
  // Economic capital is then TVaR_alpha(S) - E[S], read from the AGGREGATE
  // distribution (not a per-decision tail scaled by N). Seeded => reproducible.
  function aggregateLossSim(severities, frequency, exposure, opts) {
    opts = opts || {};
    var alpha = opts.alpha != null ? opts.alpha : 0.95;
    var rho = opts.rho != null ? opts.rho : 0;
    var sims = opts.sims != null ? opts.sims : 2000;
    var seed = opts.seed != null ? opts.seed : 12345;
    var m = severities.length;
    if (!m || exposure <= 0 || frequency <= 0) {
      return { mean: 0, var: 0, tvar: 0, ec: 0, ecPerDecision: 0, rho: rho, sims: sims };
    }
    var rng = mulberry32(seed >>> 0);
    var g = rho * 0.5;                 // systemic variance
    var lambda0 = frequency * exposure;
    var S = new Array(sims);
    for (var s = 0; s < sims; s++) {
      var G = g > 0 ? gammaSample(rng, 1 / g) * g : 1; // mean 1, variance g
      var M = poissonSample(rng, lambda0 * G);
      var tot = 0;
      for (var j = 0; j < M; j++) tot += severities[(m * rng()) | 0];
      S[s] = tot;
    }
    var meanS = mean(S);
    var v = quantile(S, alpha);
    var tail = [];
    for (var t = 0; t < sims; t++) if (S[t] >= v) tail.push(S[t]);
    var tvar = tail.length ? mean(tail) : v;
    if (tvar < v) tvar = v;
    var ec = Math.max(0, tvar - meanS);
    return {
      mean: meanS, var: v, tvar: tvar, ec: ec, ecPerDecision: ec / exposure,
      meanPerDecision: meanS / exposure, rho: rho, g: g, sims: sims
    };
  }

  var api = {
    mean: mean, sum: sum, quantile: quantile,
    frequencySeverity: frequencySeverity,
    buhlmannCredibility: buhlmannCredibility,
    actualToExpected: actualToExpected,
    varTvar: varTvar,
    ibnrReserve: ibnrReserve,
    economicCapital: economicCapital,
    aggregateLossSim: aggregateLossSim
  };

  global.Actuarial = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
