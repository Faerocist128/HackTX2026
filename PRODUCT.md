# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** car owners who already have an auto loan and want to know whether refinancing makes sense for them now, and if not, what would get them there. Many are not finance-literate and may be worried about money; some are carrying late payments or owe more than the car is worth.
- **This weekend:** HackTX judges (Toyota and Capital One tracks) evaluate IRA through a live demo. The demo usually starts from one of three seeded people (Rachel: ready, Alex: almost, Riley: rebuilding), so the persona flow must work end to end and tell its story quickly.

## Product Purpose

IRA answers two separate questions about refinancing an existing car loan, from the person's own bank data:

1. **Approval odds:** how likely is a lender to say yes?
2. **Refinance value:** is refinancing actually worth it for you, after fees and over the whole loan?

The user can try different loans (length, rate, extra payments, payment habit, loan type, lender type) and watch both scores move live. They then get a plan of next steps, each priced in points by re-running the scores. Success means the person leaves knowing whether to refinance now, and if not, exactly what to do and roughly when to check back.

## Positioning

IRA keeps "will a lender say yes" apart from "is it worth it for you", where a typical refinance calculator blends them or leads with a monthly-payment teaser. It shows which factors drive each score and what each next step is worth in points, computed by a deterministic engine rather than invented by an AI. It is not lead generation and offers no pre-approval.

## Operating Context

Flow (five steps): **Your money** (pick a demo person or enter your own info) → **Your car** (VIN, or year/make/model, plus miles and condition) → **Try it out** (sliders, with both scores and the payoff chart visible while sliding) → **Your scores** (factor breakdown and a plain-language explanation) → **Your plan** (checkable next steps that preview the score gain).

Used on a laptop during demos and on phones by real users; the sliders page pins both scores to the bottom of the screen on phones.

## Capabilities and Constraints

- Name: **IRA** (stands for Integrated Refinancing Audit, but the full name never appears on the site).
- Financial data comes only from Capital One's Nessie API, a mock bank with no real accounts. "Use my own info" is written into Nessie and read back. There is no offline mode.
- Car value: NHTSA for VIN decoding and the year/make/model catalog (20 makes), Gemini for price when new and depreciation, then the research brief's depreciation formula. High-mileage cars fall to scrap value.
- Gemini writes the explanation and step wording only. The engine computes every score and every "+N points".
- Both API keys are required; without them the app shows only a setup screen.
- Scores are 1–100 with red (1–39), yellow (40–69) and green (70–100) bands. A knockout (for example 2+ late payments in 12 months, or owing more than 130% of the car's value) caps approval odds at 39.
- Recall warnings come from a mock provider and are not real recall data.
- Undecided: whether "Use my own info" should be the primary path after the hackathon; any real lender or Toyota Financial Services integration (the code has a TFS copy mode that is off without sign-off).

## Brand Commitments

- **Voice:** plain language at about a 7th-grade reading level. Warm, encouraging, never shaming. Short sentences, "you". Jargon (APR, LTV, DTI) is always explained.
- **No promises:** everything is an estimate. Never promise approval or a rate. Lead with total cost after fees, not just the monthly payment.

## Evidence on Hand

- Research brief: `ira/docs/refi-research.pdf` (rate tiers, underwriting thresholds, depreciation, worked examples). All scoring thresholds cite it.
- Three seeded demo people in Nessie (`ira/lib/nessie/personas.ts`).
- Original design reference: `ira/design/refinance-audit.html`.
- No testimonials, users, partner lenders, or real savings data exist. Do not fabricate them.

## Product Principles

1. **Two questions, never blended.** Approval odds and refinance value are always shown and explained separately.
2. **Every number is earned.** Scores, savings and step impacts come from the engine and add up on screen; the AI only explains.
3. **Total cost over teaser payments.** A lower monthly payment that costs more overall is called out, not celebrated.
4. **Not yet means here's your path.** People who aren't ready get concrete, priced next steps, never a dead end.
5. **Honest about estimates.** Mock data and estimated values are labeled as such; nothing implies a credit decision.

## Accessibility & Inclusion

WCAG 2.2 AA is required: contrast in both light and dark themes, full keyboard use (including sliders and step checkboxes), screen-reader announcements when scores change, and reduced-motion support for the gauges and confetti. Readers may be stressed about money; the copy must stay calm and non-judgmental.
