/*
 * sample-data.js — Deterministic synthetic portfolios for several agentic /
 * AI decision systems. Demonstrates that the actuarial framework is
 * domain-general: any stream of consequential autonomous decisions is an
 * "insurable book" whose errors form a loss distribution.
 *
 * Each SCENARIO supplies the same shape of synthetic book (~10,000 decisions)
 * but with its own cohorts, error rates, dollar severities, reporting lag,
 * and plain-English labels. Every draw comes from a SEEDED generator, so each
 * book is byte-for-byte reproducible and the numbers match the paper.
 *
 * Record shape (identical across scenarios):
 *   { id, cohort, condition, score, expectedRate, error, reported, severity }
 *
 * The `drift` parameter inflates the realized error rate in the cohorts
 * flagged `drifts:true` (model degradation). Because each decision's uniform
 * draws are fixed by the seed AND the number of draws per decision is constant,
 * raising drift only flips error flags in the flagged cohorts — non-drift
 * cohorts are untouched, so A/E ~ 1.0 there. At drift = 0 every cohort's
 * A/E ~ 1.0 (the no-drift invariant).
 *
 * IMPORTANT: the per-decision RNG draw ORDER and COUNT must never change, or
 * the reproducible numbers (and the paper's worked example) will shift.
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

  // Standard normal via Box-Muller (for lognormal severities). Two draws.
  function randn(rng) {
    var u = 1 - rng();
    var v = 1 - rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---- SCENARIOS -----------------------------------------------------------
  // cohort fields: name, weight (share of book), expectedRate (validation-time
  // error rate), sevMu/sevSigma (lognormal $ severity), drifts (degrades in
  // production). conditions = flavour tags. ui = plain-English labels so the
  // tool and paper speak each domain's language.

  var SCENARIOS = {

    // 1) Health insurer — Medicare-Advantage prior authorization (the nH
    //    Predict setting). UNCHANGED from v1 so the paper's §6 numbers hold.
    "prior-auth": {
      id: "prior-auth",
      label: "Health insurer — prior authorization",
      sector: "Regulated decisioning",
      seed: 1242, n: 10000, drift: 0.35, reportingFraction: 2 / 3,
      cohorts: [
        { name: "18-39", weight: 0.10, expectedRate: 0.040, sevMu: 8.20, sevSigma: 0.55, drifts: false },
        { name: "40-54", weight: 0.16, expectedRate: 0.050, sevMu: 8.45, sevSigma: 0.60, drifts: false },
        { name: "55-64", weight: 0.20, expectedRate: 0.060, sevMu: 8.70, sevSigma: 0.65, drifts: false },
        { name: "65-74", weight: 0.26, expectedRate: 0.080, sevMu: 8.95, sevSigma: 0.70, drifts: false },
        { name: "75-84", weight: 0.18, expectedRate: 0.110, sevMu: 9.15, sevSigma: 0.80, drifts: true },
        { name: "85+",   weight: 0.10, expectedRate: 0.150, sevMu: 9.35, sevSigma: 0.95, drifts: true }
      ],
      conditions: ["SNF rehab", "Home health", "Inpatient rehab", "LTAC", "Cardiac post-acute"],
      ui: {
        agent: "prior-authorization model",
        decision: "prior-authorization decision",
        decisionsShort: "decisions",
        error: "wrongful denial",
        errors: "wrongful denials",
        cohortAxis: "age-band cohort",
        cohortNoun: "age band",
        driftWho: "the oldest cohorts (75-84, 85+)",
        defaultCredCohort: "85+",
        ldfNote: "appeals & retrospective chart review surface errors over time",
        intro: "A synthetic book of <strong>10,000 AI-assisted prior-authorization decisions</strong> for a Medicare-Advantage post-acute population — the setting of the real <em>nH&nbsp;Predict</em> litigation. An “error” is a wrongful denial; severity is its dollar harm (appeal, delayed care, litigation).",
        sevSub: "average $ damage of a wrongful denial",
        capLoss: "Each error is not equal. The blue mass is routine; the red tail beyond <strong>VaR</strong> is where the lawsuits live. <strong>TVaR</strong> is the average cost of a decision once you’re in that tail — invisible to a single accuracy figure.",
        capAE: "Green age bands behave as validated (A/E ≈ 1.0). Red bands have <strong>drifted</strong> — reality is producing far more wrongful denials than expected. A single accuracy number averages this away; A/E names the cohort absorbing the harm.",
        capReserve: "Ground truth lags via appeals. A development factor projects <strong>ultimate</strong> denials; the gap is <strong>IBNR</strong> — wrongful denials already made but not yet surfaced — which you must reserve for."
      }
    },

    // 2) BPO consulting firm — autonomous back-office customer-operations agent
    //    resolving client tickets under SLAs.
    "bpo": {
      id: "bpo",
      label: "BPO consulting — customer-ops agent",
      sector: "Autonomous operations / SLA",
      seed: 398, n: 10000, drift: 0.35, reportingFraction: 0.60,
      cohorts: [
        { name: "Billing disputes", weight: 0.22, expectedRate: 0.050, sevMu: 6.20, sevSigma: 0.80, drifts: false },
        { name: "Refunds & credits", weight: 0.20, expectedRate: 0.060, sevMu: 6.40, sevSigma: 0.85, drifts: false },
        { name: "Account changes", weight: 0.18, expectedRate: 0.040, sevMu: 5.90, sevSigma: 0.70, drifts: false },
        { name: "Claims intake", weight: 0.16, expectedRate: 0.080, sevMu: 6.80, sevSigma: 0.95, drifts: false },
        { name: "KYC / onboarding", weight: 0.14, expectedRate: 0.100, sevMu: 7.20, sevSigma: 1.05, drifts: true },
        { name: "Collections", weight: 0.10, expectedRate: 0.120, sevMu: 7.00, sevSigma: 1.00, drifts: true }
      ],
      conditions: ["Tier-1 enterprise", "Mid-market", "SMB", "Public sector", "Healthcare client"],
      ui: {
        agent: "customer-operations agent",
        decision: "auto-resolved ticket",
        decisionsShort: "tickets",
        error: "mis-resolution",
        errors: "mis-resolutions",
        cohortAxis: "process queue",
        cohortNoun: "queue",
        driftWho: "the compliance-heavy queues (KYC, Collections)",
        defaultCredCohort: "KYC / onboarding",
        ldfNote: "QA sampling and client callbacks surface errors over weeks",
        intro: "A synthetic book of <strong>10,000 back-office tickets auto-resolved by an agentic system</strong> a BPO consulting firm runs for its clients under SLAs. An “error” is a mis-resolution (wrong action, policy breach, falsely “resolved”); severity is rework + SLA penalty + client-credit cost, with a compliance tail.",
        sevSub: "average $ cost of a mis-resolution (rework + SLA penalty)",
        capLoss: "Most mis-resolutions cost a little rework; the red tail beyond <strong>VaR</strong> is systemic mis-action — mass wrong credits, an SLA-breaching backlog, a compliance miss. <strong>TVaR</strong> prices that bad day; an aggregate “resolution accuracy” number hides it.",
        capAE: "Green queues run as validated (A/E ≈ 1.0). Red queues have <strong>drifted</strong> — a client changed its rules and the agent silently degraded. A/E flags exactly which queue and client SLA is now under-performing.",
        capReserve: "Errors surface slowly through QA and client callbacks. A development factor projects <strong>ultimate</strong> mis-resolutions; the gap is <strong>IBNR</strong> — SLA penalties already incurred but not yet billed back — to reserve against."
      }
    },

    // 3) Growth/marketing org — autonomous marketing agent generating creative,
    //    choosing audiences, setting bids, and sending campaigns.
    "marketing": {
      id: "marketing",
      label: "Marketing — autonomous campaign agent",
      sector: "Autonomous growth",
      seed: 737, n: 10000, drift: 0.35, reportingFraction: 0.55,
      cohorts: [
        { name: "Paid search", weight: 0.22, expectedRate: 0.040, sevMu: 4.60, sevSigma: 0.90, drifts: false },
        { name: "Paid social", weight: 0.22, expectedRate: 0.060, sevMu: 4.80, sevSigma: 1.00, drifts: false },
        { name: "Email / CRM", weight: 0.18, expectedRate: 0.050, sevMu: 4.40, sevSigma: 1.10, drifts: false },
        { name: "Display / programmatic", weight: 0.16, expectedRate: 0.090, sevMu: 5.20, sevSigma: 1.30, drifts: true },
        { name: "Influencer / UGC", weight: 0.12, expectedRate: 0.080, sevMu: 5.40, sevSigma: 1.35, drifts: true },
        { name: "Affiliate", weight: 0.10, expectedRate: 0.070, sevMu: 5.00, sevSigma: 1.20, drifts: false }
      ],
      conditions: ["Acquisition", "Retention", "Reactivation", "Brand", "Cross-sell"],
      ui: {
        agent: "marketing agent",
        decision: "autonomous campaign action",
        decisionsShort: "actions",
        error: "bad action",
        errors: "bad actions",
        cohortAxis: "marketing channel",
        cohortNoun: "channel",
        driftWho: "the brand-safety-exposed channels (programmatic, influencer)",
        defaultCredCohort: "Display / programmatic",
        ldfNote: "complaints, brand sentiment, and delayed attribution surface errors slowly",
        intro: "A synthetic book of <strong>10,000 autonomous actions taken by a marketing agent</strong> that generates creative, picks audiences, sets bids, and sends campaigns. A “bad action” is wasted spend on mistargeted/fraudulent inventory, an off-brand/hallucinated claim, or a compliance violation (CAN-SPAM/GDPR/FTC); severity is the dollar cost, with a fines/brand-incident tail.",
        sevSub: "average $ cost of a bad action (wasted spend + complaints)",
        capLoss: "Most bad actions waste a little spend; the red tail beyond <strong>VaR</strong> is the viral brand-safety incident or the mass-send compliance fine. <strong>TVaR</strong> sizes that tail — which a blended ROAS or “brand-safety %” never shows.",
        capAE: "Green channels behave as validated (A/E ≈ 1.0). Red channels have <strong>drifted</strong> — new inventory/creative pushed the agent off-policy. A/E pinpoints the channel quietly burning budget or risking the brand.",
        capReserve: "Damage surfaces slowly via complaints, deliverability and delayed attribution. A development factor projects <strong>ultimate</strong> bad actions; the gap is <strong>IBNR</strong> — brand/compliance liability already incurred but not yet visible."
      }
    },

    // 4) Engineering org — autonomous software-engineering agent shipping code
    //    changes / PRs. The canonical "latent defect = IBNR" story.
    "swe": {
      id: "swe",
      label: "Software engineering — coding agent",
      sector: "Autonomous engineering",
      seed: 44, n: 10000, drift: 0.35, reportingFraction: 0.40,
      cohorts: [
        { name: "Frontend", weight: 0.22, expectedRate: 0.050, sevMu: 7.60, sevSigma: 0.80, drifts: false },
        { name: "Backend API", weight: 0.24, expectedRate: 0.060, sevMu: 8.00, sevSigma: 0.90, drifts: false },
        { name: "Data pipeline", weight: 0.16, expectedRate: 0.070, sevMu: 8.20, sevSigma: 1.00, drifts: false },
        { name: "Infra / IaC", weight: 0.14, expectedRate: 0.090, sevMu: 8.60, sevSigma: 1.10, drifts: true },
        { name: "Auth / security", weight: 0.12, expectedRate: 0.080, sevMu: 8.90, sevSigma: 1.20, drifts: true },
        { name: "Payments", weight: 0.12, expectedRate: 0.070, sevMu: 9.00, sevSigma: 1.15, drifts: false }
      ],
      conditions: ["Feature", "Refactor", "Bugfix", "Dependency bump", "Config change"],
      ui: {
        agent: "coding agent",
        decision: "auto-merged code change",
        decisionsShort: "changes",
        error: "defect",
        errors: "defects",
        cohortAxis: "service area",
        cohortNoun: "service area",
        driftWho: "the hardest areas (Infra/IaC, Auth/security)",
        defaultCredCohort: "Auth / security",
        ldfNote: "latent defects surface slowly through incidents and audits (a long reporting tail)",
        intro: "A synthetic book of <strong>10,000 code changes auto-merged by a software-engineering agent</strong>. A “defect” is a bug/regression/vulnerability that causes an incident or rollback; severity is remediation cost (dev hours + incident impact), with an outage/breach tail. This is the canonical <em>latent-defect</em> case — most errors are incurred long before they’re reported.",
        sevSub: "average $ remediation cost of a defect",
        capLoss: "Most defects are cheap fixes; the red tail beyond <strong>VaR</strong> is the outage, data-loss, or security breach. <strong>TVaR</strong> prices that tail — which a green test-suite or “PR pass rate” cannot.",
        capAE: "Green service areas behave as validated (A/E ≈ 1.0). Red areas have <strong>drifted</strong> — the agent is shipping more defects than it was signed off at in the hardest code. A/E names the service quietly accumulating risk.",
        capReserve: "Defects are <strong>incurred but not reported</strong> for months. A development factor (here a large one) projects <strong>ultimate</strong> defects; the gap is <strong>IBNR</strong> — latent bugs already merged but not yet triggered — the reserve you owe today."
      }
    },

    // 5) Bank / fintech — autonomous fraud & AML alert-disposition agent.
    "fraud": {
      id: "fraud",
      label: "Bank — fraud & AML agent",
      sector: "Financial crime / AML",
      seed: 221, n: 10000, drift: 0.35, reportingFraction: 0.50,
      cohorts: [
        { name: "Card-not-present", weight: 0.24, expectedRate: 0.050, sevMu: 6.80, sevSigma: 0.90, drifts: false },
        { name: "ACH", weight: 0.18, expectedRate: 0.050, sevMu: 6.90, sevSigma: 0.90, drifts: false },
        { name: "Wire transfers", weight: 0.16, expectedRate: 0.060, sevMu: 7.60, sevSigma: 1.00, drifts: false },
        { name: "New-account fraud", weight: 0.16, expectedRate: 0.080, sevMu: 7.20, sevSigma: 1.00, drifts: false },
        { name: "Crypto off-ramp", weight: 0.14, expectedRate: 0.100, sevMu: 7.80, sevSigma: 1.20, drifts: true },
        { name: "Trade-based AML", weight: 0.12, expectedRate: 0.090, sevMu: 8.40, sevSigma: 1.35, drifts: true }
      ],
      conditions: ["Retail", "SMB", "Corporate", "Correspondent", "High-risk geo"],
      ui: {
        agent: "fraud/AML agent",
        decision: "auto-dispositioned alert",
        decisionsShort: "alerts",
        error: "wrong disposition",
        errors: "wrong dispositions",
        cohortAxis: "alert type",
        cohortNoun: "alert type",
        driftWho: "the new-typology channels (crypto off-ramp, trade-based AML)",
        defaultCredCohort: "Trade-based AML",
        ldfNote: "chargebacks, investigations, and regulatory findings surface errors slowly",
        intro: "A synthetic book of <strong>10,000 fraud/AML alerts auto-dispositioned by an agent</strong> (block / clear / file). An “error” is a wrong disposition — a missed fraud or laundering typology, or a wrongly blocked good customer; severity is the fraud loss or remediation cost, with a heavy <strong>regulatory-penalty</strong> tail.",
        sevSub: "average $ cost of a wrong disposition (loss + remediation)",
        capLoss: "Most wrong dispositions are small; the red tail beyond <strong>VaR</strong> is the large missed fraud ring or the AML enforcement action. <strong>TVaR</strong> sizes that tail — which a blended “fraud catch rate” cannot.",
        capAE: "Green alert types behave as validated (A/E ≈ 1.0). Red types have <strong>drifted</strong> — a new fraud/laundering typology the agent wasn’t trained on. A/E flags the channel before the regulator does.",
        capReserve: "Losses surface slowly via chargebacks, investigations, and exams. A development factor projects <strong>ultimate</strong> wrong dispositions; the gap is <strong>IBNR</strong> — fraud/AML exposure already incurred but not yet detected — the reserve to hold."
      }
    },

    // 6) Lender — autonomous credit-underwriting agent (approve/decline/price).
    "credit": {
      id: "credit",
      label: "Lender — credit-underwriting agent",
      sector: "Regulated lending",
      seed: 704, n: 10000, drift: 0.35, reportingFraction: 0.45,
      cohorts: [
        { name: "Prime", weight: 0.24, expectedRate: 0.040, sevMu: 8.00, sevSigma: 0.80, drifts: false },
        { name: "Near-prime", weight: 0.22, expectedRate: 0.060, sevMu: 8.20, sevSigma: 0.90, drifts: false },
        { name: "Auto", weight: 0.16, expectedRate: 0.060, sevMu: 8.10, sevSigma: 0.90, drifts: false },
        { name: "Small business", weight: 0.14, expectedRate: 0.080, sevMu: 8.60, sevSigma: 1.05, drifts: false },
        { name: "Subprime", weight: 0.14, expectedRate: 0.100, sevMu: 8.40, sevSigma: 1.05, drifts: true },
        { name: "Thin-file", weight: 0.10, expectedRate: 0.110, sevMu: 8.70, sevSigma: 1.15, drifts: true }
      ],
      conditions: ["Personal loan", "Card", "Auto", "Mortgage", "SMB line"],
      ui: {
        agent: "credit-underwriting agent",
        decision: "auto-decisioned application",
        decisionsShort: "applications",
        error: "mis-decision",
        errors: "mis-decisions",
        cohortAxis: "applicant segment",
        cohortNoun: "segment",
        driftWho: "the thin-file & subprime segments",
        defaultCredCohort: "Thin-file",
        ldfNote: "defaults season over months (a long reporting tail)",
        intro: "A synthetic book of <strong>10,000 credit applications auto-decisioned by an agent</strong> (approve / decline / price). An “error” is a mis-decision — a bad approval that later defaults, or a wrongful decline; severity is the credit loss, with a <strong>fair-lending</strong> (ECOA) regulatory tail. Like insurance, the legal test here turns on a defensible, non-discriminatory basis.",
        sevSub: "average $ cost of a mis-decision (credit loss)",
        capLoss: "Most mis-decisions cost a little; the red tail beyond <strong>VaR</strong> is the large charge-off or a fair-lending action. <strong>TVaR</strong> prices that tail — invisible to an approval-rate or AUC number.",
        capAE: "Green segments behave as validated (A/E ≈ 1.0). Red segments have <strong>drifted</strong> — a macro shift or stale model degrading thin-file/subprime decisions. A/E is the cohort-level fair-lending early-warning.",
        capReserve: "Defaults season slowly, so today’s realized losses understate the book. A development factor projects <strong>ultimate</strong> mis-decisions; the gap is <strong>IBNR</strong> — bad approvals already made but not yet in arrears — the reserve you owe."
      }
    },

    // 7) Health system — autonomous clinical-triage agent (acuity / routing).
    "triage": {
      id: "triage",
      label: "Health system — clinical-triage agent",
      sector: "Clinical decisioning",
      seed: 219, n: 10000, drift: 0.35, reportingFraction: 0.50,
      cohorts: [
        { name: "Pediatrics", weight: 0.16, expectedRate: 0.050, sevMu: 8.50, sevSigma: 0.80, drifts: false },
        { name: "Respiratory", weight: 0.18, expectedRate: 0.060, sevMu: 8.70, sevSigma: 0.90, drifts: false },
        { name: "Abdominal", weight: 0.16, expectedRate: 0.060, sevMu: 8.80, sevSigma: 0.95, drifts: false },
        { name: "Cardiac / chest pain", weight: 0.18, expectedRate: 0.080, sevMu: 9.20, sevSigma: 1.05, drifts: false },
        { name: "Mental health", weight: 0.16, expectedRate: 0.100, sevMu: 8.90, sevSigma: 1.10, drifts: true },
        { name: "Geriatric", weight: 0.16, expectedRate: 0.110, sevMu: 9.30, sevSigma: 1.20, drifts: true }
      ],
      conditions: ["Telehealth", "ED", "Urgent care", "Primary care", "Nurse line"],
      ui: {
        agent: "clinical-triage agent",
        decision: "triage decision",
        decisionsShort: "triages",
        error: "under-triage",
        errors: "under-triages",
        cohortAxis: "presentation / service line",
        cohortNoun: "service line",
        driftWho: "mental-health & geriatric presentations",
        defaultCredCohort: "Geriatric",
        ldfNote: "adverse outcomes surface via follow-up, complaints, and malpractice review",
        intro: "A synthetic book of <strong>10,000 patient triage decisions made by an agent</strong> (acuity + routing). An “error” is an <em>under-triage</em> — a serious case sent to a lower level of care; severity is the clinical harm plus remediation, with a <strong>malpractice</strong> tail. Patient-safety risk, quantified.",
        sevSub: "average $ cost of an under-triage (harm + remediation)",
        capLoss: "Most under-triages are caught quickly; the red tail beyond <strong>VaR</strong> is the missed heart attack or the adverse event that becomes litigation. <strong>TVaR</strong> sizes that tail — which a triage-accuracy number cannot.",
        capAE: "Green service lines behave as validated (A/E ≈ 1.0). Red lines have <strong>drifted</strong> — the agent under-triages harder, under-represented presentations. A/E names the service line quietly accumulating patient-safety risk.",
        capReserve: "Harm surfaces slowly via follow-up and malpractice review. A development factor projects <strong>ultimate</strong> under-triages; the gap is <strong>IBNR</strong> — adverse events already set in motion but not yet reported — the reserve to hold."
      }
    },

    // 8) SaaS / consumer — autonomous front-line customer-support agent.
    "support": {
      id: "support",
      label: "SaaS — customer-support agent",
      sector: "Autonomous customer experience",
      seed: 35, n: 10000, drift: 0.35, reportingFraction: 0.60,
      cohorts: [
        { name: "How-to", weight: 0.24, expectedRate: 0.040, sevMu: 5.50, sevSigma: 0.80, drifts: false },
        { name: "Billing", weight: 0.20, expectedRate: 0.060, sevMu: 5.90, sevSigma: 0.90, drifts: false },
        { name: "Bug report", weight: 0.16, expectedRate: 0.060, sevMu: 6.00, sevSigma: 0.95, drifts: false },
        { name: "Cancellation", weight: 0.16, expectedRate: 0.080, sevMu: 6.60, sevSigma: 1.05, drifts: false },
        { name: "Outage", weight: 0.12, expectedRate: 0.090, sevMu: 6.40, sevSigma: 1.10, drifts: true },
        { name: "Security / abuse", weight: 0.12, expectedRate: 0.080, sevMu: 6.90, sevSigma: 1.25, drifts: true }
      ],
      conditions: ["Free tier", "Pro", "Enterprise", "Trial", "Churn-risk"],
      ui: {
        agent: "customer-support agent",
        decision: "auto-handled interaction",
        decisionsShort: "interactions",
        error: "bad resolution",
        errors: "bad resolutions",
        cohortAxis: "issue type",
        cohortNoun: "issue type",
        driftWho: "outage & security/abuse issues",
        defaultCredCohort: "Security / abuse",
        ldfNote: "CSAT surveys and churn realize over the following weeks",
        intro: "A synthetic book of <strong>10,000 front-line support interactions auto-handled by an agent</strong> (chat / email). An “error” is a bad resolution — a wrong answer, hallucinated policy, or mishandled escalation; severity is refund + churned lifetime value + CSAT damage, with a viral-complaint / mishandled-security tail.",
        sevSub: "average $ cost of a bad resolution (refund + churn)",
        capLoss: "Most bad resolutions cost a small refund; the red tail beyond <strong>VaR</strong> is the churned enterprise account or the mishandled security report gone viral. <strong>TVaR</strong> sizes that tail — which a CSAT average hides.",
        capAE: "Green issue types behave as validated (A/E ≈ 1.0). Red types have <strong>drifted</strong> — the agent mishandles issues it wasn’t hardened for. A/E flags the issue type quietly driving churn or risk.",
        capReserve: "Churn and CSAT damage realize weeks later. A development factor projects <strong>ultimate</strong> bad resolutions; the gap is <strong>IBNR</strong> — refunds/churn already caused but not yet booked — the reserve to hold."
      }
    }
  };

  var SCENARIO_LIST = ["prior-auth", "bpo", "marketing", "swe", "fraud", "credit", "triage", "support"];
  var DEV_PERIODS = 8; // accident/development periods in the reserving triangle

  function getScenario(id) {
    return SCENARIOS[id] || SCENARIOS["prior-auth"];
  }

  // Find geometric success prob q so the triangle's overall observed fraction
  // (uniform accident periods, truncated-geometric lag) matches `target`.
  function solveReportingSpeed(target, P) {
    var lo = 0.0001, hi = 0.9999;
    for (var it = 0; it < 60; it++) {
      var x = (lo + hi) / 2, s = 0;
      for (var m = 1; m <= P; m++) s += Math.pow(x, m);
      var obs = 1 - s / P;                 // decreasing in x
      if (obs > target) lo = x; else hi = x;
    }
    return 1 - (lo + hi) / 2;
  }

  function pickCohort(cohorts, u) {
    var acc = 0;
    for (var i = 0; i < cohorts.length; i++) {
      acc += cohorts[i].weight;
      if (u <= acc) return cohorts[i];
    }
    return cohorts[cohorts.length - 1];
  }

  // Generate a portfolio for a scenario. opts: { scenario, drift, seed, n }.
  function generatePortfolio(opts) {
    opts = opts || {};
    var sc = getScenario(opts.scenario || "prior-auth");
    var seed = opts.seed != null ? opts.seed : sc.seed;
    var n = opts.n != null ? opts.n : sc.n;
    var drift = opts.drift != null ? opts.drift : sc.drift;
    var reportingFraction = opts.reportingFraction != null ? opts.reportingFraction : sc.reportingFraction;
    var cohorts = sc.cohorts;
    var conditions = sc.conditions;

    var rng = mulberry32(seed);
    var records = new Array(n);

    for (var i = 0; i < n; i++) {
      var c = pickCohort(cohorts, rng());                 // draw 1

      var effRate = c.drifts ? c.expectedRate * (1 + drift) : c.expectedRate;
      if (effRate > 0.95) effRate = 0.95;

      var uErr = rng();                                   // draw 2
      var error = uErr < effRate ? 1 : 0;

      var score = error                                   // draw 3
        ? 0.55 + 0.40 * rng()
        : 0.20 + 0.70 * rng();

      var severity = Math.exp(c.sevMu + c.sevSigma * randn(rng)); // draws 4,5

      var repDraw = rng();                                // draw 6
      var reported = error && repDraw < reportingFraction ? 1 : 0;

      records[i] = {
        id: i,
        cohort: c.name,
        condition: conditions[Math.floor(rng() * conditions.length)], // draw 7
        score: score,
        expectedRate: c.expectedRate,
        error: error,
        reported: reported,
        severity: Math.round(severity)
      };
    }

    // Second, INDEPENDENT pass: assign an accident period and reporting lag to
    // every decision from a SEPARATE seeded stream, so the primary draws above
    // (and therefore all frequency / severity / A-E / VaR / TVaR numbers) are
    // byte-for-byte unchanged. An error is surfaced by the valuation date iff
    // accPeriod + devLag <= DEV_PERIODS - 1; faster-reporting scenarios (higher
    // reportingFraction) get front-loaded lags.
    var P = DEV_PERIODS;
    var rng2 = mulberry32((seed ^ 0x9E3779B9) >>> 0);
    // Calibrate the geometric reporting speed q so the OVERALL observed fraction
    // (averaged over accident periods) equals the scenario's reportingFraction.
    // With x = 1-q, observed(x) = 1 - (1/P) Σ_{m=1..P} x^m (decreasing in x).
    var q = solveReportingSpeed(reportingFraction, P);
    for (var j = 0; j < n; j++) {
      var acc = Math.floor(rng2() * P);
      var lag = 0;
      while (rng2() > q && lag < P - 1) lag++;              // geometric(q), truncated
      records[j].accPeriod = acc;
      records[j].devLag = lag;
      records[j].surfaced = (records[j].error && acc + lag <= P - 1) ? 1 : 0;
    }
    return records;
  }

  // Back-compat: some callers read DEFAULTS for the prior-auth scenario.
  var DEFAULTS = {
    seed: SCENARIOS["prior-auth"].seed,
    n: SCENARIOS["prior-auth"].n,
    drift: SCENARIOS["prior-auth"].drift,
    reportingFraction: SCENARIOS["prior-auth"].reportingFraction
  };

  var api = {
    SCENARIOS: SCENARIOS,
    SCENARIO_LIST: SCENARIO_LIST,
    DEV_PERIODS: DEV_PERIODS,
    getScenario: getScenario,
    generatePortfolio: generatePortfolio,
    DEFAULTS: DEFAULTS
  };

  global.SampleData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
