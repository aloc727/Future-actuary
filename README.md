# AI Risk Lens — An Actuarial Standard for AI Explainability

> **Thesis:** Today's AI "explainability" inherits software-engineering defaults — one
> accuracy number, a "95% confidence" figure, SHAP/LIME feature attributions. Actuarial
> science has a far richer toolkit for **quantifying, pricing, and reserving against uncertain
> future losses**, and it answers the governance-grade questions the software paradigm ignores:
> not just *how often* a model errs, but *how badly each error hurts, how much trust an output
> deserves, how much capital to hold against tail failures,* and *whether a credentialed
> professional will sign an opinion on the model's risk.*

This repository is a **standalone static website** (no backend — all computation runs
client-side) that develops that idea rigorously and demonstrates it on a live, interactive
worked example.

## What's here

| Page | What it is |
|---|---|
| **`index.html`** | Landing page: the thesis, the "old vs. new" comparison, the regulatory anchor, and the seven method mappings. |
| **`paper.html`** | The full framework paper, *Reserving Against the Black Box*, rendered from Markdown with math (MathJax). |
| **`tool.html`** | The **AI Risk Lens** — a live tool that computes the actuarial metrics on a 10,000-decision synthetic prior-authorization book, with Chart.js visuals and tweakable inputs. |
| **`docs/ACTUARIAL_AI_EXPLAINABILITY.md`** | Markdown source of the paper (single source of truth). |

```
/index.html          landing page
/paper.html          framework paper (renders the markdown)
/tool.html           interactive "AI Risk Lens"
/css/styles.css
/js/actuarial.js     pure actuarial functions (frequencySeverity, buhlmannCredibility,
                     actualToExpected, varTvar, ibnrReserve, economicCapital)
/js/sample-data.js   deterministic, seeded synthetic 10k-decision portfolio
/js/app.js           UI wiring + Chart.js visuals
/docs/ACTUARIAL_AI_EXPLAINABILITY.md   the paper, in Markdown
/README.md
```

## The idea in one table

| Actuarial method | What it measures for an AI system |
|---|---|
| **Frequency × Severity** | How *often* the model errs × how *badly* each error hurts — a full loss distribution, not one accuracy number. |
| **Credibility** (`Z = n/(n+k)`) | How much weight a given output/cohort deserves vs. the base rate, given the experience behind it. |
| **IBNR / reserving** | Model failures incurred but **not yet surfaced** (delayed ground truth) — and the reserve to hold. |
| **Actual-to-Expected (A/E)** | Cohort-level, continuous drift / miscalibration monitoring vs. one-time validation. |
| **VaR / TVaR (CTE)** | Sizing the catastrophic tail that "95% confidence" throws away. |
| **Economic capital** | The buffer against AI tail risk: `TVaR_α − E[loss]`. |
| **Control cycle + signed opinion** | A credentialed accountability layer: a *Statement of Actuarial AI Opinion*. |

It is **timely**: under the **NAIC Model AI Bulletin** and **Colorado SB21-169 / Reg
10-1-1**, the legal test for an insurer's AI is already whether outcomes have a *"legitimate
actuarial basis."* It is **novel**: prior work (IAA AI Governance Framework, SOA, NIST AI
RMF) covers *actuaries governing AI* — this inverts it to use the actuarial *measurement*
toolkit as the explainability standard. It is **honest**: the paper positions the framework
as *complementary to* conformal prediction, not a replacement, and §8 lists the real limits.

## Run it locally

No build step. Any static file server works (the paper page uses `fetch`, so open it over
HTTP, not `file://`):

```bash
# from the repo root
python3 -m http.server 8000
# then visit:
#   http://localhost:8000/            (landing page)
#   http://localhost:8000/paper.html  (framework paper)
#   http://localhost:8000/tool.html   (interactive tool)
```

## Verify the numbers and invariants

The tool's figures are deterministic (fixed seed) and match **Section 6** of the paper. You
can reproduce and invariant-check them with Node (the JS modules run unchanged in Node):

```bash
node -e '
const A=require("./js/actuarial.js"), D=require("./js/sample-data.js");
const r=D.generatePortfolio({drift:0.35});
const fs=A.frequencySeverity(r), vt=A.varTvar(fs.losses,0.95);
console.log("frequency", (100*fs.frequency).toFixed(2)+"%", "expLoss $"+Math.round(fs.expectedLoss));
console.log("VaR $"+Math.round(vt.var), "TVaR $"+Math.round(vt.tvar), "TVaR>=VaR:", vt.tvar>=vt.var);
'
```

Invariants the framework guarantees (and the tool preserves live):

- `TVaR_α ≥ VaR_α` always;
- reserve `≥ 0` and IBNR count `≥ 0`;
- credibility `Z` increases with experience `n`;
- with **drift = 0**, every cohort's `A/E ≈ 1.0` (drag the *Production drift* slider to 0% in
  the tool to watch the bars collapse onto the `A/E = 1.0` line).

## Deploy

It's pure static files — deploy anywhere:

- **GitHub Pages:** push to the repo, then *Settings → Pages → Deploy from branch* and pick
  the branch + `/ (root)`. The site is served at `https://<user>.github.io/<repo>/`.
- **Netlify / Vercel / Cloudflare Pages:** point at the repo, no build command, publish
  directory = repo root.
- **Any web server / S3 bucket:** copy the files as-is.

All third-party libraries (Bootstrap 5, Chart.js, MathJax, marked) load from CDNs, so there
are no dependencies to install.

## Status & disclaimer

This is an **educational research artifact** that argues a position and demonstrates it on
*synthetic* data. It is **not** actuarial, legal, medical, or investment advice, and the
worked example is not a statement about any specific company or product.
