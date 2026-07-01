# Reserving Against the Black Box
### An Actuarial Standard for Explaining and Governing AI

**A framework paper accompanying the *AI Risk Lens* interactive tool.**
Educational only; not actuarial, legal, or investment advice.

---

## Abstract

Modern AI "explainability" inherits the defaults of software engineering: a single
accuracy number, a "95% confidence" figure, post-hoc feature attributions (SHAP / LIME),
and — at the rigorous frontier — conformal prediction. These tools answer two questions
well: *which inputs mattered* and *how often is the model right on average*. They are
structurally silent on the questions that governance, regulators, and harmed consumers
actually ask: **how badly does each error hurt, how much trust does a particular output
deserve, how much capital should be held against tail failures, and will a credentialed
professional attest to the model's risk?**

Actuarial science has spent a century building exactly the toolkit those questions require —
to quantify, price, and *reserve against* uncertain future losses. This paper argues that
the actuarial toolkit — **frequency–severity loss modeling, credibility theory, IBNR
reserving, Actual-to-Expected experience studies, VaR/TVaR tail measurement, economic
capital, and the actuarial control cycle closed by a signed opinion** — should become a
*standard* for measuring and governing AI systems, not merely a domain where actuaries
happen to work. We position the framework against conformal prediction (complementary, not
competing), anchor it in live insurance regulation that *already* makes "legitimate
actuarial basis" the legal test for AI, and demonstrate it end-to-end on a worked example —
a Humana-style Medicare-Advantage prior-authorization model — whose every number is
reproduced by the companion browser tool.

---

## 1. Thesis and the gap

### 1.1 The claim

> The right way to explain and govern an AI system is to treat its errors as an **insurable
> book of future losses** and apply the actuarial measurement toolkit to them.

An accuracy number describes a model. A *reserve* describes your exposure to the model. The
second is what a board, a regulator, or a plaintiff cares about — and it is precisely the
object actuaries are trained, credentialed, and in some jurisdictions legally required to
quantify.

### 1.2 What the software-engineering defaults leave out

Take the canonical AI report card and ask the governance questions it cannot answer:

| The software default says… | …but governance asks |
|---|---|
| "AUC = 0.94," "accuracy = 92%." | *Which* 8% is wrong, and what does each wrong call cost? |
| "95% confidence / 95% coverage." | What happens in the other 5% — the tail where the catastrophe lives? |
| "Feature X drove this prediction" (SHAP/LIME). | Given how little experience backs this segment, how much should I *believe* the prediction at all? |
| "Validated at 92% on the test set in Q1." | It is now Q4 and the population has shifted — is it still 92% *for the elderly cohort*? |
| (silence) | How much money must I set aside for errors already made but not yet surfaced? |
| (silence) | How much capital do I hold against a tail year, and who signs their name to that number? |

Every right-hand question is a standard actuarial deliverable. The gap is not that the
answers are hard — it is that the *software paradigm never asks the questions*, because its
mental model is "a function that is right or wrong," not "a portfolio of risks that
generates a loss distribution over time."

### 1.3 Why the framing change matters

A model with 92% accuracy can be a triumph or a scandal depending entirely on **the severity
distribution of the 8%** and **which cohorts absorb it**. The real *nH Predict* prior-auth
litigation makes the point viscerally: an algorithm with a tolerable-sounding aggregate
error rate was alleged to have its decisions **overturned ~90% of the time on appeal** — a
catastrophic *conditional* error rate concentrated in a vulnerable cohort, completely
invisible to a single accuracy figure. Actuarial methods are built to surface exactly that
structure.

---

## 2. Why actuarial, why now

### 2.1 The regulatory anchor: the law already uses the actuarial yardstick

This is not a metaphor that has to be argued into existence — in insurance it is already
**statutory**.

- **Colorado SB21-169** and its implementing **Regulation 10-1-1** (effective Nov 14, 2023)
  make the legal test for an insurer's use of AI, predictive models, and external data
  whether differential outcomes for protected classes can be justified by a **"legitimate
  actuarial basis."** The regulation requires a risk-based governance framework, a model
  inventory, and *quantitative* testing the Division can inspect. The yardstick for
  acceptable AI is, literally, actuarial soundness.

- The **NAIC Model Bulletin on the Use of Artificial Intelligence Systems by Insurers**
  (adopted Dec 4, 2023; since adopted by 20+ jurisdictions) requires every insurer to
  maintain a written, risk-commensurate **AI Systems Program** governing AI that affects
  consumers — explicitly invoking governance, testing, documentation, and accountability.

So in the largest regulated deployment of consequential AI in the United States,
**actuarial reasoning is already the governing standard.** This framework's move is to take
that latent standard, make its *measurement* explicit and reusable, and observe that the
same machinery generalizes to any consequential AI system — credit, hiring, fraud, clinical
triage — wherever errors carry quantifiable, distributed cost.

### 2.2 Prior art is adjacent, not overlapping

There is excellent recent work on **actuaries governing AI**:

- the **IAA AI Governance Framework** (AI Task Force, Nov 2025), which complements ISAP 1
  with governance considerations for AI models;
- the **SOA AI initiatives** and profession-wide guidance; and
- the **NIST AI Risk Management Framework** (Govern / Map / Measure / Manage).

These answer *"how should actuaries (and others) govern AI?"* with controls, roles, and
process. **None of them proposes the actuarial measurement toolkit — credibility,
frequency–severity, IBNR/reserving, A/E studies, TVaR — as the explainability and
quantification standard itself.** That inversion is this paper's contribution: not "put
actuaries in the governance loop," but "*use the actuary's measurement instruments as the
loop's instruments*."

### 2.3 The incumbent to position against: conformal prediction

The intellectually honest competitor is not SHAP/LIME (which measure attribution, not risk)
but **conformal prediction** — the rigorous successor to "95% confidence." Conformal methods
wrap any model to produce prediction sets with a **distribution-free, finite-sample coverage
guarantee**: under exchangeability, the true label lands in the set at least (1−α) of the
time. It is the correct tool for *marginal coverage* and we treat it as an ally.

