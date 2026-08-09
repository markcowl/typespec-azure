# A9/A10 TDD Implementation Plan

**Created:** 2026-08-08  
**Status:** Ready for implementation

## Overview

Features A9 and A10 close the biggest remaining suppression gaps in the breaking-change tool:

- **A9: New vs Existing Suppression Classification** tells CI whether an approval already existed on the base branch or was introduced/changed in the PR.
- **A10: Version Scoping with `since:`** makes approvals precise when the same breaking change shape appears in more than one stable version transition.

Together they prevent two failure modes:

1. **Silent approval churn**: today every suppressed finding looks “new,” so CI cannot distinguish old approvals from newly-added ones.
2. **Over-broad approvals**: today `since:` behaves like a lower bound, so one approval can accidentally suppress a later recurrence of the same change.

The implementation should be test-driven. Each phase below starts with the tests to write first, then the code to make them pass.

---

## A9 Implementation Plan

### Phase 1 — Collect suppressions from compiled programs

**Goal**

Create a normalized suppression inventory for one compiled program that can be compared across compilations without relying on TypeSpec object identity.

**Recommended design**

Add a new normalization layer, for example `src\suppression\inventory.ts`, that produces records like:

```ts
interface NormalizedSuppressionRecord {
  decorator: "approvedBreakingChange" | "approvedUnversionedChange";
  anchorIdentity: string;
  placement: "direct" | "ancestor";
  path?: string;
  kind?: DiffKind;
  since?: string;
  reason: string;
  sourceFile?: string;
  sourceLine?: number;
  localIndex: number;
}
```

`anchorIdentity` must be stable across compilations:

- property/model/interface/namespace: declaration identity
- operation: normalized wire identity
- parent placement: same anchor identity, with `path` participating in the comparison key

**Tests to write first**

1. Collects a direct `@approvedBreakingChange` on a property.
2. Collects a parent-placed `@approvedBreakingChange` with `path`.
3. Collects `@approvedUnversionedChange`.
4. Collects multiple decorators on the same declaration in declaration order.
5. Preserves `kind`, `path`, `since`, and `reason`.

**Example snippet**

```typespec
@versioned(Versions)
@service
namespace Test;

enum Versions { v1: "2024-01-01", v2: "2025-01-01" }

model Widget {
  @approvedBreakingChange("legacy removal", #{ kind: "ResponsePropertyRemoved", since: "2025-01-01" })
  @removed(Versions.v2)
  legacy?: string;
}
```

**Expected file changes**

- New: `src\suppression\inventory.ts`
- Update: `src\suppression\decorators.ts`
- Update: `src\index.ts`
- New/updated tests: `test\suppression-inventory.test.ts`
- Optional helper: `test\test-host.ts` for base/head compile helpers

**Acceptance criteria**

- A single program can be scanned into deterministic suppression records.
- Records are stable across recompilations of equivalent code.
- No comparison logic yet; this phase only extracts data.

---

### Phase 2 — Identity-based comparison between base and head

**Goal**

Match base-branch suppressions to head-branch suppressions by stable identity.

**Recommended design**

Define two keys:

- **Identity key**: decorator kind + anchor identity + placement + normalized path
- **Metadata key**: kind + path + since + reason

Matching rules:

- **Direct placement**: compare by declaration identity
- **Parent placement**: compare by ancestor identity + `path`

Do **not** include `reason` or `since` in the identity key; those are metadata used to detect modifications.

**Tests to write first**

1. Direct suppression on the same property matches across programs.
2. Parent suppression on the same model + same `path` matches across programs.
3. Parent suppression on the same model + different `path` does not match.
4. Operation-level suppression matches by normalized operation identity, not source position.

**Example snippet pair**

Base:

```typespec
@approvedBreakingChange("approved", #{ path: "properties.legacy" })
model Widget {
  @removed(Versions.v2) legacy?: string;
}
```

Head:

```typespec
@approvedBreakingChange("approved", #{ path: "properties.legacy" })
model Widget {
  @removed(Versions.v2) legacy?: string;
}
```

**Expected file changes**

- New: `src\suppression\classification.ts`
- New/updated tests: `test\suppression-classification.test.ts`
- Optional reuse of `src\diff\operation-identity.ts` for operation anchors

**Acceptance criteria**

- Matching does not rely on `Type` object identity.
- Direct and parent placement follow the design rules exactly.
- Multiple suppressions on one node are independently matchable.

