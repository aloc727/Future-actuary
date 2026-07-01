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

  // ---- 8. Stochastic reserving: development triangle -----------------------
  // Replaces the single-factor LDF with a real accident-period × development-
  // lag triangle, chain-ladder projection, Bornhuetter-Ferguson, and an
  // over-dispersed-Poisson bootstrap for a full reserve DISTRIBUTION.
  //
  // Records must carry `accPeriod` and `devLag` (added by sample-data.js from a
  // SEPARATE seeded pass, so the primary frequency/severity draws are
  // untouched). An error is "reported" by the valuation date iff
  // accPeriod + devLag <= P-1.

  function developmentTriangle(records, P) {
    P = P || 8;
    var inc = [], a, d;
    for (a = 0; a < P; a++) { inc[a] = []; for (d = 0; d < P; d++) inc[a][d] = 0; }
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r.error || r.accPeriod == null || r.devLag == null) continue;
      if (r.accPeriod + r.devLag <= P - 1) inc[r.accPeriod][r.devLag]++;
    }
    var cum = [];
    for (a = 0; a < P; a++) {
      cum[a] = []; var run = 0;
      for (d = 0; d < P; d++) {
        if (a + d <= P - 1) { run += inc[a][d]; cum[a][d] = run; } else cum[a][d] = null;
      }
    }
    return { P: P, inc: inc, cum: cum };
  }

  // Chain-ladder on a cumulative triangle. Returns dev factors, per-accident
  // ultimates, the fitted incrementals (needed for the bootstrap), and IBNR.
  function chainLadder(tri) {
    var P = tri.P, cum = tri.cum, a, d;
    var f = [];
    for (d = 0; d < P - 1; d++) {
      var num = 0, den = 0;
      for (a = 0; a + d + 1 <= P - 1; a++) {
        if (cum[a][d] != null && cum[a][d + 1] != null) { num += cum[a][d + 1]; den += cum[a][d]; }
      }
      f[d] = den > 0 ? num / den : 1;
    }
    var ultimate = [], latest = [], reported = 0, ult = 0;
    for (a = 0; a < P; a++) {
      var dl = P - 1 - a, c = cum[a][dl] != null ? cum[a][dl] : 0;
      latest[a] = c; reported += c;
      var u = c; for (d = dl; d < P - 1; d++) u *= f[d];
      ultimate[a] = u; ult += u;
    }
    // fitted cumulative (backward recursion) -> fitted incrementals on observed cells
    var fit = [];
    for (a = 0; a < P; a++) {
      fit[a] = []; var dl2 = P - 1 - a;
      fit[a][dl2] = latest[a];
      for (d = dl2 - 1; d >= 0; d--) fit[a][d] = f[d] > 0 ? fit[a][d + 1] / f[d] : fit[a][d + 1];
    }
    var fitInc = [];
    for (a = 0; a < P; a++) {
      fitInc[a] = [];
      for (d = 0; d <= P - 1 - a; d++) fitInc[a][d] = d === 0 ? fit[a][0] : fit[a][d] - fit[a][d - 1];
    }
    return {
      devFactors: f, ultimate: ultimate, latest: latest, fitInc: fitInc,
      reportedTotal: reported, ultimateTotal: ult, ibnrCount: Math.max(0, ult - reported)
    };
  }

  // Bornhuetter-Ferguson: blends the chain-ladder development pattern with an
  // a-priori ultimate (here the model's EXPECTED error count per accident
  // period). Robust when the latest periods are immature.
  function bornhuetterFerguson(tri, cl, aprioriByAcc) {
    var P = tri.P, f = cl.devFactors, a, d;
    // cumulative development factor from maturity (P-1-a) to ultimate
    var ibnr = 0, ult = 0;
    for (a = 0; a < P; a++) {
      var dl = P - 1 - a, cdf = 1;
      for (d = dl; d < P - 1; d++) cdf *= (f[d] || 1);
      var pctUnreported = cdf > 0 ? 1 - 1 / cdf : 0;
      var ap = aprioriByAcc[a] || 0;
      var bfUlt = cl.latest[a] + ap * pctUnreported;
      ult += bfUlt; ibnr += ap * pctUnreported;
    }
    return { ultimateTotal: ult, ibnrCount: Math.max(0, ibnr) };
  }

  // Over-dispersed-Poisson bootstrap (England-Verrall). Resamples Pearson
  // residuals of the chain-ladder fit, refits, and adds ODP process error, to
  // produce a predictive distribution of the IBNR count. Seeded => reproducible.
  function bootstrapReserve(tri, cl, opts) {
    opts = opts || {};
    var B = opts.B || 1000, seed = opts.seed || 987654321;
    var P = tri.P, inc = tri.inc, fit = cl.fitInc, a, d;
    // Pearson residuals on observed cells with positive fitted mean.
    var res = [], nObs = 0;
    for (a = 0; a < P; a++) for (d = 0; d <= P - 1 - a; d++) {
      var m = fit[a][d];
      if (m > 0) { res.push((inc[a][d] - m) / Math.sqrt(m)); nObs++; }
    }
    var params = 2 * P - 1;            // CL parameters
    var dof = Math.max(1, nObs - params);
    var phi = 0; for (var t = 0; t < res.length; t++) phi += res[t] * res[t]; phi = phi / dof;
    var scaleAdj = Math.sqrt(nObs / dof);
    var rng = mulberry32(seed >>> 0);
    var samples = new Array(B);
    for (var b = 0; b < B; b++) {
      // pseudo incrementals = m + r*·sqrt(m)
      var pcum = [];
      for (a = 0; a < P; a++) {
        pcum[a] = []; var run = 0;
        for (d = 0; d <= P - 1 - a; d++) {
          var mm = fit[a][d];
          var rr = res[(res.length * rng()) | 0] * scaleAdj;
          var pv = mm + rr * Math.sqrt(Math.max(mm, 0));
          run += pv; pcum[a][d] = run;
        }
      }
      // refit chain-ladder on pseudo-triangle
      var pf = [];
      for (d = 0; d < P - 1; d++) {
        var nu = 0, de = 0;
        for (a = 0; a + d + 1 <= P - 1; a++) { nu += pcum[a][d + 1]; de += pcum[a][d]; }
        pf[d] = de > 0 ? nu / de : 1;
      }
      // project future incrementals + ODP process error via Gamma(mean, var=phi*mean)
      var ibnr = 0;
      for (a = 1; a < P; a++) {
        var dl = P - 1 - a, cprev = pcum[a][dl];
        for (d = dl; d < P - 1; d++) {
          var cnext = cprev * (pf[d] || 1);
          var meanInc = Math.max(0, cnext - cprev);
          if (meanInc > 0 && phi > 0) {
            var shape = meanInc / phi;
            ibnr += shape >= 1 ? gammaSample(rng, shape) * phi : meanInc; // Gamma mean=meanInc, var=phi*meanInc
          } else ibnr += meanInc;
          cprev = cnext;
        }
      }
      samples[b] = ibnr;
    }
    var meanI = mean(samples);
    var variance = 0; for (t = 0; t < B; t++) variance += Math.pow(samples[t] - meanI, 2);
    var se = Math.sqrt(variance / Math.max(1, B - 1));
    return {
      mean: meanI, se: se, cv: meanI > 0 ? se / meanI : 0,
      p75: quantile(samples, 0.75), p95: quantile(samples, 0.95), B: B, phi: phi,
      samples: samples
    };
  }

  // ---- 9. Heavy-tail severity: peaks-over-threshold GPD -------------------
  // Fit a Generalized Pareto Distribution to severity exceedances over a high
  // threshold u (method of moments, Hosking-Wallis). The shape ξ is the tail
  // index: ξ ≈ 0 is exponential-tailed (e.g. lognormal body), ξ > 0 is heavy
  // (power-law) — the regime where a mean-severity reserve badly understates.
  function fitGPD(values, thresholdQuantile) {
    var thq = thresholdQuantile != null ? thresholdQuantile : 0.90;
    var u = quantile(values, thq), ex = [], i;
    for (i = 0; i < values.length; i++) if (values[i] > u) ex.push(values[i] - u);
    var nEx = ex.length, n = values.length;
    if (nEx < 10) return { u: u, xi: 0, beta: Math.max(1, mean(ex)), nExcess: nEx, tailProb: nEx / n, n: n, valid: false };
    var m = mean(ex), s2 = 0;
    for (i = 0; i < nEx; i++) s2 += (ex[i] - m) * (ex[i] - m);
    s2 = s2 / (nEx - 1);
    var xi = 0.5 * (1 - (m * m) / s2);
    var beta = 0.5 * m * ((m * m) / s2 + 1);
    if (!isFinite(beta) || beta <= 0) beta = m;
    return { u: u, xi: xi, beta: beta, nExcess: nEx, tailProb: nEx / n, n: n, valid: true };
  }

  // GPD-based severity VaR/TVaR at overall level alpha (POT closed form).
  function gpdTailMeasures(fit, alpha) {
    if (!fit.valid || alpha <= 1 - fit.tailProb) return { var: null, tvar: null };
    var xi = fit.xi, beta = fit.beta, u = fit.u;
    var v = u + (Math.abs(xi) < 1e-6
      ? beta * Math.log(fit.tailProb / (1 - alpha))
      : (beta / xi) * (Math.pow(fit.tailProb / (1 - alpha), xi) - 1));
    var tvar = xi < 1 ? v / (1 - xi) + (beta - xi * u) / (1 - xi) : v;
    return { var: v, tvar: tvar };
  }

  function gpdSample(rng, xi, beta) {
    var U = 1 - rng();
    return Math.abs(xi) < 1e-6 ? -beta * Math.log(U) : (beta / xi) * (Math.pow(U, -xi) - 1);
  }

  // Severity-AWARE reserve: take the bootstrap IBNR COUNT samples and, for each,
  // draw that many per-claim severities from a spliced distribution (empirical
  // body below the threshold u, GPD tail above it). This propagates severity
  // variability and tail risk into the reserve $ distribution — the count
  // bootstrap alone multiplied by a fixed mean severity did not.
  function reserveDollarSim(countSamples, severities, fit, opts) {
    opts = opts || {};
    var seed = opts.seed || 424242;
    var rng = mulberry32(seed >>> 0);
    var body = [];
    for (var i = 0; i < severities.length; i++) if (severities[i] <= fit.u) body.push(severities[i]);
    if (!body.length) body = severities;
    var m = body.length;
    var dollars = new Array(countSamples.length);
    for (var b = 0; b < countSamples.length; b++) {
      var c = Math.round(countSamples[b]), tot = 0;
      for (var j = 0; j < c; j++) {
        tot += rng() < fit.tailProb ? fit.u + gpdSample(rng, fit.xi, fit.beta) : body[(m * rng()) | 0];
      }
      dollars[b] = tot;
    }
    var mn = mean(dollars), variance = 0;
    for (b = 0; b < dollars.length; b++) variance += Math.pow(dollars[b] - mn, 2);
    return {
      mean: mn, se: Math.sqrt(variance / Math.max(1, dollars.length - 1)),
      p75: quantile(dollars, 0.75), p95: quantile(dollars, 0.95), p99: quantile(dollars, 0.99)
    };
  }

  // ---- 10. Reject inference / censoring ----------------------------------
  // The true outcome is observed only for the `observed` decisions; censoring
  // is informative (rises with the model score, which correlates with error),
  // so the NAIVE observed error rate is biased low. Reject inference fits
  // P(error | score) on the observed decisions (score bins) and IMPUTES the
  // censored ones, recovering an estimate near the true rate — as long as
  // censoring is ignorable given the score (MAR); residual MNAR is a limit.
  function rejectInference(records, bins) {
    var B = bins || 10, i, r;
    var binN = new Array(B).fill(0), binErr = new Array(B).fill(0);
    var n = records.length, obs = 0, obsErr = 0, trueErr = 0;
    for (i = 0; i < n; i++) {
      r = records[i];
      trueErr += r.error;
      if (r.observed) {
        obs++; obsErr += r.error;
        var b = Math.min(B - 1, Math.max(0, Math.floor(r.score * B)));
        binN[b]++; binErr[b] += r.error;
      }
    }
    var rate = binN.map(function (c, j) { return c > 0 ? binErr[j] / c : 0; });
    var overall = obs > 0 ? obsErr / obs : 0;
    var corrected = obsErr;
    for (i = 0; i < n; i++) {
      r = records[i];
      if (!r.observed) {
        var bb = Math.min(B - 1, Math.max(0, Math.floor(r.score * B)));
        corrected += binN[bb] > 0 ? rate[bb] : overall;
      }
    }
    return {
      n: n, observed: obs, censored: n - obs,
      naiveErrors: obsErr, correctedErrors: corrected,
      naiveRate: overall, correctedRate: corrected / n, trueRate: trueErr / n
    };
  }

  // Empirical Bühlmann (Bühlmann-Straub with exposure = decision count):
  // estimate the credibility constant k = EPV / VHM from the cohorts' variance
  // components, instead of leaving k a free dial. cohorts: [{ n, errors }].
  function buhlmannStraubK(cohorts) {
    var I = cohorts.length, totN = 0, totErr = 0, i;
    for (i = 0; i < I; i++) { totN += cohorts[i].n; totErr += cohorts[i].errors; }
    if (totN === 0) return { mu: 0, epv: 0, vhm: 0, k: Infinity };
    var mu = totErr / totN;
    var epv = 0;
    for (i = 0; i < I; i++) { var p = cohorts[i].errors / cohorts[i].n; epv += cohorts[i].n * p * (1 - p); }
    epv = epv / totN;                                   // expected process variance (per decision)
    var num = 0, sumSq = 0;
    for (i = 0; i < I; i++) { var pi = cohorts[i].errors / cohorts[i].n; num += cohorts[i].n * Math.pow(pi - mu, 2); sumSq += cohorts[i].n * cohorts[i].n; }
    var denom = totN - sumSq / totN;
    var vhm = denom > 0 ? (num - (I - 1) * epv) / denom : 0;
    var k = vhm > 0 ? epv / vhm : Infinity;
    return { mu: mu, epv: epv, vhm: vhm, k: k };
  }

  var api = {
    mean: mean, sum: sum, quantile: quantile,
    developmentTriangle: developmentTriangle,
    chainLadder: chainLadder,
    bornhuetterFerguson: bornhuetterFerguson,
    bootstrapReserve: bootstrapReserve,
    fitGPD: fitGPD,
    gpdTailMeasures: gpdTailMeasures,
    reserveDollarSim: reserveDollarSim,
    rejectInference: rejectInference,
    buhlmannStraubK: buhlmannStraubK,
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