But conformal prediction is, by construction, about **coverage frequency**, not **loss
severity or capital**. A 90% prediction set says nothing about the *dollar* consequence of
the 10% misses, the *reserve* for misses not yet adjudicated, or the *cohort* in which
coverage silently degrades. The actuarial framework is **complementary**: conformal
prediction can supply per-decision miss probabilities (a principled frequency input), and
the actuarial layer multiplies them by severity, reserves the lag, monitors the cohorts, and
converts the result into capital and a signed opinion. We return to the overlap honestly in
§9.

---

## 3. The method mappings (the intellectual heart)

Each row is a mature actuarial instrument repointed from "an insurance book" to "an AI
system's stream of decisions." The decision stream *is* the book; each error *is* a claim.

| Actuarial method | What it classically measures | What it measures for an AI system |
|---|---|---|
| **Frequency × Severity** loss model | claim count rate × claim size | how *often* the model errs × how *badly* each error hurts → a full loss distribution, not one accuracy number |
| **Credibility theory** (Bühlmann / limited-fluctuation), `Z = n/(n+k)` | how much to trust a segment's own loss experience vs. the manual rate | how much weight a given AI output / cohort deserves vs. the base rate, given how much relevant experience backs it |
| **IBNR / reserving** (development-factor analog) | claims incurred but not yet reported | model failures already baked in but **not yet surfaced** (delayed ground truth, pending appeals) — and the reserve to hold |
| **Actual-to-Expected (A/E)** experience study | did mortality/morbidity emerge as assumed? | cohort-level, statistically rigorous **drift / miscalibration** monitoring vs. a one-time validation snapshot |
| **VaR / TVaR (CTE)** | capital for a 1-in-200 loss year | sizing **catastrophic tail failure** — exactly what "95% confidence" discards in its 5% tail |
| **Economic capital** | buffer above expected loss for solvency | the buffer to hold against AI tail risk: `TVaR_α − E[loss]` |
| **Control cycle + signed opinion + ASOPs** | the actuarial control cycle; a signed reserve opinion | a credentialed accountability layer: a **Statement of Actuarial AI Opinion** attesting to model risk under professional standards |

The rest of the paper turns each row into math (§5), runs all of them on one book (§6),
generalizes the same machinery to non-insurance agentic systems (§7), and proposes the
professional wrapper (§8).

---

## 4. The framework: an Actuarial AI Control Cycle

The metrics are not a checklist; they form a **cycle** that mirrors the classic actuarial
control cycle (define the problem → design the solution → monitor the experience), wrapped
around an AI system:

```
        ┌────────────────────────────────────────────────────────┐
        │                 ACTUARIAL AI CONTROL CYCLE               │
        │                                                          │
        │   (1) DEFINE EXPOSURE                                     │
        │       What is one "decision"? What is an "error"?        │
        │       What is the severity (cost) of an error, and       │
        │       what are the cohorts (the rating cells)?           │
        │                         │                                │
        │                         ▼                                │
        │   (2) PRICE THE RISK                                     │
        │       Frequency × Severity → expected loss.              │
        │       VaR / TVaR → the tail. Credibility → how much      │
        │       each cohort's signal is believed.                  │
        │                         │                                │
        │                         ▼                                │
        │   (3) RESERVE                                            │
        │       IBNR development for not-yet-surfaced failures;    │
        │       economic capital for the tail. Money set aside.    │
        │                         │                                │
        │                         ▼                                │
        │   (4) MONITOR (A/E)                                      │
        │       Continuous Actual-to-Expected by cohort.           │
        │       Drift triggers re-pricing → back to (1)/(2).       │
        │                         │                                │
        │                         ▼                                │
        │   (5) OPINE                                              │
        │       A credentialed professional signs a Statement of   │
        │       Actuarial AI Opinion under ASOP-style standards.   │
        └────────────────────────────────────────────────────────┘
```

The cycle is what turns disconnected metrics into *governance*: pricing feeds reserving,
reserving sets capital, monitoring detects when the price is stale, and the opinion makes a
named human accountable for the whole loop.

---

## 5. The math

Notation: a *decision* `i = 1…N`. Each decision has a binary error indicator `e_i ∈ {0,1}`,
a dollar severity `s_i ≥ 0` realized only when `e_i = 1`, and a cohort label `c(i)`. The
**per-decision loss** is `L_i = e_i · s_i`.

### 5.1 Frequency × Severity

$$\text{Frequency } f = \frac{1}{N}\sum_i e_i \qquad
\text{Mean severity } \bar s = \frac{\sum_i e_i s_i}{\sum_i e_i} \qquad
\mathbb{E}[L] = \frac{1}{N}\sum_i L_i = f\cdot \bar s$$

The object of interest is the **distribution of `L`**, a mixed distribution with a point
mass `1−f` at zero and a heavy right tail from `s`. Expected loss is one summary of it; the
tail (§5.4) is another.

### 5.2 Bühlmann credibility

For a cohort with experience size `n`, observed rate `p̂`, and prior (portfolio) rate `μ`:

$$Z = \frac{n}{n+k}, \qquad \hat p_{\text{cred}} = Z\,\hat p + (1-Z)\,\mu .$$

`Z ∈ [0,1)` rises monotonically toward 1 as `n` grows: thin experience is shrunk toward the
base rate; thick experience is trusted on its own. `k` encodes how much within-cohort
process variance there is relative to between-cohort variance (in Bühlmann, `k = E[process
var]/Var[hypothetical means]`); larger `k` ⇒ more evidence required before a cohort is
"believed."