---

### Phase 3 — Classify NEW / EXISTING / REMOVED / MODIFIED

**Goal**

Turn matched inventories into explicit classification results consumable by CI and the analysis pipeline.

**Recommended design**

Produce results like:

```ts
type SuppressionClassificationKind = "new" | "existing" | "removed" | "modified";
```

Rules:

- **NEW**: present only in head
- **EXISTING**: identity matches and metadata matches
- **REMOVED**: present only in base
- **MODIFIED**: identity matches and any metadata differs (`kind`, `path`, `since`, `reason`, decorator family)

For modified entries, keep both base and head metadata so reviewers can see what changed.

**Tests to write first**

1. New suppression detected.
2. Existing unchanged suppression detected.
3. Removed suppression detected.
4. Modified `reason` detected.
5. Modified `since` detected.
6. Modified decorator family detected (`approvedBreakingChange` vs `approvedUnversionedChange`).

**Example snippet pair**

Base:

```typespec
model Widget {
  @approvedBreakingChange("old reason")
  @removed(Versions.v2)
  legacy?: string;
}
```

Head:

```typespec
model Widget {
  @approvedBreakingChange("new reason")
  @removed(Versions.v2)
  legacy?: string;
}
```

Expected: `MODIFIED`

**Expected file changes**

- Update: `src\suppression\classification.ts`
- Update: `src\types.ts` with classification types
- New/updated tests: `test\suppression-classification.test.ts`

**Acceptance criteria**

- Every normalized suppression is classified exactly once.
- Modified detection is metadata-sensitive and identity-stable.
- Output is deterministic even with duplicate decorators on a node.

---

### Phase 4 — Integrate classification into the analysis pipeline

**Goal**

Make suppression classification available during `analyzeBaseAndHead`, and attach classification to suppressed findings that use head-branch approvals.

**Recommended design**

1. In `analyzeBaseAndHead`, build base/head suppression inventories before applying suppressions.
2. Compare them and build a lookup keyed by head suppression identity.
3. When `applySuppressions` chooses a matching head suppression, return enough information to associate the finding with the normalized suppression record.
4. Enrich the finding with:
   - matched suppression identity
   - suppression decorator family
   - suppression classification (`new`, `existing`, `modified`)

`analyzeProgram` should likely leave classification undefined because it has no base branch to compare against.

**Tests to write first**

1. `analyzeBaseAndHead` marks a suppressed finding as backed by a `NEW` approval.
2. `analyzeBaseAndHead` marks a suppressed finding as backed by an `EXISTING` approval.
3. Modified approval still suppresses the finding but carries `MODIFIED`.
4. Removed approvals appear in comparison output even if no head finding uses them.

**Example snippet pair**

Base:

```typespec
model Widget {
  @removed(Versions.v2)
  legacy?: string;
}
```

Head:

```typespec
model Widget {
  @approvedBreakingChange("approved in this PR")
  @removed(Versions.v2)
  legacy?: string;
}
```

Expected: finding is suppressed and tagged `NEW`.

**Expected file changes**

- Update: `src\suppression\suppression.ts`
- Update: `src\pipeline\orchestrator.ts`
- Update: `src\types.ts`
- New/updated tests: `test\orchestrator.test.ts`

**Acceptance criteria**

- Base/head analysis exposes suppression comparison results.
- Suppressed findings can be traced back to the exact head approval that suppressed them.
- Single-program analysis behavior remains unchanged.

---

### Phase 5 — CI label recommendation logic

**Goal**

Recommend PR labels from suppression classifications.

**Rules**

- New/modified `@approvedBreakingChange` => `BreakingChangeReviewRequired`
- New/modified `@approvedUnversionedChange` => `VersioningReviewRequired`
- Existing approvals alone => no label
- Removed approvals alone => no label, but include them in structured output for cleanup/reporting

**Tests to write first**

1. New breaking-change approval recommends `BreakingChangeReviewRequired`.
2. Modified breaking-change approval recommends `BreakingChangeReviewRequired`.
3. New unversioned approval recommends `VersioningReviewRequired`.
4. Mixed new approvals recommend both labels.
5. Existing-only or removed-only changes recommend no labels.

**Example snippet**

```typespec
model Widget {
  @approvedUnversionedChange("projection mismatch accepted", #{ kind: "RequestPropertyAdded" })
  nickname?: string;
}
```

Expected: `VersioningReviewRequired`

**Expected file changes**

