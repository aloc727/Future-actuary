/*
 * app.js — "AI Risk Lens" UI wiring (multi-scenario, dependence-aware).
 *
 * Generates the deterministic portfolio for the selected SCENARIO (cached, so
 * it regenerates only when the scenario or drift changes), runs the
 * actuarial.js primitives, runs a seeded aggregate Monte-Carlo for
 * dependence-aware economic capital, and renders the Chart.js visuals plus
 * summary cards. All client-side: no fetch, no backend.
 */
(function () {
  "use strict";

  var A = window.Actuarial;
  var D = window.SampleData;

  function money(x) { return "$" + Math.round(x).toLocaleString("en-US"); }
  function moneyShort(x) {
    if (Math.abs(x) >= 1e6) return "$" + (x / 1e6).toFixed(2) + "M";
    if (Math.abs(x) >= 1e3) return "$" + (x / 1e3).toFixed(1) + "k";
    return "$" + Math.round(x);
  }
  function pct(x) { return (100 * x).toFixed(2) + "%"; }
  function $(id) { return document.getElementById(id); }

  var ctrl = {
    scenario: $("scenarioSelect"),
    alpha: $("alphaSlider"), k: $("kSlider"), drift: $("driftSlider"), rho: $("rhoSlider"),
    cohort: $("cohortSelect"),
    alphaVal: $("alphaVal"), kVal: $("kVal"), driftVal: $("driftVal"), rhoVal: $("rhoVal")
  };

  var charts = {};
  var scenario = D.getScenario("prior-auth");
  var SIMS = 2000;

  // Cache the generated book + its frequency/severity decomposition; these
  // depend only on (scenario, drift), not on alpha/k/rho.
  function simSeed() { return (scenario.seed * 2654435761) >>> 0; }

  var cache = { key: null };
  function getBook(drift) {
    var key = scenario.id + "|" + drift;
    if (cache.key !== key) {
      var recs = D.generatePortfolio({ scenario: scenario.id, drift: drift });
      var fs = A.frequencySeverity(recs);
      var P = D.DEV_PERIODS;
      var tri = A.developmentTriangle(recs, P);
      var cl = A.chainLadder(tri);
      var apriori = new Array(P).fill(0);
      recs.forEach(function (r) { apriori[r.accPeriod] += r.expectedRate; });
      var bf = A.bornhuetterFerguson(tri, cl, apriori);
      var boot = A.bootstrapReserve(tri, cl, { B: 1200, seed: simSeed() });
      var gpd = A.fitGPD(fs.severities, 0.90);
      var reserveDollar = A.reserveDollarSim(boot.samples, fs.severities, gpd, { seed: (simSeed() ^ 0x5bd1e995) >>> 0 });
      var surfaced = recs.reduce(function (s, r) { return s + (r.surfaced || 0); }, 0);
      var kcoh = {};
      recs.forEach(function (r) { (kcoh[r.cohort] = kcoh[r.cohort] || { n: 0, errors: 0 }); kcoh[r.cohort].n++; kcoh[r.cohort].errors += r.error; });
      var kHat = A.buhlmannStraubK(Object.keys(kcoh).map(function (c) { return kcoh[c]; }));
      var ri = A.rejectInference(recs);
      cache = { key: key, records: recs, fs: fs, tri: tri, cl: cl, bf: bf, boot: boot, gpd: gpd, reserveDollar: reserveDollar, surfaced: surfaced, kHat: kHat, ri: ri };
    }
    return cache;
  }

  // ---- Chart.js plugins ----
  var verticalMarkers = {
    id: "verticalMarkers",
    afterDatasetsDraw: function (chart) {
      var markers = chart.config.options.plugins.verticalMarkers &&
                    chart.config.options.plugins.verticalMarkers.lines;
      if (!markers) return;
      var ctx = chart.ctx, xAxis = chart.scales.x, yAxis = chart.scales.y;
      markers.forEach(function (m) {
        if (m.binIndex == null) return;
        var x = xAxis.getPixelForValue(m.binIndex);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(x, yAxis.top); ctx.lineTo(x, yAxis.bottom);
        ctx.lineWidth = 2; ctx.strokeStyle = m.color; ctx.setLineDash([6, 4]); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = m.color;
        ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(m.label, x, yAxis.top + 12);
        ctx.restore();
      });
    }
  };
  var aeReference = {
    id: "aeReference",
    afterDatasetsDraw: function (chart) {
      var cfg = chart.config.options.plugins.aeReference;
      if (!cfg) return;
      var ctx = chart.ctx, yAxis = chart.scales.y, xAxis = chart.scales.x;
      var y = yAxis.getPixelForValue(1.0);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(xAxis.left, y); ctx.lineTo(xAxis.right, y);
      ctx.lineWidth = 2; ctx.strokeStyle = "#64748b"; ctx.setLineDash([5, 4]); ctx.stroke();
      ctx.fillStyle = "#475569"; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "left";
      ctx.fillText("A/E = 1.0 (as validated)", xAxis.left + 6, y - 5);
      // 95% Poisson control-limit whiskers per cohort
      var rows = cfg.rows || [];
      var meta = chart.getDatasetMeta(0);
      rows.forEach(function (r, i) {
        var bar = meta.data[i]; if (!bar) return;
        var yLo = yAxis.getPixelForValue(r.ciLow), yHi = yAxis.getPixelForValue(r.ciHigh);
        ctx.strokeStyle = "#334155"; ctx.lineWidth = 1.5; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(bar.x, yHi); ctx.lineTo(bar.x, yLo);
        ctx.moveTo(bar.x - 5, yHi); ctx.lineTo(bar.x + 5, yHi);
        ctx.moveTo(bar.x - 5, yLo); ctx.lineTo(bar.x + 5, yLo);
        ctx.stroke();
      });
      ctx.restore();
    }
  };
  Chart.register(verticalMarkers, aeReference);

  function histogram(values, nbins) {
    if (!values.length) return { labels: [], counts: [], edges: [], width: 1, top: 1 };
    var top = A.quantile(values, 0.99);
    var width = top / nbins || 1;
    var counts = new Array(nbins).fill(0);
    var edges = [];
    for (var b = 0; b <= nbins; b++) edges.push(b * width);
    for (var i = 0; i < values.length; i++) {
      var idx = Math.min(nbins - 1, Math.floor(values[i] / width));
      counts[idx]++;
    }
    var labels = [];
    for (var j = 0; j < nbins; j++) labels.push(moneyShort(edges[j]));
    return { labels: labels, counts: counts, edges: edges, width: width, top: top };
  }
  function binIndexFor(value, hist) {
    return Math.min(hist.counts.length - 1, Math.max(0, Math.floor(value / hist.width)));
  }

  function populateScenarios() {
    D.SCENARIO_LIST.forEach(function (id) {
      var sc = D.getScenario(id);
      var o = document.createElement("option");
      o.value = id; o.textContent = sc.label;
      ctrl.scenario.appendChild(o);
    });
    ctrl.scenario.value = "prior-auth";
  }

  function populateCohorts() {
    ctrl.cohort.innerHTML = "";
    scenario.cohorts.slice().map(function (c) { return c.name; })
      .sort(function (a, b) { return a.localeCompare(b); })
      .forEach(function (name) {
        var o = document.createElement("option");
        o.value = name; o.textContent = name;
        ctrl.cohort.appendChild(o);
      });
    ctrl.cohort.value = scenario.ui.defaultCredCohort;
  }

  function applyScenarioText() {
    var ui = scenario.ui;
    $("toolIntro").innerHTML = ui.intro + " Numbers are deterministic (fixed seed) and reproduce the paper.";
    $("driftHelp").textContent = "Stresses " + ui.driftWho + ". Set to 0% to see A/E ≈ 1.";
    $("cardSeveritySub").textContent = ui.sevSub;
    $("capLoss").innerHTML = "<span class='tag'>What this means:</span> " + ui.capLoss;
    $("capAE").innerHTML = "<span class='tag'>What this means:</span> " + ui.capAE +
      " Whiskers are the 95% Poisson control band; a cohort is flagged only when it is outside the band <em>and</em> materially off 1.0.";
    $("capReserve").innerHTML = "<span class='tag'>What this means:</span> " + ui.capReserve;
    $("sectorBadge").textContent = scenario.sector;
  }

  function recompute() {
    var alpha = parseFloat(ctrl.alpha.value);
    var k = parseFloat(ctrl.k.value);
    var drift = parseFloat(ctrl.drift.value);
    var rho = parseFloat(ctrl.rho.value);

    ctrl.alphaVal.textContent = alpha.toFixed(2);
    ctrl.kVal.textContent = k.toLocaleString("en-US");
    ctrl.driftVal.textContent = Math.round(drift * 100) + "%";
    ctrl.rhoVal.textContent = rho.toFixed(2);

    var book = getBook(drift);
    var fs = book.fs;
    var vt = A.varTvar(fs.losses, alpha);
    var sevVT = A.varTvar(fs.severities, alpha);
    var ae = A.actualToExpected(book.records.map(function (r) {
      return { cohort: r.cohort, error: r.error, expectedRate: r.expectedRate };
    }));
    ae.rows.sort(function (a, b) { return a.cohort.localeCompare(b.cohort); });

    var reported = book.records.reduce(function (s, r) { return s + r.reported; }, 0);
    var ldf = 1 / scenario.reportingFraction;
    var ibnr = A.ibnrReserve(reported, ldf, fs.meanSeverity, sevVT.tvar);
    var ec = A.economicCapital(vt.tvar, fs.expectedLoss, fs.n);
    var agg = A.aggregateLossSim(fs.severities, fs.frequency, fs.n,
      { alpha: alpha, rho: rho, sims: SIMS, seed: simSeed() });

    updateCards(fs, vt, alpha);
    updateLossChart(fs, vt);
    updateAEChart(ae);
    updateCredibility(ae, fs, k, book.kHat);
    updateReserveCard(fs, vt, sevVT, ibnr, ec, agg, reported, ldf, rho);
    updateReservingDetail(book, fs.meanSeverity);
    updateCensoring(book);
  }

  function updateCensoring(book) {
    var ri = book.ri, u = scenario.ui;
    var data = {
      labels: ["Naive observed", "Reject-inference", "True (ground truth)"],
      datasets: [{
        data: [100 * ri.naiveRate, 100 * ri.correctedRate, 100 * ri.trueRate],
        backgroundColor: ["rgba(217,119,6,0.85)", "rgba(37,99,235,0.85)", "rgba(22,163,74,0.85)"],
        borderWidth: 0
      }]
    };
    var options = {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (it) { return it.parsed.y.toFixed(2) + "% " + u.error + " rate"; } } }
      },
      scales: { y: { title: { display: true, text: u.error + " rate (%)" }, beginAtZero: true } }
    };
    if (charts.cens) { charts.cens.data = data; charts.cens.options = options; charts.cens.update(); }
    else charts.cens = new Chart($("censChart"), { type: "bar", data: data, options: options });

    $("censTable").innerHTML = [
      ["Observed (outcome known)", ri.observed.toLocaleString("en-US") + " of " + ri.n.toLocaleString("en-US")],
      ["Censored (never observed)", ri.censored.toLocaleString("en-US")],
      ["Naive observed rate (biased low)", pct(ri.naiveRate)],
      ["<strong>Reject-inference estimate</strong>", "<strong>" + pct(ri.correctedRate) + "</strong>"],
      ["True rate (ground truth)", pct(ri.trueRate)]
    ].map(function (r) { return "<tr><td>" + r[0] + "</td><td class='text-end'>" + r[1] + "</td></tr>"; }).join("");
  }

  function updateCards(fs, vt, alpha) {
    $("cardFrequency").textContent = pct(fs.frequency);
    $("cardErrors").textContent = fs.errorCount.toLocaleString("en-US") + " " +
      scenario.ui.errors + " / " + fs.n.toLocaleString("en-US") + " " + scenario.ui.decisionsShort;
    $("cardSeverity").textContent = money(fs.meanSeverity);
    $("cardExpLoss").textContent = money(fs.expectedLoss);
    $("cardExpLossPort").textContent = moneyShort(fs.expectedLoss * fs.n) + " across the book";
    $("cardVar").textContent = money(vt.var);
    $("cardTvar").textContent = money(vt.tvar);
    // Low-alpha guard: if VaR sits in the correct-decision point mass, say so.
    var note = $("alphaNote");
    if (note) {
      if (vt.var <= 0) {
        note.textContent = "α is below the error rate, so VaR sits in the correct-decision mass (VaR ≈ $0). Raise α above " + (1 - fs.frequency).toFixed(2) + " to size the error tail.";
        note.style.display = "";
      } else { note.style.display = "none"; }
    }
  }

  function updateLossChart(fs, vt) {
    var hist = histogram(fs.severities, 28);
    var varIdx = binIndexFor(vt.var, hist);
    var tvarIdx = binIndexFor(vt.tvar, hist);
    var data = {
      labels: hist.labels,
      datasets: [{
        label: "Errors by dollar damage", data: hist.counts,
        backgroundColor: hist.counts.map(function (_, i) {
          return i >= varIdx ? "rgba(220,38,38,0.75)" : "rgba(37,99,235,0.65)";
        }), borderWidth: 0
      }]
    };
    var options = {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: function (it) { return "loss ≈ " + it[0].label; } } },
        verticalMarkers: { lines: [
          { binIndex: varIdx, color: "#b91c1c", label: "VaR " + moneyShort(vt.var) },
          { binIndex: tvarIdx, color: "#7f1d1d", label: "TVaR " + moneyShort(vt.tvar) }
        ] }
      },
      scales: {
        x: { title: { display: true, text: "dollar loss per " + scenario.ui.error },
             ticks: { maxRotation: 60, minRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
        y: { title: { display: true, text: "number of " + scenario.ui.errors }, beginAtZero: true }
      }
    };
    if (charts.loss) { charts.loss.data = data; charts.loss.options = options; charts.loss.update(); }
    else charts.loss = new Chart($("lossChart"), { type: "bar", data: data, options: options });
  }

  function updateAEChart(ae) {
    var maxAE = Math.max.apply(null, ae.rows.map(function (r) { return r.ciHigh; }).concat([1.6]));
    var data = {
      labels: ae.rows.map(function (r) { return r.cohort; }),
      datasets: [{
        label: "Actual / Expected",
        data: ae.rows.map(function (r) { return r.ae; }),
        backgroundColor: ae.rows.map(function (r) {
          return r.flag ? "rgba(220,38,38,0.8)" : "rgba(22,163,74,0.75)";
        }), borderWidth: 0
      }]
    };
    var options = {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, aeReference: { rows: ae.rows },
        tooltip: { callbacks: { label: function (it) {
          var r = ae.rows[it.dataIndex];
          return [
            "A/E " + r.ae.toFixed(3) + "  (" + r.actual + " actual vs " + r.expected.toFixed(0) + " expected)",
            "95% control band: " + r.ciLow.toFixed(2) + "–" + r.ciHigh.toFixed(2) + "  (z = " + r.z.toFixed(1) + ")",
            r.flag ? "⚠ flagged: significant & material" : "within tolerance"
          ];
        } } }
      },
      scales: {
        x: { title: { display: true, text: scenario.ui.cohortAxis } },
        y: { title: { display: true, text: "Actual / Expected " + scenario.ui.errors },
             beginAtZero: true, suggestedMax: Math.max(1.6, maxAE * 1.05) }
      }
    };
    if (charts.ae) { charts.ae.data = data; charts.ae.options = options; charts.ae.update(); }
    else charts.ae = new Chart($("aeChart"), { type: "bar", data: data, options: options });
  }

  function updateCredibility(ae, fs, k, kHat) {
    var kn = $("kHatNote");
    if (kn) {
      if (kHat && isFinite(kHat.k)) {
        kn.innerHTML = "Data-driven estimate: <strong>k̂ ≈ " + Math.round(kHat.k).toLocaleString("en-US") +
          "</strong> (empirical Bühlmann-Straub). <a href='#' id='useKhat'>Use k̂</a>";
      } else {
        kn.innerHTML = "Data-driven estimate: cohorts nearly homogeneous ⇒ k̂ → ∞ (little own-experience credibility).";
      }
    }
    var cohortName = ctrl.cohort.value || scenario.ui.defaultCredCohort;
    var row = ae.rows.filter(function (r) { return r.cohort === cohortName; })[0] || ae.rows[0];
    var observed = row.actual / row.n;
    var cred = A.buhlmannCredibility(row.n, observed, fs.frequency, k);
    var data = {
      labels: ["Own experience (Z)", "Base rate (1−Z)"],
      datasets: [{ data: [cred.Z, 1 - cred.Z],
        backgroundColor: ["rgba(37,99,235,0.85)", "rgba(203,213,225,0.85)"], borderWidth: 0 }]
    };
    var options = {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: { legend: { position: "bottom" },
        tooltip: { callbacks: { label: function (it) { return it.label + ": " + (100 * it.parsed).toFixed(1) + "%"; } } } }
    };
    if (charts.cred) { charts.cred.data = data; charts.cred.options = options; charts.cred.update(); }
    else charts.cred = new Chart($("credChart"), { type: "doughnut", data: data, options: options });

    $("credZ").textContent = "Z = " + cred.Z.toFixed(3);
    $("credDetail").innerHTML =
      scenario.ui.cohortNoun.replace(/^\w/, function (c) { return c.toUpperCase(); }) +
      " <strong>" + cohortName + "</strong> · n = " + row.n.toLocaleString("en-US") +
      "<br>Raw observed " + scenario.ui.error + " rate: <strong>" + pct(observed) + "</strong>" +
      "<br>Portfolio base rate: " + pct(fs.frequency) +
      "<br>Credibility-weighted estimate: <strong>" + pct(cred.estimate) + "</strong>";
  }

  function updateReserveCard(fs, vt, sevVT, ibnr, ec, agg, reported, ldf, rho) {
    var u = scenario.ui;
    var rows = [
      ["Reported (surfaced) " + u.errors, reported.toLocaleString("en-US")],
      ["Loss-development factor (LDF)", ldf.toFixed(2)],
      ["Estimated ultimate " + u.errors, Math.round(ibnr.ultimateCount).toLocaleString("en-US")],
      ["IBNR (not-yet-surfaced) " + u.errors, Math.round(ibnr.ibnrCount).toLocaleString("en-US")],
      ["<strong>Reserve — tail-loaded (conservative)</strong>", "<strong>" + money(ibnr.reserve) + "</strong>"],
      ["&nbsp;", "&nbsp;"],
      ["Tail severity TVaR (per " + u.error + ")", money(sevVT.tvar)],
      ["<strong>Economic capital, aggregate (ρ = " + rho.toFixed(2) + ")</strong>", "<strong>" + moneyShort(agg.ec) + "</strong>"],
      ["&nbsp;· independent (ρ = 0)", moneyShort(A.aggregateLossSim(fs.severities, fs.frequency, fs.n, { alpha: vt.alpha, rho: 0, sims: SIMS, seed: simSeed() }).ec)],
      ["&nbsp;· undiversified upper bound", moneyShort(ec.portfolio)]
    ];
    $("reserveTable").innerHTML = rows.map(function (r) {
      return "<tr><td>" + r[0] + "</td><td class='text-end'>" + r[1] + "</td></tr>";
    }).join("");
  }

  function renderTriangle(tri) {
    var P = tri.P, cum = tri.cum, a, d;
    var h = "<table class='tri'><thead><tr><th>acc\\dev</th>";
    for (d = 0; d < P; d++) h += "<th>" + d + "</th>";
    h += "</tr></thead><tbody>";
    for (a = 0; a < P; a++) {
      h += "<tr><th>" + a + "</th>";
      for (d = 0; d < P; d++) {
        var v = cum[a][d], latest = (a + d === P - 1);
        h += "<td class='" + (v == null ? "fut" : "") + (latest ? " diag" : "") + "'>" + (v == null ? "·" : v) + "</td>";
      }
      h += "</tr>";
    }
    return h + "</tbody></table>";
  }

  function updateReservingDetail(book, meanSev) {
    var cl = book.cl, bf = book.bf, boot = book.boot, rd = book.reserveDollar, gpd = book.gpd, u = scenario.ui;
    $("triTable").innerHTML = renderTriangle(book.tri);
    var gTvar = A.gpdTailMeasures(gpd, 0.95).tvar;
    var empTvar = A.varTvar(book.fs.severities, 0.95).tvar;
    var rows = [
      ["Reported to date (latest diagonal)", Math.round(cl.reportedTotal).toLocaleString("en-US") + " " + u.errors],
      ["Chain-ladder ultimate", Math.round(cl.ultimateTotal).toLocaleString("en-US")],
      ["Bornhuetter-Ferguson ultimate", Math.round(bf.ultimateTotal).toLocaleString("en-US")],
      ["Bootstrap IBNR (mean ± SE)", Math.round(boot.mean).toLocaleString("en-US") + " ± " + Math.round(boot.se).toLocaleString("en-US") + " (CV " + Math.round(100 * boot.cv) + "%)"],
      ["Severity tail: GPD shape ξ̂", gpd.xi.toFixed(2) + (gpd.xi > 0.05 ? " (heavy)" : " (≈ exponential)")],
      ["&nbsp;· severity TVaR₉₅ (empirical / GPD)", money(empTvar) + " / " + (gTvar ? money(gTvar) : "—")],
      ["<strong>Best-estimate reserve (severity-aware)</strong>", "<strong>" + money(rd.mean) + "</strong>"],
      ["Reserve @ 75th pctile (IFRS 17 margin)", money(rd.p75)],
      ["Reserve @ 95th pctile", money(rd.p95)],
      ["Reserve @ 99th pctile", money(rd.p99)]
    ];
    $("reserveDetailTable").innerHTML = rows.map(function (r) {
      return "<tr><td>" + r[0] + "</td><td class='text-end'>" + r[1] + "</td></tr>";
    }).join("");
  }

  function switchScenario() {
    scenario = D.getScenario(ctrl.scenario.value);
    ctrl.drift.value = scenario.drift;
    populateCohorts();
    applyScenarioText();
    recompute();
  }

  // Debounce slider input to one recompute per animation frame.
  var pending = false;
  function scheduleRecompute() {
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || function (f) { setTimeout(f, 16); })(function () {
      pending = false; recompute();
    });
  }

  // ---- wire up ----
  populateScenarios();
  ctrl.scenario.addEventListener("change", switchScenario);
  ["alpha", "k", "drift", "rho"].forEach(function (key) {
    ctrl[key].addEventListener("input", scheduleRecompute);
  });
  ctrl.cohort.addEventListener("change", recompute);
  // Delegated handler for the regenerated "Use k̂" link.
  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "useKhat") {
      e.preventDefault();
      var kHat = cache.kHat;
      if (kHat && isFinite(kHat.k)) {
        var kv = Math.max(10, Math.min(8000, Math.round(kHat.k)));
        ctrl.k.value = kv; recompute();
      }
    }
  });
  $("resetBtn").addEventListener("click", function () {
    ctrl.alpha.value = 0.95; ctrl.k.value = 2500;
    ctrl.drift.value = scenario.drift; ctrl.rho.value = 0.15;
    ctrl.cohort.value = scenario.ui.defaultCredCohort;
    recompute();
  });

  populateCohorts();
  applyScenarioText();
  recompute();
})();