`k` need not be a free dial. The tool also **estimates** it from the cohorts' own variance
components — empirical **Bühlmann-Straub** with exposure = decision count:
`k̂ = EPV / VHM`, where `EPV` is the exposure-weighted mean process variance and `VHM` the
between-cohort variance of the true rates (net of process noise). For the §6 book `k̂ ≈ 24` —
far below a hand-set `k = 2500` — because the age bands are genuinely distinguishable, so their
own experience *should* carry near-full credibility. "Use k̂" in the tool snaps the dial to the
data-driven value; the point is that credibility is a *measurement*, not a preference.

### 5.3 Actual-to-Expected (A/E)

For each cohort `c`, with `n_c` decisions and validation-time expected rate `q_c`:

$$A_c = \sum_{i: c(i)=c} e_i, \qquad E_c = n_c\, q_c, \qquad (A/E)_c = \frac{A_c}{E_c}.$$

`(A/E)_c ≈ 1` means the model still behaves as validated for that cohort. Rather than a flat
threshold, the tool flags a cohort only when its departure is **both statistically
significant and material**. Under the null (no drift), `A_c ~ Poisson(E_c)`, so the standard
error of the ratio is `SE = 1/√E_c` and the 95% **control band** is `1 ± 1.96/√E_c`; a cohort
is flagged when `|z| = |A_c − E_c|/√E_c > 1.96` **and** `|A/E − 1| > 10%`. This ties directly
to the credibility view (§5.2): a small, low-exposure cohort has a wide band and does not trip
on noise, while a large cohort is held to a tight one. The band is drawn as whiskers on the
A/E chart.

### 5.4 VaR and TVaR (CTE)

$$\text{VaR}_\alpha = \inf\{x : F_L(x) \ge \alpha\} \quad(\alpha\text{-quantile of }L),$$
$$\text{TVaR}_\alpha = \mathbb{E}[\,L \mid L \ge \text{VaR}_\alpha\,] \ge \text{VaR}_\alpha .$$

TVaR (a.k.a. CTE) is the **average loss in the tail**, not merely its threshold. It is a
*coherent* risk measure (sub-additive — it rewards diversification), which VaR is not. The
inequality `TVaR ≥ VaR` is an invariant the tool checks.

### 5.5 IBNR reserve — stochastic development triangle

Errors are *incurred but not reported* for a while: a model failure happens now but surfaces
later (an appeal, an audit, a triggered incident). Reserving projects the **ultimate** error
count from what has been **reported to date** and holds money for the gap.

The simplest version applies a single loss-development factor `LDF ≥ 1` to reported errors `R`:
`U = R·LDF`, `IBNR = U − R`. The tool reports one conservative variant of this — a
**tail-loaded** reserve `IBNR × TVaR^s_α` (every unreported claim costed at the tail/CTE
severity) — as an upper reference. But a single factor hides both the *pattern* and the
*uncertainty*, so the framework does the real thing:

- **Development triangle.** Group errors by **accident period** (when incurred) × **development
  lag** (periods until surfaced). The observed upper-left triangle is what's reported to date;
  the lower-right is what we must project.
- **Chain-ladder (CL).** Estimate age-to-age development factors `f_d` from column ratios and
  project each accident period to ultimate. CL is unbiased but **volatile on immature periods**
  — the latest accident periods, with only early development, can be badly over-projected.
- **Bornhuetter-Ferguson (BF).** Blend CL with an **a-priori ultimate** — here the model's own
  *expected* error count per period (`Σ q_c` exposure) — weighting the a-priori by the
  still-unreported proportion `1 − 1/CDF`. BF is the standard fix for CL's immature-period
  instability, and the tool shows the two side by side so the disagreement is visible.
- **Over-dispersed-Poisson bootstrap** (England-Verrall). Resample the Pearson residuals of the
  CL fit, refit, and add ODP process error to produce a full **predictive distribution** of the
  IBNR. This yields a best estimate, a standard error, and percentiles — so the **risk margin is
  a defensible 75th-percentile** (IFRS 17 style), not an ad-hoc severity load.

**Severity-aware reserve (heavy tails).** Reserve *dollars* are not the IBNR count × a fixed
mean severity — that ignores how expensive the late claims might be. Instead the tool fits a
**generalized-Pareto distribution (GPD)** to the severity exceedances over a high threshold `u`
(peaks-over-threshold, method of moments), yielding a **tail index `ξ̂`** (`ξ ≈ 0`
exponential-tailed; `ξ > 0` heavy/power-law). Each bootstrap trial's IBNR claims are then
costed by drawing per-claim severities from the **empirical body spliced with the GPD tail**,
so severity variability and tail risk propagate into the reserve percentiles. The synthetic
books span the regimes — prior-auth is essentially exponential (`ξ̂ ≈ 0`), while the
software-engineering and clinical-triage books are mildly heavy (`ξ̂ ≈ 0.16–0.20`, from their
larger severity dispersion); the tool reports the GPD tail-TVaR alongside the empirical one as
a sensitivity check. The single-factor tail-loaded figure and the severity-aware
best-estimate-plus-margin bracket the reserve from above and from a principled centre.

### 5.6 Economic capital (aggregate, dependence-aware)

Economic capital is the buffer above expected loss needed to survive a tail outcome:

$$\text{EC}_\alpha = \text{TVaR}_\alpha(S) - \mathbb{E}[S],$$

where `S` is the **aggregate** loss of the whole book. The naive shortcut — take the
per-decision `TVaR_α − E[L]` and multiply by `N` — assumes *perfectly dependent* decisions and
badly overstates capital; the equally-naive independence assumption (CLT) badly understates
it. Neither is right, so the tool builds the aggregate distribution explicitly with a
**mixed-Poisson compound model carrying a shared systemic factor** `G`:

$$G \sim \text{Gamma}(\text{mean }1,\ \text{var }g),\quad
M \mid G \sim \text{Poisson}(f\,N\,G),\quad
S = \sum_{j=1}^{M} X_j,$$