- New: `src\pipeline\review-labels.ts` or similar
- Update: `src\pipeline\orchestrator.ts`
- Update: JSON/GitHub reporters if labels are emitted there
- New/updated tests: `test\reporter.test.ts` and/or `test\orchestrator.test.ts`

**Acceptance criteria**

- Label recommendations are deterministic and based only on new/modified approvals.
- Both label families can be emitted from one analysis run.
- Labels are available in structured output for CI automation.

---

## A10 Implementation Plan

### Phase 1 — Parse and store `since:`

**Goal**

Represent `since:` explicitly as suppression metadata, distinct from the current “version lower bound” behavior.

**Recommended design**

Prefer renaming internal metadata from `version` to `since` in TypeScript for clarity. If that is too much churn, keep a compatibility shim at the decorator boundary but normalize to `since` everywhere else.

`since` should represent the **specific introducing head version** for the approved finding, not “all later versions.”

**Tests to write first**

1. Decorator parser stores `since`.
2. Inventory extraction preserves `since`.
3. Comparison treats `since` as metadata for `MODIFIED`.

**Example snippet**

```typespec
model Widget {
  @approvedBreakingChange("first removal only", #{
    kind: "ResponsePropertyRemoved",
    since: "2024-01-01"
  })
  @removed(Versions.v2)
  legacy?: string;
}
```

**Expected file changes**

- Update: `lib\decorators.tsp`
- Update: `src\suppression\decorators.ts`
- Update: `src\suppression\inventory.ts`
- Update: tests that currently assume `headVersion >= since`

**Acceptance criteria**

- `since` is represented explicitly in normalized suppression metadata.
- Existing decorator syntax remains supported.
- No matching behavior changes yet beyond data representation.

---

### Phase 2 — Exact version-scoped matching

**Goal**

Make `since:` apply only to the intended version transition.

**Recommended design**

For Phase B findings:

- scoped suppression matches only when `finding.versionPair.headVersion === suppression.since`
- unscoped suppression remains eligible for later ambiguity checks

For direct placement and parent placement, the version rule is identical; only the identity/path matching differs.

**Tests to write first**

1. Since-scoped direct suppression matches only the specified pair.
2. Since-scoped parent suppression with `path` matches only the specified pair.
3. Same scoped suppression does not match earlier or later pairs.

**Example snippet**

```typespec
@versioned(Versions)
@service
namespace Test;

enum Versions {
  v1: "2023-01-01",
  v2: "2024-01-01",
  v3: "2025-01-01"
}

model Widget {
  @approvedBreakingChange("only for v1->v2 removal", #{
    kind: "ResponsePropertyRemoved",
    since: "2024-01-01"
  })
  @removed(Versions.v2)
  legacy?: string;
}
```

Expected:

- `2023-01-01 -> 2024-01-01`: suppressed
- `2024-01-01 -> 2025-01-01`: not suppressed

**Expected file changes**

- Update: `src\suppression\suppression.ts`
- New/updated tests: `test\suppression.test.ts`, `test\suppression-identity.test.ts`, `test\orchestrator.test.ts`

**Acceptance criteria**

- `since:` no longer acts as a lower bound.
- Matching is pair-specific and deterministic.

---

### Phase 3 — Ambiguity detection for unscoped approvals

**Goal**

Detect when one unscoped approval could cover the same logical finding in more than one stable baseline transition.

**Recommended design**

After diff classification but before final suppression decisions:

1. Group candidate Phase B findings by `(decorator family, diff kind, anchor identity, effective path)`.
2. For each unscoped approval, count distinct matching stable version transitions.
3. If the approval matches **exactly one** transition, allow it.
4. If it matches **2+** transitions:
   - keep the earliest occurrence suppressed only if that reflects the original approval intent
   - report later occurrences as unsuppressed
   - emit an ambiguity diagnostic instructing the author to split into multiple `since:`-scoped approvals

This is the key behavior for the oscillation scenario.

**Tests to write first**

1. Unscoped approval matching one baseline remains valid.
2. Unscoped approval matching two baselines becomes ambiguous.
3. Later ambiguous occurrence is reported unsuppressed.
4. Two separate `since:`-scoped approvals resolve the ambiguity.

**Example snippet**

