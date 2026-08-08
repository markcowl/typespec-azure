# Base Source Tracing TDD Plan

## 1. Current State Analysis

### Files reviewed

- `src/pipeline/resolve-location.ts`
- `src/diff/origin.ts`
- `src/diff/diff-operations.ts`
- `src/diff/diff-engine.ts`
- `src/diff/diff-types.ts`
- `src/pipeline/orchestrator.ts`
- `test/resolve-location.test.ts`
- `test/diff-engine.test.ts`
- `test/integration-real-spec.test.ts`
- `scripts/evaluate-source-tracing.mjs`

### What HEAD tracing already does

`resolveHeadSourceLocations(findings, headProgram)` is a post-suppression repair step. It exists to recover declaration-backed HEAD locations after diffing, especially when:

- `headType` is missing because the compared view projected the element out
- the finding still has a `baseType`/`origin.declarationPath` that can be used as a lookup key
- the best user-facing anchor is in the unmutated head program, not on the projected/canonicalized type object carried by the diff

Current HEAD lookup flow is:

1. skip findings that already have `headType` or `headSourceLocation`
2. require `baseType.kind === "ModelProperty"`
3. derive model/property hints from:
   - `diff.origin.declarationPath`
   - AST source name via `prop.node?.parent?.id?.sv`
   - `prop.model?.name`
4. search the head program using:
   - qualified path lookup from origin
   - service-namespace-scoped lookup
   - recursive global lookup
5. if the property exists, set `headSourceLocation` and `headSourceTraceLevel = "direct"`
6. otherwise, fall back to the parent model and set `headSourceTraceLevel = "parentModel"`

`resolveFindingLocation()` then uses a 6-level reporting chain:

1. `headSourceLocation`
2. `origin.sourceLocation`
3. `baseSourceLocation`
4. parent model / parent enum / parent union via `resolveTypeLocationWithModelFallback()`
5. `operationSourceLocation`
6. service namespace

### What base tracing already does

Base-side source data is populated during diff creation, not repaired later:

- `src/diff/diff-types.ts` sets `baseSourceLocation` from `getSourceLocation(baseType, { locateId: true })`
- `src/diff/diff-operations.ts` sets `baseSourceLocation` in `makeDiff()`
- parameter diffs now replace wire-level parameter types with declaration `ModelProperty` values before assigning `baseType`/`baseSourceLocation`
- `src/diff/diff-engine.ts` sets `baseSourceLocation` for `OperationRemoved`

`resolveOrigin()` already knows how to trace declaration ownership through:

- `sourceProperty`
- canonical-property recovery by shared AST node
- template metadata via `sourceModels`
- template arguments via `templateMapper.args`
- enclosing named ancestors / operations

### What is missing

There is no `resolveBaseSourceLocations(findings, baseProgram)` pass that:

- re-resolves base-side locations after diffing
- mirrors the HEAD-side scoped model/property lookup against the **base** program
- applies template/canonical-property tracing when the raw base location points at a projected or synthetic copy
- records how the base location was obtained (`direct` vs `parentModel`, etc.)

In short: HEAD has a repair/enrichment stage; BASE only has whatever location the diff engine happened to capture.

### Current metrics

The existing real-spec tests do **not** assert base-side tracing percentages. They currently validate:

- origin coverage
- selected trace levels from `resolveFindingLocation()`
- compile/performance behavior

After rebuilding the package and running `scripts/evaluate-source-tracing.mjs` on the current branch:

| Spec | Final findings | Selected `base` trace count | Selected `base` trace % | Origin % |
|---|---:|---:|---:|---:|
| Network | 55 | 0 | 0.0% | 100% |
| AppConfiguration | 0 | 0 | N/A | N/A |
| ContainerService/fleet | 126 | 0 | 0.0% | 100% |

That does **not** mean base tracing is absent; it means current report selection almost always resolves earlier via HEAD or origin.

Ad hoc raw-field inspection on the same Phase B results showed:

- Network: `baseType` present on 2 findings; both had valid `baseSourceLocation` matching the resolved declaration location
- AppConfiguration: 0 findings
- Fleet: 0 findings carrying `baseType`

Conclusion: today’s real-spec harness is good for regression smoke tests, but it does not meaningfully measure base-side declaration repair yet.

## 2. Design

### Goal

Add a symmetric base-side repair step so that `baseSourceLocation` is as declaration-backed and origin-aware as `headSourceLocation`.

### Proposed shape

1. Add `resolveBaseSourceLocations(findings, baseProgram)`
2. Add `baseSourceTraceLevel?: Extract<SourceTraceLevel, "direct" | "origin" | "parentModel">` to `ApiDiff`
3. Call the new resolver after suppression, next to `resolveHeadSourceLocations`
4. Reuse/extract shared lookup helpers so HEAD and BASE follow the same search rules

### Mirror the HEAD algorithm for BASE

For each finding, base resolution should attempt the same semantic ladder, but against the base program:

