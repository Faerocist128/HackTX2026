---
target: ira/app/audit
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/abelreji/HackTX2026/ira/app/audit/page.tsx"
target_fingerprint: "sha256:8ac3fae648f5e920a0ffff44647f5a7795c35d20a65ce6f8dbcec02c241f2a69"
target_path: /Users/abelreji/HackTX2026/ira/app/audit/page.tsx
timestamp: 2026-10-25T04-13-32Z
slug: ira-app-audit-page-tsx
closed: true
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent). Browser visualization skipped: no browser tool in session; design review used user screenshots + source.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Scores update live, but total cost ("Save $X overall") is below the fold; sticky column shows a near-flat chart |
| 2 | Match System / Real World | 3 | "points" = rate points here, score points elsewhere; H1 "audit" is jargon |
| 3 | User Control and Freedom | 3 | Reset has no undo/confirm |
| 4 | Consistency and Standards | 2 | Red = brand, CTA, slider fill, New-loan line and "bad"; step "Try it out" vs H1 "audit" |
| 5 | Error Prevention | 3 | Bounded sliders, APR clamp; cash-out silently adds $2,000 |
| 6 | Recognition Rather Than Recall | 2 | Current loan not marked on any slider |
| 7 | Flexibility and Efficiency | 2 | 180-step APR slider, no typed entry or "use likely rate" |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, but 6 levers in one card; ~7px gauge ticks |
| 9 | Error Recovery | 2 | Knockout banner explains why, no next step |
| 10 | Help and Documentation | 3 | Good tips, but hover/focus only, no Esc, can clip off-screen |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict
Structure is product-specific (two question-headed dials, likely-rate band on APR track, honest APR clamp note, total-cost bottom line). Visual language is category-generic (pill cards, speedometer, red slider fill); current-loan anchor missing; chart lines overlap so the largest graphic says little.
Detector: 1 advisory finding — bounce-easing, ira/components/stage2/ScoreGauge.tsx:83 (needle overshoot cubic-bezier(.34,1.3,.64,1)); real. No contrast findings; design review found WCAG gaps the scan can't (1.27:1 borders, outline:none on .field:focus globals.css:80, noisy live regions). No overlays (no browser).

## Overall Impression
Right core (two honest live scores + likely-rate band), but weakest signals hold the best real estate and the knockout state is a dead end. Biggest opportunity: make the always-visible column answer "what does this cost me" and turn the knockout into a path.

## What's Working
1. Likely-rate band on the APR track + below-range note.
2. Two dials headed by their questions, with text band labels.
3. Accessibility groundwork: aria-valuetext, live regions, aria-pressed segments, reduced-motion count-up.

## Priority Issues
- [P1] Knockout state is a dead end on a page that implies control. Fix: amber card with clearing condition, "See your path →" to /plan, show uncappedScore. Command: /impeccable clarify
- [P1] Total cost buried; sticky column shows weakest signal. Fix: compact "Save $X overall · $Y/mo" in sticky column + phone bar; demote chart, replace with "paid off at the same pace" when lines overlap. Command: /impeccable layout
- [P2] Red overloaded. Fix: neutral slider fill and New-loan line; red only for red band, brand red only for the primary CTA. Command: /impeccable colorize
- [P2] No current-loan anchor; 6 levers at once. Fix: "your loan today" markers on term/APR tracks; loan type + lender into "More options". Command: /impeccable distill
- [P2] WCAG 2.2 AA gaps: tips no Esc / not aria-describedby; 1.27:1 borders; outline:none on fields; up to 4 live-region announcements per keypress; Recharts ignores reduced motion. Fix: one debounced announcement, Esc on tips, 3:1 borders, real focus ring. Command: /impeccable harden

## Persona Red Flags
- Jordan: "0.75 points" read as score points; "Late" read as a past-tense question; Variable/Cash-out need the hint; red fill reads as error.
- Sam: at 200% zoom dials drop to page bottom and bottom bar is aria-hidden; APR range not linked to slider; weak select focus.
- Casey: chart far below sliders on phones; bottom bar numbers+color only; fiddly APR by thumb; hover tips; Reset in thumb reach without undo.
- Money-stressed owner with 2 lates: red "no" first; odds stuck at 39 unexplained; confetti can fire on value; "expected late fees" restates past; no "what to do and when" here.

## Minor Observations
- Duplicate back links at top; "→" glyph on red labels reads as "go"; sticky column ~850px > 768px viewport; loading skeleton lacks SR text; selected segment ~1.1:1; dark-mode --brand 3.73:1 (fine for thumb, not red text); needle bounce → ease-out.

## Questions to Consider
- Should a knocked-out user start in "what it'd be worth once eligible" mode?
- Is a speedometer the right metaphor for an estimated, capped likelihood?
- What if current loan vs slider loan, in dollars, were the hero, with scores alongside?
