/*
 * sample-data.js — Deterministic synthetic prior-authorization portfolio.
 *
 * Models a Humana-style Medicare Advantage book: ~10,000 AI-assisted
 * prior-authorization / post-acute length-of-stay decisions. Every random
 * draw comes from a SEEDED generator, so the portfolio is byte-for-byte
 * reproducible and the numbers match the framework paper exactly.
 *
 * Record shape:
 *   {
 *     id,            // integer
 *     cohort,        // age band, the unit of A/E monitoring
 *     condition,     // flavour tag (post-acute service line)
 *     score,         // model's confidence that denial is appropriate, [0,1]
 *     expectedRate,  // validation-time expected error rate for the cohort
 *     error,         // 0|1 realized: was the AI decision wrong?
 *     reported,      // 0|1: has this error been surfaced (appeal/audit) yet?
 *     severity       // dollar loss GIVEN an error (0 otherwise carried sep.)
 *   }
 *
 * The `drift` parameter inflates the realized error rate in the oldest
 * cohorts ONLY (model degradation on complex elderly cases). Because each
 * decision's uniform draw is fixed by the seed, raising drift monotonically
 * converts more decisions into errors — smooth, deterministic, reversible.
 * At drift = 0 the realized rate equals the expected rate, so A/E ~ 1.0
 * everywhere (the no-drift invariant).
 */
(function (global) {
  "use strict";

  // mulberry32: tiny, fast, well-distributed seeded PRNG.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Standard normal via Box-Muller (for lognormal severities).
  function randn(rng) {
    var u = 1 - rng(); // (0,1]
    var v = 1 - rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Cohort definitions. expectedRate = validation-time error rate the model
  // was signed off at. sevMu / sevSigma parametrize a lognormal dollar
  // severity (older / sicker cohorts carry heavier tails). drifts: which
  // cohorts degrade in production. weight: share of the book.
  var COHORTS = [
    { cohort: "18-39", weight: 0.10, expectedRate: 0.040, sevMu: 8.20, sevSigma: 0.55, drifts: false },
    { cohort: "40-54", weight: 0.16, expectedRate: 0.050, sevMu: 8.45, sevSigma: 0.60, drifts: false },
    { cohort: "55-64", weight: 0.20, expectedRate: 0.060, sevMu: 8.70, sevSigma: 0.65, drifts: false },
    { cohort: "65-74", weight: 0.26, expectedRate: 0.080, sevMu: 8.95, sevSigma: 0.70, drifts: false },
    { cohort: "75-84", weight: 0.18, expectedRate: 0.110, sevMu: 9.15, sevSigma: 0.80, drifts: true },
    { cohort: "85+",   weight: 0.10, expectedRate: 0.150, sevMu: 9.35, sevSigma: 0.95, drifts: true }
  ];

  var CONDITIONS = ["SNF rehab", "Home health", "Inpatient rehab", "LTAC", "Cardiac post-acute"];

  // Defaults that define the paper's worked example.
  var DEFAULTS = {
    seed: 1242,
    n: 10000,
    drift: 0.35,            // production drift discovered in oldest cohorts
    reportingFraction: 2 / 3 // 2/3 of true errors surfaced so far -> LDF = 1.5
  };

  function pickCohort(u) {
    var acc = 0;
    for (var i = 0; i < COHORTS.length; i++) {
      acc += COHORTS[i].weight;
      if (u <= acc) return COHORTS[i];
    }
    return COHORTS[COHORTS.length - 1];
  }

  // Generate the portfolio. Pass {drift} to stress the oldest cohorts; all
  // other structure is fixed by the seed.
  function generatePortfolio(opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : DEFAULTS.seed;
    var n = opts.n != null ? opts.n : DEFAULTS.n;
    var drift = opts.drift != null ? opts.drift : DEFAULTS.drift;
    var reportingFraction = opts.reportingFraction != null ? opts.reportingFraction : DEFAULTS.reportingFraction;

    var rng = mulberry32(seed);
    var records = new Array(n);

    for (var i = 0; i < n; i++) {
      var c = pickCohort(rng());

      // Effective (realized) error rate: drift lifts only the flagged cohorts.
      var effRate = c.drifts ? c.expectedRate * (1 + drift) : c.expectedRate;
      if (effRate > 0.95) effRate = 0.95;

      var uErr = rng();                 // fixed per decision -> monotone in drift
      var error = uErr < effRate ? 1 : 0;

      // Model score: well-calibrated denials cluster near the decision
      // boundary; errors skew toward over-confident denials.
      var score = error
        ? 0.55 + 0.40 * rng()           // confidently denied, but wrong
        : 0.20 + 0.70 * rng();

      // Lognormal dollar severity for THIS decision (only matters if error).
      var severity = Math.exp(c.sevMu + c.sevSigma * randn(rng));

      // Reporting / ground-truth lag: only a fraction of true errors have
      // surfaced (appeals, audits, retrospective chart review). NOTE: draw
      // the uniform UNCONDITIONALLY so the RNG stream consumes a fixed number
      // of draws per decision. Otherwise drift (which changes error counts)
      // would desynchronize the stream and silently shift non-drift cohorts.
      var repDraw = rng();
      var reported = error && repDraw < reportingFraction ? 1 : 0;

      records[i] = {
        id: i,
        cohort: c.cohort,
        condition: CONDITIONS[Math.floor(rng() * CONDITIONS.length)],
        score: score,
        expectedRate: c.expectedRate,
        error: error,
        reported: reported,
        severity: Math.round(severity)
      };
    }
    return records;
  }

  var api = {
    COHORTS: COHORTS,
    DEFAULTS: DEFAULTS,
    generatePortfolio: generatePortfolio
  };

  global.SampleData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