1. **Direct base declaration**
   - if `baseType` already points to a declaration-backed type with a valid location, keep it
2. **Origin-backed declaration**
   - if `resolveOrigin(baseType)` yields a better declaration in the base compilation, use that location
3. **Program lookup by declaration path**
   - use `diff.origin.declarationPath` when it names the base-side model/property
4. **Scoped namespace lookup**
   - use the finding’s `serviceNamespace` path to find the matching namespace in `baseProgram`
5. **Template/canonical-property tracing**
   - walk `sourceModels` and `templateMapper.args`
   - reuse the canonical-property-by-node logic where appropriate
6. **Parent model fallback**
   - if the property is gone or cannot be re-found directly, attach to the parent model

This is “the same 6-level fallback chain” in base-program terms: direct declaration → declaration/origin tracing → scoped lookup → template tracing → parent-model fallback, with operation/namespace remaining the final report-level fallback in `resolveFindingLocation()`.

### Shared helper extraction

Refactor toward a side-agnostic helper, for example:

- `resolveModelPropertyInProgram(program, serviceNamespace, declarationPath, modelName, propertyName)`
- `resolveSourceLocationForSide(diff, sideProgram, side)`

Candidate reusable helpers:

- `findModelFromOrigin`
- `findModelInServiceNamespace`
- `findMatchingNamespace`
- `findModelInProgram`
- `resolveTypeLocationWithModelFallback`

Template tracing logic should stay sourced from `origin.ts`, not duplicated again with subtly different rules.

### Why BASE differs from HEAD

HEAD resolution today mostly repairs **missing** head-side anchors (`headType`/`headSourceLocation` absent).

BASE resolution must handle a different problem set:

- the base side often exists, but the captured type may be a projected/canonicalized/template-instantiated copy
- `baseSourceLocation` may be present but not declaration-optimal
- the best base anchor may require re-finding the declaration in the base program even when a raw location already exists

So BASE should not be limited to “only if location is missing.” It should also upgrade weak base anchors.

### Phase A vs Phase B

#### Phase A: two compilations

- `baseProgram` and `headProgram` are separate compilations
- TypeSpec object identity does not cross the compile boundary
- base lookup must use names/paths/nodes **within the base program only**
- this is the most important scenario for the feature because reviewers need a link into the base source tree when the report is otherwise head-biased

#### Phase B: one compilation, two projections

- both sides come from the same program
- `baseType` and `headType` may still be different projected/canonicalized objects
- base lookup still matters because the base version view can carry projected/template-derived copies rather than the canonical declaration

Implementation rule: the resolver should accept a `Program`, not rely on type identity between diff payloads and source declarations.

## 3. TDD Test Plan

### Primary tests to add

#### A. Base model property removed

File: `test/resolve-location.test.ts` or `test/orchestrator.test.ts`

Scenario:

- Phase A comparison between two compilations
- base program declares `Widget.city`
- head program removes `city`

Expected:

- finding kind includes `PropertyRemoved`
- `diff.baseSourceLocation` points to the `city` property in the **base** program
- `diff.baseSourceTraceLevel === "direct"` (or equivalent base-side trace metadata)

Coverage target:

- new `resolveBaseSourceLocations()` direct-property branch

#### B. Base model property type changed

Scenario:

- same property exists in both programs
- type changes between base and head

Expected:

- `baseSourceLocation` points to the base declaration of that property
- `headSourceLocation` points to the head declaration
- no wire-type-only anchor survives after repair

Coverage target:

- no-regression path where both sides are present

#### C. Base parameter removed

Scenario:

- query/path/header parameter exists in base, removed in head
- parameter diff already uses declaration `ModelProperty`

Expected:

- `baseType.kind === "ModelProperty"`
- `baseSourceLocation` resolves to the declared parameter property, not `wireType`
- origin/path lookup remains stable after base repair

Coverage target:

- parameter path through `diff-operations.ts` + base resolver

#### D. Template-derived base property

Scenario:

- property comes from `TrackedResource<T>` or similar template expansion
- raw base property is a projected/template-instantiated copy

Expected:

- `baseSourceLocation` resolves back to the source declaration on the template argument model
- trace metadata shows declaration/origin-level recovery rather than operation fallback

Coverage target:

- `sourceModels` / `templateMapper.args` branch reused for base repair

#### E. Phase A comparison

Scenario:

- two compilations with a change that yields both base and head anchors

Expected:

- base location resolves in `baseProgram`
- head location resolves in `headProgram`
- file paths/line text prove each side came from the correct compilation

Coverage target:

- cross-compilation correctness

#### F. Phase B comparison

Scenario:

- one program, two version projections
- property removed via versioning or changed across stable/candidate views

Expected:

- base location resolves inside the same program but to the base-version declaration
- the resolver does not assume cross-program lookup

Coverage target:

- same-program projected-view path

### Secondary tests to add