```typespec
@versioned(Versions)
@service
namespace Test;

enum Versions {
  v2023: "2023-01-01",
  v2024: "2024-01-01",
  v2025: "2025-01-01",
  v2026: "2026-01-01"
}

model Widget {
  @approvedBreakingChange("legacyStatus removal approved")
  @removed(Versions.v2024)
  @added(Versions.v2025)
  @removed(Versions.v2026)
  legacyStatus?: string;
}
```

Expected:

- first removal can remain suppressed
- second removal is unsuppressed and flagged as ambiguous until split

**Expected file changes**

- Update: `src\suppression\suppression.ts`
- Update: `src\suppression\suppression-guidance.ts`
- New/updated tests: `test\suppression.test.ts`, `test\orchestrator.test.ts`

**Acceptance criteria**

- Unscoped approvals are allowed only when they match one distinct stable transition.
- Ambiguous later recurrences are not silently suppressed.
- Guidance points authors to `since:`-scoped replacements.

---

### Phase 4 — Error/diagnostic reporting for ambiguous suppressions

**Goal**

Surface ambiguity clearly in tool output and IDE diagnostics.

**Recommended design**

Add a dedicated diagnostic code such as `ambiguous-suppression` with:

- target: decorator anchor declaration
- message: approval matches multiple stable transitions; split by `since:`
- optional related info: list of conflicting version pairs
- optional codefix guidance text, even if no auto-fix is implemented yet

Also update suppression guidance so generated examples include `since:` when ambiguity is detected.

**Tests to write first**

1. Ambiguous approval emits a diagnostic at the decorator site.
2. Diagnostic mentions the conflicting version pairs.
3. Suppression guidance for the ambiguous later finding includes a `since:` example.

**Example message**

> `@approvedBreakingChange` on `Widget.legacyStatus` matches removals in `2023-01-01 -> 2024-01-01` and `2025-01-01 -> 2026-01-01`. Split this into separate approvals with `since: "2024-01-01"` and `since: "2026-01-01"`.

**Expected file changes**

- Update: `src\suppression\diagnostics.ts`
- Update: `src\lib.ts` diagnostic definitions
- Update: `src\suppression\suppression-guidance.ts`
- New/updated tests: `test\suppression-guidance.test.ts`, `test\decorators.test.ts`, `test\orchestrator.test.ts`

**Acceptance criteria**

- Ambiguous approvals are visible in CLI/diagnostic output.
- The diagnostic is actionable and names the needed `since:` values.
- The later recurring finding remains unsuppressed until fixed.

---

## Detailed Test Scenarios

### A9 scenarios

#### 1. New suppression detected

Head adds an approval that base does not have.

```typespec
model Widget {
  @approvedBreakingChange("approved in PR")
  @removed(Versions.v2)
  legacy?: string;
}
```

Assert:

- classification = `NEW`
- finding is suppressed
- CI recommends `BreakingChangeReviewRequired`

#### 2. Existing unchanged suppression

Base and head contain the same approval.

```typespec
model Widget {
  @approvedBreakingChange("legacy removal approved")
  @removed(Versions.v2)
  legacy?: string;
}
```

Assert:

- classification = `EXISTING`
- finding is suppressed
- no review label

#### 3. Removed suppression detected

Base had an approval; head removed it.

Base:

```typespec
model Widget {
  @approvedBreakingChange("legacy removal approved")
  @removed(Versions.v2)
  legacy?: string;
}
```

Head:

```typespec
model Widget {
  @removed(Versions.v2)
  legacy?: string;
}
```

Assert:

- classification result contains `REMOVED`
- suppressed finding no longer exists in head output
- structured output surfaces cleanup information

#### 4. Modified suppression detected

Only metadata changes.

```typespec
@approvedBreakingChange("reason v2", #{ path: "properties.legacy" })
model Widget {
  @removed(Versions.v2)
  legacy?: string;
}
```

Assert:

- classification = `MODIFIED`
- finding is still suppressible by head approval
- CI recommends review label

#### 5. Direct vs parent placement identity

Direct and parent placements must not cross-match.

Direct:

```typespec
model Widget {
  @approvedBreakingChange("direct")
  @removed(Versions.v2)
  legacy?: string;
}
```

Parent:

```typespec
@approvedBreakingChange("parent", #{ path: "properties.legacy" })
model Widget {
  @removed(Versions.v2)
  legacy?: string;
}
```

Assert:

- direct-vs-parent is `MODIFIED` or remove+add, depending on chosen comparison model
- comparison never treats them as identical unchanged records

#### 6. Multiple decorators on the same node

