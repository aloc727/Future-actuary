/*
 * app.js — "AI Risk Lens" UI wiring.
 *
 * Generates the deterministic portfolio, runs the actuarial.js primitives,
 * and renders four Chart.js visuals plus summary cards. Everything is
 * client-side: no fetch, no backend. Moving the alpha / k / drift controls
 * re-runs the whole pipeline live.
 */
(function () {
  "use strict";

  var A = window.Actuarial;
  var D = window.SampleData;

  // ---- formatting helpers ----
  function money(x) {
    return "$" + Math.round(x).toLocaleString("en-US");
  }
  function moneyShort(x) {
    if (Math.abs(x) >= 1e6) return "$" + (x / 1e6).toFixed(2) + "M";
    if (Math.abs(x) >= 1e3) return "$" + (x / 1e3).toFixed(1) + "k";
    return "$" + Math.round(x);
  }
  function pct(x) {
    return (100 * x).toFixed(2) + "%";
  }

  // ---- DOM cache ----
  function $(id) { return document.getElementById(id); }

  var ctrl = {
    alpha: $("alphaSlider"),
    k: $("kSlider"),
    drift: $("driftSlider"),
    cohort: $("cohortSelect"),
    alphaVal: $("alphaVal"),
    kVal: $("kVal"),
    driftVal: $("driftVal")
  };

  var charts = {};

  // Vertical-marker plugin for the loss histogram (draws VaR / TVaR lines).
  var verticalMarkers = {
    id: "verticalMarkers",
    afterDatasetsDraw: function (chart) {
      var markers = chart.config.options.plugins.verticalMarkers &&
                    chart.config.options.plugins.verticalMarkers.lines;
      if (!markers) return;
      var ctx = chart.ctx;
      var xAxis = chart.scales.x;
      var yAxis = chart.scales.y;
      markers.forEach(function (m) {
        // map dollar value -> nearest category index on the bar chart
        var idx = m.binIndex;
        if (idx == null) return;
        var x = xAxis.getPixelForValue(idx);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, yAxis.top);
        ctx.lineTo(x, yAxis.bottom);
        ctx.lineWidth = 2;
        ctx.strokeStyle = m.color;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = m.color;
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(m.label, x, yAxis.top + 12);
        ctx.restore();
      });
    }
  };

  // Horizontal reference line at A/E = 1.0.
  var aeReference = {
    id: "aeReference",
    afterDatasetsDraw: function (chart) {
      if (!chart.config.options.plugins.aeReference) return;
      var ctx = chart.ctx;
      var yAxis = chart.scales.y;
      var xAxis = chart.scales.x;
      var y = yAxis.getPixelForValue(1.0);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xAxis.left, y);
      ctx.lineTo(xAxis.right, y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#64748b";
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.fillStyle = "#475569";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("A/E = 1.0 (as validated)", xAxis.left + 6, y - 5);
      ctx.restore();
    }
  };

  Chart.register(verticalMarkers, aeReference);

  // Build histogram bins over the nonzero loss (severity) distribution.
  function histogram(values, nbins) {
    if (!values.length) return { labels: [], counts: [], edges: [] };
    var max = Math.max.apply(null, values);
    // cap the top edge at the 99th percentile so the tail doesn't flatten it
    var top = A.quantile(values, 0.99);
    var width = top / nbins;
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

  function populateCohorts(rows) {
    if (ctrl.cohort.options.length) return; // populate once
    rows.slice().sort(function (a, b) { return a.cohort.localeCompare(b.cohort); })
      .forEach(function (r) {
        var o = document.createElement("option");
        o.value = r.cohort;
        o.textContent = r.cohort;
        ctrl.cohort.appendChild(o);
      });
    ctrl.cohort.value = "85+"; // most interesting cohort by default
  }

  // ---- main pipeline ----
  function recompute() {
    var alpha = parseFloat(ctrl.alpha.value);
    var k = parseFloat(ctrl.k.value);
    var drift = parseFloat(ctrl.drift.value);

    ctrl.alphaVal.textContent = alpha.toFixed(2);
    ctrl.kVal.textContent = k.toLocaleString("en-US");
    ctrl.driftVal.textContent = Math.round(drift * 100) + "%";

    var records = D.generatePortfolio({ drift: drift });

    var fs = A.frequencySeverity(records);
    var vt = A.varTvar(fs.losses, alpha);
    var sevVT = A.varTvar(fs.severities, alpha);
    var ae = A.actualToExpected(records.map(function (r) {
      return { cohort: r.cohort, error: r.error, expectedRate: r.expectedRate };
    }));
    ae.rows.sort(function (a, b) { return a.cohort.localeCompare(b.cohort); });

    var reported = records.reduce(function (s, r) { return s + r.reported; }, 0);
    var ldf = 1 / D.DEFAULTS.reportingFraction;
    var ibnr = A.ibnrReserve(reported, ldf, fs.meanSeverity, sevVT.tvar);
    var ec = A.economicCapital(vt.tvar, fs.expectedLoss, fs.n);

    populateCohorts(ae.rows);

    updateCards(fs, vt, ibnr, ec);
    updateLossChart(fs, vt);
    updateAEChart(ae);
    updateCredibility(ae, fs, k);
    updateReserveCard(fs, vt, sevVT, ibnr, ec, reported, ldf);
  }

  function updateCards(fs, vt, ibnr, ec) {
    $("cardFrequency").textContent = pct(fs.frequency);
    $("cardErrors").textContent = fs.errorCount.toLocaleString("en-US") + " errors / " + fs.n.toLocaleString("en-US");
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
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: function (it) { return "loss ≈ " + it[0].label; } } },
        verticalMarkers: {
          lines: [
            { binIndex: varIdx, color: "#b91c1c", label: "VaR " + moneyShort(vt.var) },
            { binIndex: tvarIdx, color: "#7f1d1d", label: "TVaR " + moneyShort(vt.tvar) }
          ]
        }
      },
      scales: {
        x: { title: { display: true, text: "dollar loss per wrongful denial" }, ticks: { maxRotation: 60, minRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
        y: { title: { display: true, text: "number of errors" }, beginAtZero: true }
      }
    };
    if (charts.loss) {
      charts.loss.data = data;
      charts.loss.options = options;
      charts.loss.update();
    } else {
      charts.loss = new Chart($("lossChart"), { type: "bar", data: data, options: options });
    }
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
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        aeReference: true,
        tooltip: { callbacks: { label: function (it) {
          var r = ae.rows[it.dataIndex];
          return "A/E " + r.ae.toFixed(3) + "  (" + r.actual + " actual vs " + r.expected.toFixed(0) + " expected)";
        } } }
      },
      scales: {
        x: { title: { display: true, text: "age-band cohort" } },
        y: { title: { display: true, text: "Actual / Expected errors" }, beginAtZero: true,
             suggestedMax: 1.6 }
      }
    };
    if (charts.ae) {
      charts.ae.data = data;
      charts.ae.options = options;
      charts.ae.update();
    } else {
      charts.ae = new Chart($("aeChart"), { type: "bar", data: data, options: options });
    }
  }

  function updateCredibility(ae, fs, k) {
    var cohortName = ctrl.cohort.value || "85+";
    var row = ae.rows.filter(function (r) { return r.cohort === cohortName; })[0] || ae.rows[0];
    var observed = row.actual / row.n;
    var cred = A.buhlmannCredibility(row.n, observed, fs.frequency, k);

    var data = {
      labels: ["Own experience (Z)", "Base rate (1−Z)"],
      datasets: [{
        data: [cred.Z, 1 - cred.Z],
        backgroundColor: ["rgba(37,99,235,0.85)", "rgba(203,213,225,0.85)"],
        borderWidth: 0
      }]
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: function (it) { return it.label + ": " + (100 * it.parsed).toFixed(1) + "%"; } } }
      }
    };
    if (charts.cred) {
      charts.cred.data = data;
      charts.cred.options = options;
      charts.cred.update();
    } else {
      charts.cred = new Chart($("credChart"), { type: "doughnut", data: data, options: options });
    }

    $("credZ").textContent = "Z = " + cred.Z.toFixed(3);
    $("credDetail").innerHTML =
      "Cohort <strong>" + cohortName + "</strong> · n = " + row.n.toLocaleString("en-US") +
      "<br>Raw observed error rate: <strong>" + pct(observed) + "</strong>" +
      "<br>Portfolio base rate: " + pct(fs.frequency) +
      "<br>Credibility-weighted estimate: <strong>" + pct(cred.estimate) + "</strong>";
  }

  function updateReserveCard(fs, vt, sevVT, ibnr, ec, reported, ldf) {
    var rows = [
      ["Reported (adjudicated) errors", reported.toLocaleString("en-US")],
      ["Loss-development factor (LDF)", ldf.toFixed(2)],
      ["Estimated ultimate errors", Math.round(ibnr.ultimateCount).toLocaleString("en-US")],
      ["IBNR (not-yet-surfaced) errors", Math.round(ibnr.ibnrCount).toLocaleString("en-US")],
      ["IBNR best estimate", money(ibnr.bestEstimate)],
      ["Risk margin (to tail severity)", money(ibnr.riskMargin)],
      ["<strong>Reserve to hold</strong>", "<strong>" + money(ibnr.reserve) + "</strong>"],
      ["Tail severity TVaR (per error)", money(sevVT.tvar)],
      ["Economic capital / decision", money(ec.perDecision)],
      ["<strong>Economic capital (undiversified book)</strong>", "<strong>" + moneyShort(ec.portfolio) + "</strong>"]
    ];
    $("reserveTable").innerHTML = rows.map(function (r) {
      return "<tr><td>" + r[0] + "</td><td class='text-end'>" + r[1] + "</td></tr>";
    }).join("");
  }

  // ---- wire up ----
  ["alpha", "k", "drift"].forEach(function (key) {
    ctrl[key].addEventListener("input", recompute);
  });
  ctrl.cohort.addEventListener("change", recompute);
  $("resetBtn").addEventListener("click", function () {
    ctrl.alpha.value = 0.95;
    ctrl.k.value = 2500;
    ctrl.drift.value = D.DEFAULTS.drift;
    ctrl.cohort.value = "85+";
    recompute();
  });

  recompute();
})();