with severities `X_j` drawn from the empirical severity distribution and `g = ρ·0.5`. The
**systemic-correlation parameter** `ρ ∈ [0,1]` (a slider in the tool) controls common-cause
clustering — the reality of model risk, where one bad deploy or drifted input corrupts many
decisions at once. `ρ = 0` recovers near-independence (maximal diversification); raising `ρ`
fattens the aggregate tail toward the undiversified bound. `EC_α = TVaR_α(S) − E[S]` is read
off a seeded Monte-Carlo of `S`, so it is reproducible.

For the §6 book (`α = 0.95`), this yields economic capital of **≈ $1.05M independent
(ρ = 0)**, **≈ $6.57M at ρ = 0.15** (a moderate systemic assumption), and **≈ $15.0M at
ρ = 0.6** — all far below the **$163.55M** undiversified `N·(TVaR − E[L])` bound, which the
tool still reports as a conservative reference. The gap between these numbers *is* the
diversification, and the honest capital figure depends entirely on the systemic-correlation
assumption — which the framework now makes explicit and tunable rather than hiding.

### 5.7 Ground-truth censoring and reject inference

Every metric so far assumes we eventually *see* whether a decision was an error. Often we do
not: a confidently-denied prior-auth is rarely appealed, a **declined loan never gets to
default**, a blocked transaction is never confirmed as fraud. Worse, this censoring is
**informative** — it rises with the model's confidence, which itself tracks error propensity —
so the **naive observed error rate is biased downward** (the very cases most likely to be
wrong are the least likely to be observed). Reporting the observed rate as if it were the truth
is the selection-bias trap that makes a bad model look acceptable.

**Reject inference** is the actuarial/credit-risk remedy. The model's **score is available for
every decision**, censored or not. Fit `P(error | score)` on the *observed* decisions (score
bins), then **impute** the expected errors of the censored ones:

$$\hat E_\text{true} = \underbrace{\textstyle\sum_{\text{observed}} e_i}_{\text{seen}}
 + \underbrace{\textstyle\sum_{\text{censored}} \hat P(\text{error}\mid \text{score}_i)}_{\text{imputed}}.$$

This is unbiased when censoring is ignorable *given the score* (MAR); whatever depends on the
outcome beyond the score (MNAR) is the irreducible residual. In the worked example the naive
observed rate reads **7.1%**, but reject inference recovers **8.6%** against a true **9.2%** —
closing most of the gap the naive number hides. The lesson is a governance one: *never quote
the observed error rate of a system that suppresses its own ground truth without a
reject-inference correction and an MNAR caveat.*

---

## 6. Worked example: a Humana-style prior-authorization AI

This section's numbers are produced *identically* by the companion tool at its default
settings (seed `1242`, `N = 10,000`, drift `35%`, `α = 0.95`, `k = 2,500`). The book is a
synthetic Medicare-Advantage post-acute population (skilled-nursing / home-health /
inpatient-rehab prior-authorization decisions) — the *nH Predict* setting — generated
deterministically so anyone can reproduce every figure.

> **Setup.** Each of 10,000 decisions belongs to an age-band cohort with a validation-time
> expected error rate `q_c` (rising with age: 4.0% → 15.0%) and a lognormal dollar severity
> (heavier-tailed for older, sicker cohorts). In production, the two oldest cohorts (75–84,
> 85+) have **drifted**: their realized error rate runs 35% above what was validated. Two
> thirds of true errors have surfaced so far (reporting lag ⇒ `LDF = 1.50`).

### 6.1 Frequency × Severity

| Metric | Value |
|---|---|
| Decisions (N) | 10,000 |
| Realized errors | 917 |
| **Error frequency `f`** | **9.17%** |
| Mean severity `s̄` (per error) | **$11,444** |
| **Expected loss per decision** | **$1,049** |
| Expected loss across the book | **$10,494,097** |

A software report card would stop at "≈91% accurate." The actuarial decomposition already
says something it cannot: the *expected* cost of running this model is **≈ $10.5M** on
10,000 decisions, before we even look at the tail.

### 6.2 Tail: VaR and TVaR (α = 0.95)

| Metric | Value |
|---|---|
| `VaR₀.₉₅` (per-decision loss) | **$7,154** |
| `TVaR₀.₉₅` (per-decision loss) | **$17,404** |
| `TVaR₀.₉₅` of severity (per error) | **$50,445** |

The tail beyond the 95th percentile averages **$17,404 per decision** — **16.6×** the
expected loss. "95% confidence" would have discarded exactly this. `TVaR ≥ VaR` holds.

### 6.3 Actual-to-Expected by cohort

| Cohort | n | Actual errors | Expected errors | **A/E** | Flag |
|---|---:|---:|---:|---:|:--:|
| 18–39 | 1,040 | 41 | 41.6 | **0.99** | |
| 40–54 | 1,633 | 81 | 81.6 | **0.99** | |
| 55–64 | 1,992 | 121 | 119.5 | **1.01** | |
| 65–74 | 2,624 | 205 | 209.9 | **0.98** | |
| 75–84 | 1,737 | 265 | 191.1 | **1.39** | ⚠ |
| 85+ | 974 | 204 | 146.1 | **1.40** | ⚠ |
| **Portfolio** | 10,000 | 917 | 789.9 | **1.16** | |

This is the headline. The four younger cohorts sit on `A/E ≈ 1.0` — the model behaves as
validated. The two oldest cohorts blow past it (**1.39** and **1.40**): reality is producing
39% and 40% **more** errors than the model was signed off at. A single portfolio accuracy
number averages this into invisibility; even the portfolio A/E of 1.16 understates the
concentrated harm. **The A/E study names the cohort absorbing the failure** — precisely the
elderly post-acute population at the center of the real litigation.

### 6.4 Credibility (k = 2,500)

| Cohort | n | **Z** | Raw observed rate | Credibility-weighted estimate |
|---|---:|---:|---:|---:|
| 18–39 | 1,040 | 0.29 | 3.94% | 7.63% |
| 40–54 | 1,633 | 0.40 | 4.96% | 7.51% |
| 55–64 | 1,992 | 0.44 | 6.07% | 7.80% |
| 65–74 | 2,624 | 0.51 | 7.81% | 8.47% |
| 75–84 | 1,737 | 0.41 | 15.26% | 11.67% |
| 85+ | 974 | 0.28 | **20.94%** | **12.47%** |

