/*
 * actuarial.js — Pure, dependency-free actuarial measurement functions.
 *
 * These are the "AI Risk Lens" primitives. Each function takes plain numbers
 * or arrays and returns plain objects. No DOM, no globals, no randomness:
 * the same inputs always produce the same outputs, so the interactive tool
 * and the framework paper report identical numbers.
 *
 * Works in the browser (attaches to window.Actuarial) and in Node
 * (module.exports) so the verification harness can re-derive every figure.
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
  // p in [0,1]. We sort a copy so callers don't have to.
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

  // ---- 1. Frequency x Severity loss model --------------------------------
  // Instead of a single accuracy number, decompose risk into how OFTEN the
  // model errs (frequency) x how BADLY each error hurts (severity), and roll
  // them up into a per-decision expected loss and a full loss distribution.
  //
  // records: array of { error: 0|1, severity: number }  (severity = dollar
  // loss GIVEN an error; the per-decision loss is error ? severity : 0).
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
    var frequency = n ? errorCount / n : 0;       // P(error)
    var meanSeverity = mean(severities);          // E[loss | error]
    var expectedLoss = mean(losses);              // E[loss] = freq * meanSev
    return {
      n: n,
      errorCount: errorCount,
      frequency: frequency,
      meanSeverity: meanSeverity,
      expectedLoss: expectedLoss,
      losses: losses,
      severities: severities
    };
  }

  // ---- 2. Buhlmann / limited-fluctuation credibility ---------------------
  // How much weight does THIS cohort's own experience deserve versus the
  // portfolio base rate? Z = n / (n + k). The credibility-weighted estimate
  // blends the cohort's observed rate with the prior:
  //     est = Z * observed + (1 - Z) * prior
  // Z rises monotonically toward 1 as experience n grows.
  function buhlmannCredibility(n, observedRate, priorRate, k) {
    var Z = n / (n + k);
    var estimate = Z * observedRate + (1 - Z) * priorRate;
    return { n: n, k: k, Z: Z, observedRate: observedRate, priorRate: priorRate, estimate: estimate };
  }

  // ---- 3. Actual-to-Expected (A/E) experience study ----------------------
  // Cohort-level drift / miscalibration monitoring. For each cohort:
  //     A/E = actual errors / expected errors
  // where expected = cohort exposure x the validation-time expected rate.
  // A/E ~ 1.0 means the model still behaves as validated; A/E materially
  // above 1.0 flags a cohort where reality has drifted from the model.
  //
  // records: [{ cohort, error, expectedRate }]
  // flagThreshold: relative departure from 1.0 that we call "material".
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
      c.flag = Math.abs(c.ae - 1) > flagThreshold;
      return c;
    });
    // Portfolio-level A/E
    var totA = sum(rows.map(function (r) { return r.actual; }));
    var totE = sum(rows.map(function (r) { return r.expected; }));
    return { rows: rows, portfolioAE: totE > 0 ? totA / totE : 0, totalActual: totA, totalExpected: totE };
  }

  // ---- 4. VaR / TVaR (CTE) -----------------------------------------------
  // Size the catastrophic tail that a single "95% confidence" number throws
  // away. VaR_alpha = the alpha-quantile of the per-decision loss
  // distribution. TVaR_alpha (a.k.a. CTE) = the MEAN loss in the tail at or
  // beyond VaR_alpha — the average cost of a bad day, not just its threshold.
  // Invariant: TVaR_alpha >= VaR_alpha always.
  function varTvar(losses, alpha) {
    var v = quantile(losses, alpha);
    var tail = [];
    for (var i = 0; i < losses.length; i++) {
      if (losses[i] >= v) tail.push(losses[i]);
    }
    var t = tail.length ? mean(tail) : v;
    if (t < v) t = v; // numerical guard for the invariant
    return { alpha: alpha, var: v, tvar: t, tailCount: tail.length };
  }

  // ---- 5. IBNR reserve (development-factor analog) -----------------------
  // "Incurred but not reported" MODEL FAILURES. Ground truth lags: many
  // errors are already baked in but not yet surfaced (appeals, audits,
  // delayed outcomes). Apply a loss-development factor (LDF) to the errors
  // reported so far to estimate the ULTIMATE error count, then reserve the
  // gap. A risk margin loads the best estimate up to a tail (TVaR) severity.
  //
  //   ultimateCount = reportedCount * ldf
  //   ibnrCount     = ultimateCount - reportedCount      (>= 0 since ldf>=1)
  //   bestEstimate  = ibnrCount * meanSeverity
  //   riskMargin    = ibnrCount * (tvarSeverity - meanSeverity)
  //   reserve       = bestEstimate + riskMargin = ibnrCount * tvarSeverity
  function ibnrReserve(reportedCount, ldf, meanSeverity, tvarSeverity) {
    if (ldf < 1) ldf = 1; // development factors are >= 1 by construction
    var ultimateCount = reportedCount * ldf;
    var ibnrCount = Math.max(0, ultimateCount - reportedCount);
    var bestEstimate = ibnrCount * meanSeverity;
    var riskMargin = ibnrCount * Math.max(0, tvarSeverity - meanSeverity);
    var reserve = Math.max(0, bestEstimate + riskMargin);
    return {
      reportedCount: reportedCount,
      ldf: ldf,
      ultimateCount: ultimateCount,
      ibnrCount: ibnrCount,
      bestEstimate: bestEstimate,
      riskMargin: riskMargin,
      reserve: reserve
    };
  }

  // ---- 6. Economic capital -----------------------------------------------
  // The buffer to hold against AI tail risk, over and above the loss you
  // already expect: EC = TVaR_alpha - expected loss. Stated per decision and
  // scaled to the whole book of `exposure` decisions.
  function economicCapital(tvar, expectedLoss, exposure) {
    var perDecision = Math.max(0, tvar - expectedLoss);
    return {
      perDecision: perDecision,
      portfolio: perDecision * (exposure || 1),
      tvar: tvar,
      expectedLoss: expectedLoss,
      exposure: exposure || 1
    };
  }

  var api = {
    mean: mean,
    sum: sum,
    quantile: quantile,
    frequencySeverity: frequencySeverity,
    buhlmannCredibility: buhlmannCredibility,
    actualToExpected: actualToExpected,
    varTvar: varTvar,
    ibnrReserve: ibnrReserve,
    economicCapital: economicCapital
  };

  global.Actuarial = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
