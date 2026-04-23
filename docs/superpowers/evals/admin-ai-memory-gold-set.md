# Admin AI Memory Gold Set

This document describes how to build, score, and maintain the gold set
that backs the dossier evaluation harness in
`scripts/admin-ai-memory/eval.ts`.

The gold set is a deliberately chosen, reusable calibration set — not a
full manual review of the whole CRM.

## Sizing

Aim for **20-30 contacts**. Mix:

- 5-7 easy / typical contacts
- 4-6 contacts with sparse data (one short application, no notes)
- 3-5 contacts with contradictory data (notes contradicting answers,
  or multiple applications with conflicting framing)
- 4-5 contacts with high-text density (long ultimate_vision /
  inspiration_to_apply / admin notes)
- 3-5 operationally risky edge cases (red-flag concerns, mismatched
  expectations, hard-to-verify claims)

If the cohort grows beyond ~50 contacts, expand the gold set rather
than rotating contacts in and out — stable membership keeps scores
comparable across model + prompt versions.

## Reviewer workflow

1. Pull the contact's persisted dossier from `crm_ai_contact_dossiers`.
2. Open the underlying evidence: applications, contact notes,
   application admin notes (and any future connectors).
3. For each rubric category, decide the score:
   - `0` — bad: factually wrong, hallucinated, or harmful framing.
   - `1` — mixed: roughly correct but missing important nuance,
     overclaiming on weak evidence, or noisy.
   - `2` — good: accurate, useful, and grounded.
4. Apply hard-fail rules (any single trigger forces a `hard_fail`
   verdict regardless of total):
   - `factual_hallucination_on_core_facts`
   - `missing_obvious_major_concern`
   - `unsupported_strong_inference`
5. Write the scores to a JSON file:

```json
{
  "model": "gpt-5.4-nano",
  "promptVersion": "dossier-prompt-v1",
  "entries": [
    {
      "contactId": "<uuid-or-alias>",
      "scores": {
        "factualAccuracy": 2,
        "fitSignalRecall": 2,
        "concernRecall": 1,
        "contradictionHandling": 2,
        "uncertaintyHonesty": 2,
        "evidenceGrounding": 2,
        "usefulnessForRanking": 2
      },
      "hardFails": []
    }
  ]
}
```

6. Run the harness:

```bash
node --experimental-strip-types scripts/admin-ai-memory/eval.ts gold-set.json
```

## Categories — what to look for

- **factualAccuracy** — Does the dossier match the actual application
  answers, notes, and admin notes? Wrong country, wrong program, wrong
  certification level all count here.
- **fitSignalRecall** — Did the dossier capture the strongest reasons
  this contact would be a good fit? Missing the obvious win is bad.
- **concernRecall** — Did the dossier surface the strongest reasons to
  slow down? Missing a major red flag is a hard fail (see hard-fail
  rules).
- **contradictionHandling** — When sources contradict (notes vs answers,
  multiple applications), is that called out under `contradictions`?
- **uncertaintyHonesty** — Does the dossier name what it does not know
  under `unknowns`, instead of guessing?
- **evidenceGrounding** — Do the `evidenceAnchors` actually point to
  chunks that support the claim? Weak or missing anchors lower this.
- **usefulnessForSelection** — Imagine this dossier sitting in the
  global one-pass cohort prompt. Does it give the model enough signal to
  make a good call without re-reading the raw evidence?

## Storing the gold set

Do **not** commit reviewer notes containing applicant PII into the
repository. Either:

- Keep the gold-set file local (add it under `/scripts` scratchpad,
  which is gitignored), or
- Anonymize / synthesize the entries before committing.

Aggregated score breakdowns (verdict counts, per-category averages) are
safe to commit and useful to track over time.

## Comparing prompt + model versions

Each gold-set file should record:

- `model` — the OpenAI model name used
- `promptVersion` — the `DOSSIER_GENERATOR_VERSION` constant from
  `src/lib/admin-ai-memory/dossier-prompt.ts`

When iterating on the prompt, regenerate the dossiers, re-score the
gold set, and diff verdict counts. A drop in `strong` verdicts or any
new `hard_fail` is a regression.