Credibility keeps the response *honest and proportionate*. The 85+ cohort's raw observed
error rate is an alarming **20.9%**, but with only `n = 974` it earns credibility `Z =
0.28`, so the believed estimate is pulled toward the 9.17% base rate to **12.5%** — still
clearly elevated, enough to act on, but not a number you'd bet the firm on outright. Note `Z`
rises with `n` (compare 65–74's `Z = 0.51` to 85+'s `0.28`): **more experience earns more
trust** — the formal version of "don't over-react to a small sample, don't ignore it either."

### 6.5 IBNR reserve and economic capital

**Simple (single-factor) view.** A loss-development factor of `1.50` on the `621` adjudicated
errors implies `932` ultimate — so **311 failures are already baked in and not yet visible.**
Costing every one at the *tail* severity gives a deliberately conservative **tail-loaded
reserve of ≈ $15.7M**. This is money the actuarial lens says to set aside today that no
accuracy number, SHAP plot, or conformal set would ever surface — but it over-reserves by
assuming every late claim is a tail claim.

**Stochastic development triangle (§5.5).** The real reserving decomposes the same lag into an
accident × development triangle and quantifies the *uncertainty*:

| Method | Ultimate | IBNR | Reserve ($, severity-aware) |
|---|---:|---:|---:|
| Reported to date | 606 | — | — |
| Chain-ladder | 905 | 299 | — |
| Bornhuetter-Ferguson | 870 | 264 | — |
| **Bootstrap (ODP) best estimate** | — | **305 ± 63** (CV 21%) | **$3.50M** |
| Bootstrap 75th pctile (IFRS-17 margin) | — | — | **$3.93M** |
| Bootstrap 95th pctile | — | — | $4.83M |
| Bootstrap 99th pctile | — | — | $5.48M |

The **best estimate is ≈ $3.5M**, with a **75th-percentile risk margin bringing it to ≈
$3.9M** — a defensible, distribution-based reserve, not the $15.7M tail load. The reserve $ are
**severity-aware** (§5.5): the GPD tail index here is `ξ̂ ≈ 0` (prior-auth severities are
essentially exponential), so the empirical and GPD tails agree and the extra spread over the
count-only bootstrap is modest; in the heavier-tailed books (`ξ̂ ≈ 0.16–0.20`) the percentiles
widen more. The gap between the best estimate and the $15.7M tail load *is* the conservatism the
simple method bakes in; the framework shows both and lets a signer choose the margin explicitly.

**Economic capital (§5.6).** From the aggregate Monte-Carlo: **$1.05M independent (ρ = 0)**,
**$6.57M at ρ = 0.15**, versus the **$163.55M** undiversified `N·(TVaR − E[L])` upper bound —
the buffer for the tail beyond the reserve, and its honest dependence on the systemic-
correlation assumption.

### 6.6 What the actuarial lens saw that the software lens could not

| Question | Software default | Actuarial lens (this book) |
|---|---|---|
| How good is the model? | "≈91% accurate." | $1,049 expected loss/decision; $10.5M/book. |
| What about the bad cases? | (silent / "95% conf.") | TVaR₀.₉₅ = $17,404/decision — 16.6× expected. |
| Who gets hurt? | (averaged away) | 85+ cohort A/E = 1.40; believed rate 12.5%. |
| What do we owe already? | (no concept) | $15.7M IBNR reserve for 311 hidden failures. |
| What capital backs the tail? | (no concept) | EC = $16,355/decision. |
| Who signs for it? | (nobody) | A Statement of Actuarial AI Opinion (§8). |

---

## 7. Generalizing the framework: agentic systems beyond insurance

Nothing in §§3–5 is specific to insurance. The machinery needs only four things from a
system: a **stream of consequential decisions**, a definition of an **error**, a **dollar
severity** for an error, and **cohorts** to monitor. Any autonomous or AI-assisted system
that decides at volume supplies all four — so its error stream *is* an insurable book, and
the same seven instruments apply. The companion tool ships this section as a live
**scenario switcher**; every figure below is produced deterministically by the same
`actuarial.js` functions on a seeded synthetic book of 10,000 decisions per domain.

The translation is purely a matter of vocabulary:

| Framework primitive | Prior-auth (insurer) | BPO customer-ops agent | Marketing agent | Software-engineering agent |
|---|---|---|---|---|
| A **decision** | a prior-auth determination | a ticket auto-resolved | an autonomous campaign action | an auto-merged code change |
| An **error** | a wrongful denial | a mis-resolution (wrong action / policy breach) | a bad action (waste, off-brand, non-compliant) | a defect (bug / regression / vuln) |
| **Severity** | appeal + delayed-care + litigation cost | rework + SLA penalty + client credit | wasted spend + complaints + (tail) fine/brand hit | dev hours + incident impact (outage/breach) |
| **Cohort** (A/E unit) | age band | process queue / client SLA | channel / segment | service area |
| **Reporting lag** (IBNR) | appeals, chart review | QA sampling, client callbacks | complaints, deliverability, attribution | latent defects surfacing via incidents |
| **Tail** (VaR/TVaR) | a catastrophic denial / class action | a systemic mis-action across a client | a viral brand-safety or mass-send event | an outage / data breach |

Three of these are worked below (§§7.1–7.3); four more — fraud/AML, credit underwriting,
clinical triage, and customer support — follow in §7.4, and all eight are live in the tool's
scenario switcher.

### 7.1 BPO consulting — an autonomous customer-operations agent

A BPO firm runs an agent that resolves clients' back-office tickets (billing, refunds, KYC,
collections) autonomously under SLAs. An error is a mis-resolution; severity is rework plus
SLA penalty plus client-goodwill credit, with a compliance tail. Cohorts are **process
queues** (each tied to a client SLA), so A/E becomes per-SLA drift monitoring.