- non-model-property base types are skipped safely
- malformed origin paths still fall back to scoped/global base lookup
- missing service namespace still falls back to recursive program lookup
- parent-model fallback is used when the property cannot be found directly

### Suggested files and assertions

- `test/resolve-location.test.ts`
  - new unit coverage for `resolveBaseSourceLocations()`
  - mirror the existing HEAD resolver tests one-for-one where applicable
- `test/diff-engine.test.ts`
  - preserve declaration-backed `baseType`/`baseSourceLocation` for parameter and property diffs
- `test/orchestrator.test.ts`
  - verify resolver ordering and that Phase A invokes both base and head repair
- `test/integration-real-spec.test.ts`
  - optional smoke assertions once a base-metric harness exists

## 4. Implementation Steps (ordered)

### Step 1: Write failing unit tests

Start in `test/resolve-location.test.ts`:

1. Phase A base property removed
2. Phase A base parameter removed
3. template-derived base property
4. parent-model base fallback

Goal: prove the missing behavior before changing production code.

### Step 2: Add API surface for base trace metadata

Minimal change:

- add `baseSourceTraceLevel`
- keep existing fields backward compatible

Tests to pass:

- compile/tests only; no behavior change yet

### Step 3: Implement `resolveBaseSourceLocations()`

Minimum passing version:

- mirror current HEAD resolver structure
- operate on `diff.baseType`
- use origin declaration path + namespace-scoped lookup + recursive lookup
- set `baseSourceLocation` and `baseSourceTraceLevel`

Run the new targeted tests until green.

### Step 4: Extract shared helpers / remove duplication

Refactor once green:

- centralize side-agnostic lookup code
- keep HEAD behavior unchanged
- reuse template tracing helpers rather than cloning logic

Add/retain regression tests for current HEAD scenarios.

### Step 5: Wire into orchestrator

Update both:

- `analyzeProgram()`
- `analyzeBaseAndHead()`

Desired order:

`dedup -> merge -> collapse -> suppress -> resolveHeadSourceLocations -> resolveBaseSourceLocations`

Then add an orchestrator test that proves both repair passes run post-suppression.

### Step 6: Verify coverage

Run the smallest targeted suite first:

- `pnpm test -- resolve-location.test.ts diff-engine.test.ts orchestrator.test.ts`

Then, if needed:

- `pnpm test -- integration-real-spec.test.ts`

Coverage expectation:

- new branches in `resolve-location.ts` covered for direct / origin / parent-model / malformed-origin / missing-namespace cases

## 5. Evaluation Against Real Specs

### Baseline to repeat

Use the same real-spec set already used for HEAD tracing:

- Network
- AppConfiguration
- ContainerService/fleet

### Evaluation work

1. extend the evaluation harness so it records base-side metrics explicitly
2. keep existing selected-trace and origin metrics for continuity
3. add base-specific counters such as:
   - findings with `baseType`
   - valid `baseSourceLocation`
   - base declaration match rate
   - base parent-model fallback rate

### Target outputs

For each spec, report:

- total findings
- findings carrying `baseType`
- `%` with valid base declaration location
- `%` resolved directly to the base property
- `%` resolved through template/origin recovery
- `%` that required parent-model fallback

### Expected interpretation

- Network and Fleet may still show low raw base participation if current version deltas are mostly additions
- that is acceptable; the important part is that any removal/change finding with a base-side declaration becomes origin-backed and deterministic
- AppConfiguration may remain `N/A` if it still has no stable-baseline Phase B findings

### Patterns to watch for

- parameter diffs that still degrade to wire types
- template-instantiated ARM models where the copied property lacks `sourceProperty`
- base declarations inside nested/scoped namespaces not found by global-only lookup
- cases where a raw location exists but points to the wrong projected copy

## 6. Effort Estimate

| Step | Estimate | Notes |
|---|---:|---|
| Current-state test design + failing tests | 0.5-1 day | Most important part; mirrors existing HEAD tests |
| Base resolver implementation | 0.5 day | Minimal pass for direct + namespace/path lookup |
| Shared-helper refactor | 0.5 day | Reduce drift between HEAD and BASE logic |
| Targeted validation + real-spec evaluation | 0.5 day | Includes extending metrics harness |
| Buffer for template/canonical edge cases | 0.5 day | Highest-risk area |

Total: **2-3 working days**

### Dependencies

- current HEAD tracing fix on `fix/source-trace-100`
- existing parameter declaration fix in `diff-operations.ts`
- stable real-spec paths used by `scripts/evaluate-source-tracing.mjs`

### Risks

1. **False confidence from raw base locations**
   - a valid location can still point to the wrong projected copy
2. **Logic drift between HEAD and BASE**
   - duplicated code will diverge unless helpers are shared
3. **Template tracing complexity**
   - `sourceModels` and `templateMapper.args` are necessary but easy to apply inconsistently
4. **Metric ambiguity**
   - the current evaluation script reports selected report anchors, not true base-side quality, so the harness must be extended before success can be measured cleanly