```typespec
model Widget {
  @approvedBreakingChange("response removal", #{ kind: "ResponsePropertyRemoved" })
  @approvedBreakingChange("request removal", #{ kind: "RequestPropertyRemoved" })
  @removed(Versions.v2)
  legacy?: string;
}
```

Assert:

- two normalized records are collected
- each is classified independently
- modifying one does not affect the other

#### 7. `@approvedUnversionedChange` classification

```typespec
model Widget {
  @approvedUnversionedChange("projection gap accepted", #{ kind: "RequestPropertyAdded" })
  nickname?: string;
}
```

Assert:

- classification works for Phase A approvals too
- new/modified instance recommends `VersioningReviewRequired`

### A10 scenarios

#### 8. Since-scoped suppression matches only the correct pair

```typespec
model Widget {
  @approvedBreakingChange("only first removal", #{
    kind: "ResponsePropertyRemoved",
    since: "2024-01-01"
  })
  @removed(Versions.v2024)
  @added(Versions.v2025)
  @removed(Versions.v2026)
  legacy?: string;
}
```

Assert:

- suppresses the `-> 2024-01-01` finding only
- does not suppress the `-> 2026-01-01` recurrence

#### 9. Unscoped approval matches a single baseline

```typespec
model Widget {
  @approvedBreakingChange("single occurrence approved")
  @removed(Versions.v2)
  legacy?: string;
}
```

Assert:

- suppression remains valid
- no ambiguity diagnostic

#### 10. Ambiguity detected with 2+ baselines

```typespec
model Widget {
  @approvedBreakingChange("too broad")
  @removed(Versions.v2024)
  @added(Versions.v2025)
  @removed(Versions.v2026)
  legacy?: string;
}
```

Assert:

- ambiguity diagnostic emitted
- later recurrence is unsuppressed

#### 11. Oscillating property scenario

```typespec
model Widget {
  @approvedBreakingChange("first removal", #{ since: "2024-01-01" })
  @approvedBreakingChange("second removal", #{ since: "2026-01-01" })
  @removed(Versions.v2024)
  @added(Versions.v2025)
  @removed(Versions.v2026)
  legacyStatus?: string;
}
```

Assert:

- both removals are suppressed
- no ambiguity diagnostic

#### 12. Since with direct placement

```typespec
model Widget {
  @approvedBreakingChange("direct scoped", #{ since: "2024-01-01" })
  @removed(Versions.v2024)
  legacy?: string;
}
```

Assert:

- direct placement uses declaration identity + exact head version

#### 13. Since with parent placement + path

```typespec
@approvedBreakingChange("scoped parent approval", #{
  path: "properties.legacy",
  since: "2024-01-01"
})
model Widget {
  @removed(Versions.v2024)
  legacy?: string;
}
```

Assert:

- parent placement uses ancestor identity + path + exact head version

---

## Implementation Order

Recommended sequence:

1. **Shared groundwork**
   - add normalized suppression inventory
   - normalize metadata to explicit `since`
2. **A9 core**
   - identity matching
   - NEW/EXISTING/REMOVED/MODIFIED classification
3. **A10 core**
   - exact pair-scoped `since` matching
   - ambiguity detection for unscoped approvals
4. **Pipeline integration**
   - attach matched suppression identity/classification to findings
   - surface removed/modified approvals in analysis result
5. **Reporting**
   - CI label recommendations
   - diagnostics/guidance for ambiguous suppressions

This order keeps the reusable comparison primitives in place before wiring them into orchestrator/reporting behavior.

---

## Acceptance Criteria

### A9 done when

- Base/head analysis can compare suppression inventories without TypeSpec object identity.
- Each head suppression is classified as `NEW`, `EXISTING`, or `MODIFIED`; each base-only suppression is `REMOVED`.
- Suppressed findings in `analyzeBaseAndHead` carry the classification of the approval that suppressed them.
- CI label recommendations follow the required rules for breaking-change vs unversioned approvals.

### A10 done when

- `since:` matches only the intended version transition.
- Unscoped approvals are allowed only when they match exactly one distinct stable transition.
- Ambiguous later recurrences are reported unsuppressed.
- The tool emits actionable diagnostics/guidance telling authors which `since:`-scoped approvals to add.

### Overall done when

- All new tests pass.
- Existing suppression behavior remains unchanged for non-ambiguous single-occurrence cases.
- Structured output contains enough data for CI to label PRs and explain why review is required.