| Metric | Value |
|---|---|
| Decisions / errors / **frequency** | 10,000 / 776 / **7.76%** |
| Mean severity · expected loss / ticket | $1,562 · **$121** ($1.21M / book) |
| `VaR₀.₉₅` · `TVaR₀.₉₅` per ticket | $514 · **$2,257** (18.6× expected) |
| Reported → ultimate (LDF 1.67) → **IBNR** | 466 → 777 → **311** mis-resolutions |
| **Reserve** · economic capital / ticket | **$3.18M** · $2,135 |
| A/E flags | **KYC / onboarding 1.43**, **Collections 1.28** (a client changed its rules) |

The lesson: a blended "resolution accuracy" looks fine while two queues quietly breach their
SLAs. A/E names the client and queue; the reserve sizes the penalties already owed but not
yet billed back.

### 7.2 Marketing — an autonomous campaign agent

An agent generates creative, picks audiences, sets bids, and sends campaigns across channels.
An error is a bad action — wasted spend on mistargeted/fraudulent inventory, an off-brand or
hallucinated claim, or a compliance violation (CAN-SPAM / GDPR / FTC). Most cost pennies; a
few cost a fortune.

| Metric | Value |
|---|---|
| Decisions / errors / **frequency** | 10,000 / 715 / **7.15%** |
| Mean severity · expected loss / action | $353 · **$25** ($0.25M / book) |
| `VaR₀.₉₅` · `TVaR₀.₉₅` per action | $78 · **$486** (**19.2×** expected — the fattest tail of the four) |
| Reported → ultimate (LDF 1.82) → **IBNR** | 396 → 720 → **324** bad actions |
| **Reserve** · economic capital / action | **$1.04M** · $461 |
| A/E flags | **Influencer / UGC 1.45**, **Display / programmatic 1.42** (brand-safety drift) |

The lesson: average cost-per-action is trivial, so a ROAS dashboard says "fine," yet the tail
multiplier is the highest of any domain here — the rare viral brand incident or mass-send fine
dominates the risk. Exactly the structure VaR/TVaR exist to expose.

### 7.3 Software engineering — an autonomous coding agent

An agent ships code changes / PRs autonomously. An error is a defect (bug, regression,
vulnerability) causing an incident or rollback; severity is remediation plus incident impact.
This is the **canonical IBNR case**: defects are *incurred but not reported* for months.

| Metric | Value |
|---|---|
| Decisions / errors / **frequency** | 10,000 / 752 / **7.52%** |
| Mean severity · expected loss / change | $9,059 · **$681** ($6.81M / book) |
| `VaR₀.₉₅` · `TVaR₀.₉₅` per change | $2,651 · **$12,885** (18.9× expected) |
| Reported → ultimate (**LDF 2.50**) → **IBNR** | **302 → 755 → 453** defects |
| **Reserve** · economic capital / change | **$26.96M** · $12,204 |
| A/E flags | **Infra / IaC 1.40**, **Auth / security 1.29** (the hardest code) |

The lesson is the sharpest in the set: only **302** defects have surfaced, but development
implies **755** — so **IBNR (453) exceeds what has been reported (302).** A green test suite
and a high "PR pass rate" describe the 302; they are structurally blind to the 453 latent
defects already merged. The reserve — **$27M, dwarfing the $6.8M of expected loss** — is the
number an actuarial lens forces onto the table and a software lens never names.

### 7.4 Four more domains, same lens

The same translation extends to any consequential decision system. Four more, each with its
own error definition, severity basis, cohorts, and reporting lag:

| System | A **decision** | An **error** | **Cohort** | Reporting lag | Headline |
|---|---|---|---|---|---|
| **Fraud / AML agent** (bank/fintech) | an auto-dispositioned alert | a wrong disposition (missed typology / wrong block) | alert type | chargebacks, investigations, exams | $11.19M reserve; TVaR 19.0× E[L] |
| **Credit-underwriting agent** (lender) | an auto-decisioned application | a mis-decision (bad approval / wrongful decline) | applicant segment | defaults season over months | $23.76M reserve; A/E flags thin-file 1.36 |
| **Clinical-triage agent** (health system) | a triage / acuity decision | an under-triage | presentation / service line | follow-up, complaints, malpractice | $42.88M reserve; mean severity $15,778 |
| **Customer-support agent** (SaaS) | an auto-handled interaction | a bad resolution | issue type | CSAT surveys, churn realization | $2.42M reserve; A/E flags security/abuse 1.49 |

Each carries a domain-native lesson:

- **Fraud / AML.** With a 2.0 development factor, IBNR equals what has surfaced (363 = 363):
  half the wrong dispositions are still working their way through chargebacks and exams. A/E
  catches the *new typology* (crypto off-ramp, trade-based AML) that a static "fraud catch
  rate" averages away — before it becomes an enforcement action.
- **Credit underwriting.** This is insurance's near-twin: the legal test is a defensible,
  non-discriminatory basis (ECOA / fair lending), the direct analog of §2's "legitimate
  actuarial basis." Defaults season, so IBNR (416) exceeds reported (340), and cohort-level A/E
  is a fair-lending early-warning on the thin-file and subprime segments.
- **Clinical triage.** The highest-stakes book here: an under-triage can be fatal, so mean
  severity ($15,778) and the reserve ($42.9M) dwarf the others despite a similar error rate.
  A/E flags the under-triaged mental-health and geriatric presentations — exactly the cohorts
  where a single "triage accuracy" number is most dangerous.
- **Customer support.** High-frequency, lower-severity, but the tail is the churned enterprise
  account or the mishandled security report gone viral. A/E flags *outage* and *security/abuse*
  handling — where a healthy average CSAT hides concentrated churn and reputational risk.

### 7.5 What the cross-domain view shows

