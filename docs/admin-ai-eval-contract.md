# Admin AI — Eval Contract Review

One page: what each eval question asserts and the product rule it encodes.
Every rule here is a decision Andrei owns — veto or amend any line and the
suite changes to match. Run: `RUN_ADMIN_AI_EVAL=1 npx vitest run scripts/admin-ai-eval.test.ts --disableConsoleIntercept` (~$0.30).

## The 9 questions

| # | Key | Question (gist) | Hard assertions | Product rule encoded |
|---|-----|-----------------|-----------------|----------------------|
| 1 | cohort-recall | Interested/potential for 26 Coral Catch | Declined-only members appear **nowhere**; every Interested/PC member appears somewhere; shortlist contains only real cohort members | Named cohort + status = exact tag semantics. Rosters are complete **by construction** (code appends anyone the model dropped) |
| 2 | cohort-big | Potential candidates for 26 Maldives ScubaSpa (27 people) | Union recall 1.0 over the full cohort | Big rosters don't truncate: top-10 ranked + the rest behind "Show more". Nothing silently dropped |
| 3 | status-trap | Who is **joining** ScubaSpa | Every Joining member surfaces; PC-only leakage into the shortlist is *reported but not failed* | Status words map to exact tag statuses; how strictly the model separates adjacent statuses stays its judgment |
| 4 | structured-fact | Which contacts speak Spanish | Recall 1.0 over the `languages` **field**; rescue scan must have run | Structured enumeration is deterministic (prefilter + append). Since r6: contacts failing the field but with other evidence (notes, essays) surface with stated uncertainty — admin decides |
| 5 | note-canary | Personal project idea re: ocean-animal perception | Yang Yang (single call-note evidence) must surface | One admin-authored call note weighs as much as an application essay. A one-line note is never buried by 340k tokens of applications |
| 6 | negative-control | Professional experience filming under polar ice | No fabricated exact matches; the closest partial match must be surfaced in the answer **or named in uncertainty** | When nobody fully qualifies: empty shortlist + "closest candidates and their gaps", never a padded list, never a bare blank |
| 7 | declined-recall | Who declined 26 Coral Catch | Every declined member surfaces; no non-declined member in the shortlist | Asking about declines lifts the default declined-exclusion. Decline data is reachable, just never mixed into positive rosters |
| 8 | broad-advisory | People with their own project initiatives (ambiguous bar) | Assumptions stated; ≤10 shortlist; matchStrength non-increasing. **No ground truth** — structural only | Ambiguous questions get: explicit interpretive assumptions + invitation to rephrase + judged ranked top-10. Precision over inclusiveness |
| 9 | qualifier-trap | Most underwater-filmmaking experience in Coral Catch cohort, "should own professional equipment" | **No field constraint fires** (`fieldConstraints` empty); prefilter stops at the cohort; shortlist ⊆ cohort; ranked | Quality adjectives (professional, experienced, advanced…) are ranking criteria, never hard filters. From the Jul 6 live over-filtering incident |

## Standing rules the suite enforces (approve / veto each)

1. **Hard filters fire only on exact vocabulary.** Tag categories/statuses, and
   field values that equal a complete catalog item verbatim ("Spanish",
   "Professional video camera"). Fragments and adjectives can never exclude
   anyone — enforced in code, not just prompt.
2. **Failure direction is inclusion.** A constraint that can't ground is dropped
   (disclosed) and the criterion goes to the model as judgment. Wrong exclusion
   is treated as strictly worse than wrong inclusion.
3. **Declined-by-default:** cohort questions without a status exclude
   declined-only members unless the question asks about declines. *(Andrei
   requested Jul 4.)*
4. **Missing structured data ≠ disqualified (r6).** Field/budget prefilters
   define the *confirmed* roster; excluded contacts get an evidence scan and
   surface with stated uncertainty when notes/essays suggest they qualify.
   Tag constraints are exempt — a tag is authoritative membership.
5. **Answer shape:** ranked top-10 shortlist (code-sorted by matchStrength) +
   "Show more" overflow + code-appended roster completeness for enumerations +
   mandatory assumptions and concerns.
6. **Near-miss tier:** only when a scan finds zero full matches, up to 3 partial
   matches per chunk surface with their gaps named. Double-gated so broad
   queries can't inflate.
7. **Budget minimums** parse the budget field + conversation facts; "under /
   below / limited" fail; missing budget now goes through the rescue scan (rule 4).

## Open questions (not yet decided — flag if you care)

- **Application-less contacts are invisible.** The corpus is built from
  applications, so a WhatsApp-only contact with rich notes can never appear in
  any answer. Fixing this means changing corpus eligibility, not filters.
- **Top-30 vocabulary sampling:** a rare list-field value (below rank 30) can't
  ground a prefilter; the criterion falls to the evidence scan. Benign but a
  roster for a rare value won't get the recall-1.0 guarantee.
- **Eval cost/cadence:** ~$0.30 and ~5 min per run. Current practice: run after
  every prompt/architecture change, before merges.
