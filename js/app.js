/*
 * app.js — "AI Risk Lens" UI wiring (multi-scenario).
 *
 * Generates the deterministic portfolio for the selected SCENARIO, runs the
 * actuarial.js primitives, and renders four Chart.js visuals plus summary
 * cards. Switching the scenario re-skins every label/caption to that domain's
 * language and recomputes. Everything is client-side: no fetch, no backend.
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
    alpha: $("alphaSlider"),
    k: $("kSlider"),
    drift: $("driftSlider"),
    cohort: $("cohortSelect"),
    alphaVal: $("alphaVal"),
    kVal: $("kVal"),
    driftVal: $("driftVal")
  };

  var charts = {};
  var scenario = D.getScenario("prior-auth");

  // ---- Chart.js plugins: VaR/TVaR markers + A/E=1 reference line ----
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
      if (!chart.config.options.plugins.aeReference) return;
      var ctx = chart.ctx, yAxis = chart.scales.y, xAxis = chart.scales.x;
      var y = yAxis.getPixelForValue(1.0);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(xAxis.left, y); ctx.lineTo(xAxis.right, y);
      ctx.lineWidth = 2; ctx.strokeStyle = "#64748b"; ctx.setLineDash([5, 4]); ctx.stroke();
      ctx.fillStyle = "#475569"; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "left";
      ctx.fillText("A/E = 1.0 (as validated)", xAxis.left + 6, y - 5);
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
    return Math.min(hist.counts.length - 1, Math.floor(value / hist.width));
  }

  // ---- scenario plumbing ----
  function populateScenarios() {
    D.SCENARIO_LIST.forEach(function (id) {
      var sc = D.getScenario(id);
      var o = document.createElement("option");
      o.value = id;
      o.textContent = sc.label;
      ctrl.scenario.appendChild(o);
    });
    ctrl.scenario.value = "prior-auth";
  }

  function populateCohorts() {
    ctrl.cohort.innerHTML = "";
    scenario.cohorts.slice()
      .map(function (c) { return c.name; })
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
    $("toolIntro").innerHTML = ui.intro +
      " Numbers are deterministic (fixed seed) and reproduce the paper.";
    $("driftLabelText").textContent = "Production drift";
    $("driftHelp").textContent = "Stresses " + ui.driftWho + ". Set to 0% to see A/E ≈ 1.";
    $("cardSeveritySub").textContent = ui.sevSub;
    $("capLoss").innerHTML = "<span class='tag'>What this means:</span> " + ui.capLoss;
    $("capAE").innerHTML = "<span class='tag'>What this means:</span> " + ui.capAE;
    $("capReserve").innerHTML = "<span class='tag'>What this means:</span> " + ui.capReserve;
    $("sectorBadge").textContent = scenario.sector;
  }

  // ---- main pipeline ----
  function recompute() {
    var alpha = parseFloat(ctrl.alpha.value);
    var k = parseFloat(ctrl.k.value);
    var drift = parseFloat(ctrl.drift.value);

    ctrl.alphaVal.textContent = alpha.toFixed(2);
    ctrl.kVal.textContent = k.toLocaleString("en-US");
    ctrl.driftVal.textContent = Math.round(drift * 100) + "%";

    var records = D.generatePortfolio({ scenario: scenario.id, drift: drift });

    var fs = A.frequencySeverity(records);
    var vt = A.varTvar(fs.losses, alpha);
    var sevVT = A.varTvar(fs.severities, alpha);
    var ae = A.actualToExpected(records.map(function (r) {
      return { cohort: r.cohort, error: r.error, expectedRate: r.expectedRate };
    }));
    ae.rows.sort(function (a, b) { return a.cohort.localeCompare(b.cohort); });

    var reported = records.reduce(function (s, r) { return s + r.reported; }, 0);
    var ldf = 1 / scenario.reportingFraction;
    var ibnr = A.ibnrReserve(reported, ldf, fs.meanSeverity, sevVT.tvar);
    var ec = A.economicCapital(vt.tvar, fs.expectedLoss, fs.n);

    updateCards(fs, vt);
    updateLossChart(fs, vt);
    updateAEChart(ae);
    updateCredibility(ae, fs, k);
    updateReserveCard(fs, vt, sevVT, ibnr, ec, reported, ldf);
  }

  function updateCards(fs, vt) {
    $("cardFrequency").textContent = pct(fs.frequency);
    $("cardErrors").textContent = fs.errorCount.toLocaleString("en-US") + " " +
      scenario.ui.errors + " / " + fs.n.toLocaleString("en-US") + " " + scenario.ui.decisionsShort;
    $("cardSeverity").textContent = money(fs.meanSeverity);
    $("cardExpLoss").textContent = money(fs.expectedLoss);
    $("cardExpLossPort").textContent = moneyShort(fs.expectedLoss * fs.n) + " across the book";
    $("cardVar").textContent = money(vt.var);
    $("cardTvar").textContent = money(vt.tvar);
  }

  function updateLossChart(fs, vt) {
    var hist = histogram(fs.severities, 28);
    var varIdx = binIndexFor(vt.var, hist);
    var tvarIdx = binIndexFor(vt.tvar, hist);
    var data = {
      labels: hist.labels,
      datasets: [{
        label: "Errors by dollar damage",
        data: hist.counts,
        backgroundColor: hist.counts.map(function (_, i) {
          return i >= varIdx ? "rgba(220,38,38,0.75)" : "rgba(37,99,235,0.65)";
        }),
        borderWidth: 0
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
    var data = {
      labels: ae.rows.map(function (r) { return r.cohort; }),
      datasets: [{
        label: "Actual / Expected",
        data: ae.rows.map(function (r) { return r.ae; }),
        backgroundColor: ae.rows.map(function (r) {
          return r.flag ? "rgba(220,38,38,0.8)" : "rgba(22,163,74,0.75)";
        }),
        borderWidth: 0
      }]
    };
    var options = {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, aeReference: true,
        tooltip: { callbacks: { label: function (it) {
          var r = ae.rows[it.dataIndex];
          return "A/E " + r.ae.toFixed(3) + "  (" + r.actual + " actual vs " + r.expected.toFixed(0) + " expected)";
        } } }
      },
      scales: {
        x: { title: { display: true, text: scenario.ui.cohortAxis } },
        y: { title: { display: true, text: "Actual / Expected " + scenario.ui.errors }, beginAtZero: true, suggestedMax: 1.6 }
      }
    };
    if (charts.ae) { charts.ae.data = data; charts.ae.options = options; charts.ae.update(); }
    else charts.ae = new Chart($("aeChart"), { type: "bar", data: data, options: options });
  }

  function updateCredibility(ae, fs, k) {
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

  function updateReserveCard(fs, vt, sevVT, ibnr, ec, reported, ldf) {
    var u = scenario.ui;
    var rows = [
      ["Reported (surfaced) " + u.errors, reported.toLocaleString("en-US")],
      ["Loss-development factor (LDF)", ldf.toFixed(2)],
      ["Estimated ultimate " + u.errors, Math.round(ibnr.ultimateCount).toLocaleString("en-US")],
      ["IBNR (not-yet-surfaced) " + u.errors, Math.round(ibnr.ibnrCount).toLocaleString("en-US")],
      ["IBNR best estimate", money(ibnr.bestEstimate)],
      ["Risk margin (to tail severity)", money(ibnr.riskMargin)],
      ["<strong>Reserve to hold</strong>", "<strong>" + money(ibnr.reserve) + "</strong>"],
      ["Tail severity TVaR (per " + u.error + ")", money(sevVT.tvar)],
      ["Economic capital / " + u.decisionsShort.replace(/s$/, ""), money(ec.perDecision)],
      ["<strong>Economic capital (undiversified book)</strong>", "<strong>" + moneyShort(ec.portfolio) + "</strong>"]
    ];
    $("reserveTable").innerHTML = rows.map(function (r) {
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

  // ---- wire up ----
  populateScenarios();
  ctrl.scenario.addEventListener("change", switchScenario);
  ["alpha", "k", "drift"].forEach(function (key) {
    ctrl[key].addEventListener("input", recompute);
  });
  ctrl.cohort.addEventListener("change", recompute);
  $("resetBtn").addEventListener("click", function () {
    ctrl.alpha.value = 0.95;
    ctrl.k.value = 2500;
    ctrl.drift.value = scenario.drift;
    ctrl.cohort.value = scenario.ui.defaultCredCohort;
    recompute();
  });

  // initial render
  populateCohorts();
  applyScenarioText();
  recompute();
})();