| System | Freq. | Mean severity | TVaR₀.₉₅ / decision | TVaR ÷ E[L] | LDF | Reserve | A/E-flagged cohorts |
|---|---:|---:|---:|---:|---:|---:|---|
| Health prior-auth | 9.17% | $11,444 | $17,404 | 16.6× | 1.50 | $15.66M | 75-84, 85+ |
| BPO customer-ops | 7.76% | $1,562 | $2,257 | 18.6× | 1.67 | $3.18M | KYC, Collections |
| Marketing agent | 7.15% | $353 | $486 | 19.2× | 1.82 | $1.04M | Influencer, Programmatic |
| SW-engineering agent | 7.52% | $9,059 | $12,885 | 18.9× | 2.50 | $26.96M | Infra/IaC, Auth/security |
| Fraud / AML agent | 7.63% | $3,961 | $5,733 | 19.0× | 2.00 | $11.19M | Crypto, Trade-based AML |
| Credit underwriting | 7.56% | $8,146 | $11,501 | 18.7× | 2.22 | $23.76M | Subprime, Thin-file |
| Clinical triage | 8.79% | $15,778 | $24,996 | 18.0× | 2.00 | $42.88M | Mental health, Geriatric |
| Customer-support agent | 7.50% | $1,087 | $1,540 | 18.9× | 1.67 | $2.42M | Outage, Security/abuse |

Three observations make the case that this is a *standard*, not a one-off:

1. **The tail is never within an order of magnitude of the average.** Across *eight* unrelated
   domains, `TVaR₀.₉₅` runs **16.6–19.2× expected loss per decision** — a remarkably stable
   band. A single accuracy number or expected-value summary discards precisely the part that is
   consistently ~17–19× larger.
2. **Ground-truth lag varies and matters.** The loss-development factor ranges from 1.5 (fast
   appeals) to 2.5 (slow-surfacing software defects); wherever feedback is slow — code defects,
   seasoning loan defaults, laundering typologies, malpractice-surfaced harm — **IBNR can equal
   or exceed what has been reported**, and the reserve explodes accordingly. A framework that
   ignores reporting lag (every incumbent does) under-reserves most in the systems being
   deployed fastest.
3. **The stakes scale with severity, not frequency.** Frequencies cluster in a narrow 7–9%
   band, yet reserves span **$1.0M to $42.9M** — driven almost entirely by severity and lag,
   the two dimensions the software paradigm has no vocabulary for. Clinical triage is only
   marginally more error-prone than a marketing agent, but its mean severity is ~45× larger and
   its reserve ~40× larger.

The same `actuarial.js` produced all of it; only the book changed.

---

## 8. A proposed standard

### 8.1 Statement of Actuarial AI Opinion (template)

A short, signable instrument modeled on the statutory Statement of Actuarial Opinion that
accompanies an insurer's reserves:

> **Statement of Actuarial AI Opinion**
>
> I, *[name, credential]*, have been retained by *[organization]* to opine on the model risk
> of the AI system *[system name / version / hash]* used for *[regulated decision]* over the
> period *[…]*.
>
> **Scope.** I reviewed the exposure definition (unit of decision, error definition, severity
> basis, cohort design), the data, and the measurement methodology described in the
> accompanying Actuarial AI Report.
>
> **Opinion.** In my opinion, for the stated scope and assumptions:
> 1. the **expected loss** and **frequency–severity** characterization fairly present the
>    system's central tendency (`E[L] = $1,049/decision`);
> 2. the **reserve** of `$15.7M` makes reasonable provision for incurred-but-not-reported
>    model failures, including a risk margin to a `TVaR₀.₉₅` severity basis;
> 3. the **aggregate economic capital** of `$6.57M` at a systemic-correlation assumption of
>    `ρ = 0.15` (with `$163.55M` as the undiversified upper bound) is adequate for tail risk at
>    the stated `α = 0.95`; the figure is sensitive to `ρ`, which is disclosed;
> 4. **Actual-to-Expected monitoring** is in place; as of this opinion the cohorts *75–84*
>    and *85+* exceed the materiality threshold (`A/E = 1.39, 1.40`) and are flagged for
>    re-pricing and remediation.
>
> **Reliances and limitations.** *[ground-truth lag, exchangeability, cohort design, scope
> exclusions — see §9].*
>
> *Signature / date / credential / governing standards.*

### 8.2 ASOP-style skeleton for AI model risk

A standard-of-practice skeleton (in the spirit of the U.S. Actuarial Standards of Practice)
the profession could adopt for AI model-risk work:

1. **Purpose & scope** — when an "Actuarial AI Opinion" is required; covered decisions.
2. **Exposure definition** — defining a decision, an error, severity, and cohorts; documenting
   the ground-truth source and its lag.
3. **Data quality & exchangeability** — representativeness; population-shift disclosure.
4. **Frequency–severity measurement** — estimating `f`, the severity distribution, `E[L]`.
5. **Credibility** — selecting `k`; blending cohort experience with priors.
6. **Tail measurement** — selecting `α`; computing VaR/TVaR; coherence considerations.
7. **Reserving** — development methodology for IBNR model failures; risk margin basis.
8. **Capital** — economic-capital basis; diversification and aggregation treatment.
9. **A/E monitoring** — cohort design, materiality thresholds, trigger-to-action linkage.
10. **Communication** — the Opinion and Report; reliances, limitations, and disclosures.

---

## 9. Limitations (read this — it is what makes the framework credible)

A framework that claims to *replace* incumbent methods has to be honest about where it is
weak. It is.

1. **Ground-truth lag is the load-bearing assumption.** IBNR development requires that
   surfaced errors are informative about unsurfaced ones — i.e. a stable, estimable reporting
   pattern. The tool now models this properly — a development triangle with chain-ladder,
   Bornhuetter-Ferguson, and an ODP bootstrap that quantifies the reserve *distribution* (§5.5)
   — rather than a single factor. Two honest gaps remain: (a) if ground truth is *never*
   observed for some decisions (the denied patient who never appeals, the declined applicant who
   never gets to default), the tool now applies **reject inference** — imputing censored outcomes
   from `P(error | score)` (§5.7) — which recovers most of the bias when censoring is ignorable
   given the score, though whatever is missing-not-at-random (MNAR) beyond the score is
   irreducible without stronger assumptions or a controlled hold-out; and (b) severity-tail
   uncertainty is now
   **propagated** — each bootstrap claim is costed from the empirical body spliced with a fitted
   **GPD tail** (§5.5) — but the tail index `ξ̂` is itself estimated from limited exceedances, so
   the tail of the tail remains the least certain part of any reserve.

2. **Exchangeability / stationarity.** A/E, credibility, and reserving all assume cohorts are
   reasonably exchangeable over the measurement window. Under fast distribution shift the
   "expected" basis itself decays — which is *why* continuous A/E exists, but A/E detects
   drift, it does not prevent the lag before detection.

3. **Overlap with conformal prediction is real.** For pure *coverage/frequency* questions
   under exchangeability, conformal prediction is rigorous and arguably cleaner than a
   home-grown frequency estimate. The actuarial framework does **not** beat it at marginal
   coverage; it *extends past* it (severity, reserve, capital, cohort A/E, signed opinion).
   The honest framing is **layered**: conformal prediction can feed calibrated miss
   probabilities *into* the frequency term, and the actuarial layer does the rest. Claiming
   the actuarial toolkit replaces conformal prediction would be overreach; claiming it
   answers the governance questions conformal prediction does not is the defensible claim.

4. **Cohort-design risk.** A/E and credibility are only as good as the rating cells. Too
   coarse and drift hides inside an aggregate; too fine and every cell is low-credibility
   noise. The tool mitigates the small-cell problem with **Poisson 95% control limits** (a
   cohort must be significant *and* material to flag, §5.3), but cohort choice can still
   *encode* the very bias the regulation polices — the same double-edge actuaries already
   manage in rating. Risk-adjusting the "expected" basis so drift is not confounded with
   case-mix is a further refinement.

5. **Severity estimation is hard and political.** Pricing the dollar cost of a wrongful
   denial (harm, appeal cost, litigation, reputational loss) involves contestable choices.
   The framework makes those choices *explicit and auditable* rather than eliminating them —
   which is an improvement over hiding them, not a claim to objectivity.

6. **Economic capital now uses an aggregate model, but the dependence parameter is a
   judgment.** Earlier versions only reported the undiversified `N·(TVaR − E[L])` bound. The
   tool now builds the aggregate loss distribution with a shared systemic factor (§5.6) and
   reads `TVaR_α(S) − E[S]` off it, with the undiversified figure retained as a conservative
   reference. The residual limitation is honest: the capital number is highly sensitive to the
   **systemic-correlation `ρ`**, which is an assumption, not an observable — and the synthetic
   book's *base* data is still iid, so `ρ` is imposed at the aggregate layer rather than
   estimated from correlated production incidents. Calibrating `ρ` from real common-cause
   failure data is the natural next step.

7. **Not a substitute for causal/fairness analysis.** The framework quantifies and reserves
   risk; it does not by itself establish *why* a cohort drifts or whether a disparity is
   unlawful. It is the measurement and accountability layer, designed to sit *alongside*
   feature attribution and bias testing, not to replace their diagnostic role.

**Net claim, stated carefully:** the actuarial toolkit should *replace the single accuracy
number and naked "95% confidence" as the governance-grade standard*, and should *subsume*
SHAP/LIME from "the explanation" to "one diagnostic input." It should sit *alongside and on
top of* conformal prediction, not pretend to supersede it.

---

## 10. References

1. NAIC. *Model Bulletin on the Use of Artificial Intelligence Systems by Insurers* (adopted
   Dec 4, 2023). National Association of Insurance Commissioners.
2. Colorado Division of Insurance. *Regulation 10-1-1: Governance and Risk Management
   Framework Requirements for Life Insurers' Use of External Consumer Data and Information
   Sources, Algorithms, and Predictive Models* (eff. Nov 14, 2023); **SB21-169**, *Protecting
   Consumers from Unfair Discrimination in Insurance Practices.*
3. International Actuarial Association, AI Task Force. *Artificial Intelligence Governance
   Framework* (Nov 2025).
4. NIST. *Artificial Intelligence Risk Management Framework (AI RMF 1.0)*, NIST AI 100-1
   (2023).
5. Bühlmann, H. & Gisler, A. *A Course in Credibility Theory and its Applications.* Springer
   (2005).
6. Klugman, S., Panjer, H. & Willmot, G. *Loss Models: From Data to Decisions.* Wiley (SOA
   exam text).
7. Friedland, J. *Estimating Unpaid Claims Using Basic Techniques* (development/IBNR). CAS.
8. Artzner, P., Delbaen, F., Eber, J.-M. & Heath, D. "Coherent Measures of Risk."
   *Mathematical Finance* 9(3), 1999 (VaR vs. TVaR coherence).
9. Angelopoulos, A. & Bates, S. *A Gentle Introduction to Conformal Prediction and
   Distribution-Free Uncertainty Quantification.* arXiv:2107.07511 (2021).
10. Lundberg, S. & Lee, S. "A Unified Approach to Interpreting Model Predictions" (SHAP),
    NeurIPS 2017; Ribeiro, M. et al. "Why Should I Trust You?" (LIME), KDD 2016.
11. U.S. Senate Permanent Subcommittee on Investigations. *Report on Medicare Advantage
    insurers' use of predictive technology to deny post-acute care* (2024); and class-action
    complaints concerning *nH Predict* prior-authorization decisions (2023–).

---

*Reproducibility:* every numeric figure in §6 and §7 is emitted by `js/actuarial.js` +
`js/sample-data.js` at the stated defaults and rendered live in `tool.html` (use the scenario
switcher to reproduce each domain). See
`README.md` for how to run and verify locally.
