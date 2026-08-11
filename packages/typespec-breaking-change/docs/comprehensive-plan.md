# Comprehensive Plan: Next Steps for @azure-tools/typespec-breaking-change

**Created:** 2026-08-04
**Updated:** 2026-08-08
**Status:** Active planning document

## Executive Summary

The prototype is functional with 442 tests, real-world performance validation, and multiple demo PRs.
This document captures the path from prototype to production-ready tool, organized as:
Completed Work, (A) resolved designs not yet implemented, (B) genuinely open questions, and (C) prioritized work items.

## Completed Work

| Item | Description | Evidence |
|------|-------------|----------|
| A1 | Performance at Scale | Validated on Network (739 ops, 7.0s) and Fleet (13 versions, 8.4s) |
| A2 | Graph Walker and Cycle Detection | 5 recursive model tests; Network runs without stack overflow |
| A3 | Operation Identity Stability | 11 identity tests; Network spec correctly matches 739 operations |
| A4 | Resource Model Directional Split | Scenarios 10-12 plus 9 resource merge + suppression tests |
| A5 | Cross-Compilation Suppression Identity | PR #5 demo and suppression-identity tests |
| A6 | Phase A → Phase B Interaction | `src/orchestrator.ts` lines 157-171; design overview §8.5 |
| A7 | TypeSpec Library Registration | `docs/prototype-dev-guide.md`; verified by PR #5 |
| A8 | Suppression Mechanism: Decorators | `src/suppression/decorators.ts`, `src/suppression/suppression.ts`, `lib/decorators.tsp` |
| A11 | Narrowing/Widening Classification | Design overview §5 |
| A13 | Catastrophic Change Handling | Design overview §6.2 worked example for removed operations |
| B2 | Source Tracing Completeness and Unification | `src/pipeline/resolve-location.ts`; 100% HEAD/base tracing on Network and Fleet |
| B4 | Output Format Documentation | `docs/output-formats.md` |
| B5 | ARM Template Type Parameter Tracing | `src/diff/origin.ts`; Network 56% → 92%, Fleet 88.6% |
| 1.2 | Unified source tracing fallbacks | Completed in PR #4 (`src/pipeline/resolve-location.ts`) |
| 1.3 | ARM template type parameter tracing | Completed in PR #4 (`src/diff/origin.ts`) |
| 3.3 | Source link resolution | Completed in test coverage push |
| 3.4 | Resource merge edge cases | Completed in `fleet/improvements` |
| 3.9 | Large-spec source tracing validation | 100% HEAD/base tracing on Network/Fleet; AppConfiguration 0 findings |
| 4.1 | Output format documentation | `docs/output-formats.md` |
| 4.2 | Implementation developer guide | `docs/prototype-dev-guide.md`, `docs/implementation-guide.md` |
| 4.3 | Source tracing deep-dive documentation | `docs/source-tracing-deep-dive.md`, `docs/source-tracing-evaluation.md` |

---

## Part A: Resolved Designs (Not Yet Implemented)

These designs are settled in the design documents, but still need code.

### A1. New vs Existing Suppression Classification (IMPLEMENTED)

**Answer:** Design overview §6.3 fully specifies the classification:
- **NEW:** base has no matching suppression; head does → requires reviewer sign-off
- **EXISTING:** base and head have the same suppression → no new review
- **REMOVED:** base had it; head removed it → cleanup or will produce unsuppressed finding
- **MODIFIED:** both have it but metadata differs → re-review

Identity matching uses declaration identity for direct placement, ancestor identity + `path` + DiffKind for parent placement. Metadata comparison includes since, reason. PR labels (`BreakingChangeReviewRequired`, `VersioningReviewRequired`) are applied for new/modified instances.
**Evidence:** Design overview §6.3, lines 612-671.
**Implementation:** `src/suppression/inventory.ts`, `src/suppression/classification.ts`. Phase 1 item (1.1). See `docs/a1-a2-tdd-plan.md`.

### A2. Version Scoping with `since:` (IMPLEMENTED)

**Answer:** Design overview §6.6 fully resolves this, including the "temporary revert" scenario:
- Unscoped approval valid when it matches exactly one distinct stable baseline
- If same `(DiffKind, identity-path)` fires against multiple baselines, version-scoped approvals are required
- Resolved via repeated point-in-time `since:`-scoped approvals (one per transition), not `since`/`until` ranges
- Ambiguity detection: when an unscoped approval matches multiple baselines, the later finding is reported as unsuppressed until the approval is split into `since:`-scoped versions

**Evidence:** Design overview §6.6, lines 862-917, with worked example (legacyStatus removed → re-added → removed again, resolved with two `since:`-scoped decorators).
**Implementation:** `src/suppression/ambiguity.ts`, updated `src/suppression/suppression.ts`. Phase 8 item (8.1). See `docs/a1-a2-tdd-plan.md`.

### A3. Stale Approval Detection (NOT YET IMPLEMENTED)

**Answer:** Design overview §6.5 fully specifies:
- Approvals that don't match any current finding → reported as diagnostics (not blockers)
- Tool provides a codefix to remove stale approvals
- Lifecycle: active → spec evolves → finding disappears → diagnostic → author removes via codefix

**Evidence:** Design overview §6.5, lines 834-861.
**Implementation status:** NOT YET IMPLEMENTED. Phase 8 item (8.2).

---

## Part B: Open Questions

These have NO resolved design and genuinely need investigation or decisions.

### B1. Decorator Hosting Package

**Problem:** The suppression decorators are currently in `@azure-tools/typespec-breaking-change`. Should they move to `@azure-tools/typespec-azure-core`?

**Tradeoffs:**
- **This package** (current): Clean separation of concerns. Spec authors must add an explicit dependency.
- **`@azure-tools/typespec-azure-core`**: Spec authors already depend on it — no extra dependency. But couples core to this tool's release cycle and concerns.

**Action:** Consult with TypeSpec team. Decision needed before v1 GA.

### B2. Wildcard and Blanket Suppressions

**Problem:** Should we allow:
- Wildcard paths (e.g., `path: "properties.*"`) for bulk suppressions?
- Blanket suppressions (suppress all findings on a type, or all findings of a kind)?
- Kind-only suppressions without path (suppress all `ResourcePropertyRemoved` on a model)?

**Current decision:** Exact-match only for v1 (design overview §7.3).

**Considerations:**
- Wide suppressions are convenient but reduce review precision
- A "blanket suppress all" could hide unintentional breaks
- Kind-only (no path) is already partially supported for direct placement
- Consider flagging "wide" suppressions in a separate report section

**Action:** Defer wildcard paths to post-v1. Validate kind-only behavior. Evaluate report flagging for wide suppressions.

### B3. Linter Rule Integration and IDE Feedback

**Problem:** The tool currently runs only as a CLI. TypeSpec supports linter rules via `createRule()` that provide real-time IDE feedback during spec authoring.

**Options:**
1. **CLI only** (current): Findings appear only in CI. Authors don't see issues until PR.
2. **CLI + linter rule**: Cross-version rules run in the IDE as the author types.
3. **CLI + Language Server Protocol**: More complex but richer IDE integration.

**Investigation plan:**
1. Prototype a single rule as a `createRule()` linter rule
2. Evaluate whether version mutators + comparison can run fast enough for IDE latency (<1s)
3. Determine which rules make sense in real-time vs batch-only

**Evidence:** PROTOTYPE-EVALUATION.md P2.

### B4. Adding APIs to Azure Core

**Problem:** Some functionality could benefit the broader TypeSpec ecosystem if upstreamed:
- Operation identity (`{method, normalizedPath}`)
- Version enumeration and pair construction
- Canonical HTTP comparison utilities
- Suppression decorator infrastructure (related to B1 hosting question)

**Action:**
1. Identify which APIs are generic enough to upstream vs tool-specific
2. Propose API surfaces to the TypeSpec/Azure core team
3. Evaluate impact on this tool if dependencies move upstream

### B5. Git-Revision-Based Analysis

**Problem:** The CLI requires explicit `--base <path>` and `--head <path>` pointing to directories. Production CI needs `--base <commitish>` to automatically check out and compile the base revision.

**Action:**
1. Add `--base <commitish>` support: tool checks out the base revision to a temp directory
2. Handle sparse checkout (only the relevant spec folder)
3. Consider caching compiled base programs
4. Evaluate integration with GitHub Actions' checkout action

**Evidence:** PROTOTYPE-EVALUATION.md Q9, `presentation-notes.md`.

### B6. Multi-Service Spec Validation

**Problem:** The tool supports multiple `@service` namespaces but this hasn't been validated against real multi-service specs.

**Action:**
1. Find real multi-service specs in azure-rest-api-specs (if any exist)
2. Create synthetic multi-service fixtures if none
3. Validate each service analyzed independently
4. Verify report attributes findings to correct service

**Evidence:** PROTOTYPE-EVALUATION.md P3.

### B7. Scalar Transition Table Scope

**Problem:** Should v1 implement the full scalar transition table (distinguishing widening from format changes) or flag all type changes uniformly? (Design overview §7.2.)

**Tradeoffs:** Full table provides better DX but larger correctness surface. Narrower first release may be safer if the team cannot validate every scalar family adequately.

**Action:** Evaluate which scalar families are adequately validated by current tests. Decide: full table or progressive.

---

## Part C: Work Items (in execution order)

### Phase 1: Core Suppression Logic (1-2 weeks)

Implement the resolved suppression classification design and validate remaining correctness gaps.

| # | Item | Design Ref | Effort |
|---|------|-----------|--------|
| 1.1 | Implement new-vs-existing suppression comparison | §6.3 (A1) | 3 days |
| 1.2 | Catastrophic change detection tests | §6.2 (A13) | 1 day |
| 1.3 | Verify narrowing/widening implementation matches §5 | §5 (A11) | 1 day |
| 1.4 | Validate `path` and `since` narrowing | §6.6, §7.3 | 0.5 day |
| 1.5 | Phase A optimization validation tests | §8.5 (A6) | 0.5 day |
| 1.6 | Phase A with real base/head programs (beyond demo PRs) | — | 1 day |

See `docs/a1-a2-tdd-plan.md` for detailed TDD plan for item 1.1.

### Phase 2: Reporting, Messages, and Logging (1-2 weeks)

| # | Item | Design Ref | Effort |
|---|------|-----------|--------|
| 2.1 | Progress logging via `options.log` callback (visible in CI logs) | Reporting plan | 0.5 day |
| 2.2 | Phase-aware zero-findings messages (console, markdown, JSON) | Reporting plan | 0.5 day |
| 2.3 | Version comparison summary in all reporters (`VersionComparisonSummary`) | Reporting plan | 1 day |
| 2.4 | Collapsed version comparisons section in markdown output | Reporting plan | 0.5 day |
| 2.5 | CI PR comment formatting (concise summaries, collapsible sections, source links, actionable suppression guidance) | — | 2 days |
| 2.6 | Structured debug logging — log analysis decisions (which versions compared, which findings produced, why suppressed/ignored) | — | 2 days |
| 2.7 | Split log levels — `standard` (CI-visible progress) vs `debug` (diagnostic detail) vs `verbose` (all findings including ignored) | — | 1 day |
| 2.8 | Verbose mode — show narrowing/widening `ignore` findings so authors can verify the tool saw their changes | — | 1 day |
| 2.9 | GitHub Actions debug integration — when `ACTIONS_STEP_DEBUG=true`, emit debug-level logs automatically | — | 0.5 day |

Key design points:
- `AnalysisOptions.log` callback for progress lines in CI
- `AnalysisSummary.versionComparisons` array with per-pair breakdown
- `AnalysisSummary.phase` for phase-aware reporter messages
- Console: `✅ No cross-version breaking changes found (N version pairs compared)`
- Markdown: collapsed `<details>` section with version comparison table
- JSON: `versionComparisons` array in output

### Phase 3: Test Coverage (1-2 weeks)

See `typespec-breaking-change-test-coverage.md` for detailed scenario list.

| # | Item | Effort |
|---|------|--------|
| 3.1 | Cross-compilation suppression completeness | 0.5 day |
| 3.2 | Suppression display & hints | 0.5 day |
| 3.3 | Reporter & summary messages | 0.5 day |
| 3.4 | Diff engine edge cases | 0.5 day |
| 3.5 | Mixed Phase A+B scenarios | 0.5 day |
| 3.6 | E2E scenarios (25 scenarios) | 1.5 days |
| 3.7 | Mixed new + existing suppression scenarios | 1 day |

### Phase 4: Documentation (1 week)

| # | Item | Relates To | Effort |
|---|------|-----------|--------|
| 4.1 | Code documentation (TSDoc for all public APIs) | — | 2 days |
| 4.2 | CI integration guide (for specs repo team) | — | 1 day |
| 4.3 | Decorator hosting evaluation memo | B1 | 1 day |
| 4.4 | API upstream evaluation memo (what belongs in core) | B4 | 1 day |

### Phase 5: Validation and OAD Parity (4-5 weeks)

See `typespec-breaking-change-validation-strategy.md` for full details on the OAD parity process.

| # | Item | Effort |
|---|------|--------|
| 5.1 | Real-spec validation: 5+ ARM specs, 3+ data-plane specs | 3 days |
| 5.2 | Multi-service spec validation | 1 day |
| 5.3 | OAD rule correlation test conversion | 1 week |
| 5.4 | Tool-specific gap coverage (unique DiffKinds, suppression, Phase A) | 1 week |
| 5.5 | Merged PR historical analysis (target 80% agreement rate) | 1 week |

**Precursor work completed:** Real-spec evaluation against Network, Fleet, and AppConfiguration validates that the comparison engine runs correctly at scale. Source tracing achieves 100% HEAD and base resolution on evaluated specs.

### Phase 6: Publishing and CI Integration (2-3 weeks)

| # | Item | Effort |
|---|------|--------|
| 6.1 | Publish `@azure-tools/typespec-breaking-change` to npm (internal feed first, then public) | 2 days |
| 6.2 | Version pinning strategy (how CI pins the tool version, update cadence) | 1 day |
| 6.3 | Integrate published package into azure-rest-api-specs CI workflows (replace deployed-from-source) | 3 days |
| 6.4 | Exit code contract and machine-readable output for downstream automation | 1 day |
| 6.5 | Package documentation (README, getting started for spec authors, migration from OAD) | 2 days |

### Phase 7: Soft Gate and Shadow Mode (3-4 weeks)

| # | Item | Effort |
|---|------|--------|
| 7.1 | Soft gate deployment (labels applied, no merge block) | 3 days |
| 7.2 | Shadow-mode CI integration (comment-only, no enforcement) | 1 week |
| 7.3 | Agreement rate dashboard and metrics | 0.5 week |
| 7.4 | Iterate on message quality based on real feedback | 1 week |

### Phase 8: Advanced Suppression Features (2-3 weeks)

| # | Item | Design Ref | Effort |
|---|------|-----------|--------|
| 8.1 | Version scoping (`since:`) + ambiguity detection | §6.6 (A2) | 3 days |
| 8.2 | Stale suppression detection and codefix | §6.5 (A3) | 2 days |
| 8.3 | Complex pattern testing (polymorphism, discriminators, envelopes) | — | 2 days |
| 8.4 | Wide suppression flagging in reports | B2 | 1 day |
| 8.5 | Git-revision-based analysis (`--base <commitish>`) | B5 | 2 days |
| 8.6 | Linter rule integration prototype | B3 | 2 days |

See `docs/a1-a2-tdd-plan.md` for detailed TDD plan for item 8.1.

### Phase 9: Hard Gate and Graduation (1-2 weeks)

| # | Item | Effort |
|---|------|--------|
| 9.1 | Full gate (merge block enabled) | 2 days |
| 9.2 | OAD sunset plan and migration documentation | 2 days |

### Validation Readiness Criteria

**Before soft gate (Phase 7):**
- Phase 1 complete: suppression classification prevents false "new approval" noise
- Phase 5 complete: at least 80% agreement rate on historical merged PRs; validated on 5+ real ARM specs
- Phase 2 complete: clear, actionable CI messages; PR comments are well-formatted and non-noisy

**Before hard gate (Phase 9):**
- Phase 7 complete: shadow mode has run for 2+ weeks with <5% false positive rate
- Phase 8.1-8.2: version scoping and stale detection implemented
- Phase 6 complete: tool is published and consumed from npm (not deployed from source)
- Phase 8.3: complex patterns validated without regressions
- Suppression ergonomics validated with 3+ spec teams (no blockers reported)

---

## Part D: Decision Log

| Decision | Options | Status | Outcome |
|----------|---------|--------|---------|
| Suppression mechanism | Custom decorators | **Resolved** (§6) | Decorators with direct/parent placement, `path:`, `since:` |
| Decorator hosting | This package / azure-core | **Open** | — |
| New-vs-existing classification | Compare decorators by identity + metadata | **Resolved** (§6.3) | NEW/EXISTING/REMOVED/MODIFIED per §6.3 |
| Version scoping | Point-in-time `since:` + ambiguity detection | **Resolved** (§6.6) | Multiple `since:`-scoped decorators for oscillating changes |
| Stale approval handling | Diagnostic + codefix | **Resolved** (§6.5) | Non-blocking diagnostic, codefix to remove |
| Narrowing/widening rules | Directional classification table | **Resolved** (§5) | Request narrowing/response widening = Error |
| Wildcard suppressions | Exact only / glob / regex | **Deferred** to post-v1 (§7.3) | Exact match for v1 |
| Blanket suppress-all | Allow / disallow / flag | **Open** | — |
| Wide suppression reporting | Same section / separate warning / flag | **Open** | — |
| Scalar transition table scope | Full table / flag uniformly / progressive | **Open** (§7.2) | — |
| Source tracing algorithm | 6-level fallback + template tracing | **Resolved & Implemented** | See B2, B5 |
| Base source tracing | Mirror HEAD algorithm | **Resolved & Implemented** | `resolveBaseSourceLocations()` with 100% on all specs |
| Output format documentation | JSON schema + Markdown spec | **Resolved & Implemented** | See B4 |
| Source reorg | Flat files / logical subdirectories | **Resolved & Implemented** | cli/, diff/, pipeline/, suppression/, reporting/ |
| Source trace target | 100% on all evaluated specs | **Resolved & Implemented** | 6-level fallback + template tracing achieves 100% on Network/Fleet |
| APIs to upstream to core | Operation identity / version utils / none | **Open** | — |
| Linter rule integration | CLI only / CLI + linter / CLI + LSP | **Open** | — |
| Git revision support | Path only / commitish / sparse checkout | **Open** | — |
| Package publishing | Internal feed first / direct to public npm | **Open** | — |
| CI integration model | Published package / deployed from source / both | **Open** | Currently deployed from source; should migrate to published package |

---

## Part E: Dependencies and Risks

| Risk | Mitigation |
|------|-----------|
| `@typespec/http-canonicalization` API changes | Pin version, monitor upstream |
| TypeSpec compiler version changes breaking state map behavior | Integration tests on latest nightly |
| Large spec performance regression | Benchmark tests with regression gates |
| Suppression ergonomics rejected by spec authors | Early feedback loop with 2-3 spec teams |
| OAD parity gaps discovered late | Start OAD conversion early (Phase 6.1) in parallel with Phase 3 |
| CI message noise causing spec authors to ignore the check | Invest in formatting (Phase 8.4-8.5) before soft gate; measure signal-to-noise ratio |
| npm publish breaks consumers when API changes | Semver discipline; integration tests in azure-rest-api-specs CI pin exact versions |

---

## Appendix: Relationship to Existing Documents

| Document | Scope | Status |
|----------|-------|--------|
| `rfcs/breaking-changes/typespec-breaking-change-design-overview.md` | Architecture, rules, suppression design, implementation | Updated 2026-08-04 |
| `rfcs/breaking-changes/typespec-breaking-change-validation-strategy.md` | Multi-phase validation (OAD parity → gating) | Current |
| `rfcs/breaking-changes/typespec-breaking-change-test-coverage.md` | Unit/integration test scenarios | Updated 2026-08-04 |
| `PROTOTYPE-EVALUATION.md` | Prototype Q&A with benchmarks, open questions P1-P5 | Current |
| `docs/prototype-dev-guide.md` | Deployment runbook, pitfalls, environment | Created 2026-08-04 |
| `docs/a1-a2-tdd-plan.md` | TDD plan for A1 (suppression classification) and A2 (version scoping) | Created 2026-08-08 |
| `docs/violations-reference.md` | DiffKind reference for spec authors | Current |
| `docs/presentation-notes.md` | Slide deck talking points | Current |
| This document | Comprehensive next-steps plan | Active |

### Items Integrated from Other Documents

| Source | Item | Integrated As |
|--------|------|---------------|
| Design overview §5 | Narrowing/widening classification | A11 (resolved), Phase 1.5 |
| Design overview §6.2 | Removed operation suppression | A13 (resolved), Phase 1.4 |
| Design overview §6.3 | New/existing suppression comparison | A1 (resolved), Phase 1.1 |
| Design overview §6.5 | Stale approval detection | A3 (resolved), Phase 8.2 |
| Design overview §6.6 | Version scoping with `since:` | A2 (resolved), Phase 8.1 |
| Design overview §7.2 | Scalar transition table scope | B7 (open) |
| Design overview §7.3 | Wildcard suppression paths | B2 (deferred to post-v1) |
| `PROTOTYPE-EVALUATION.md` P1 | ARM template type parameter tracing | Completed (PR #4) |
| `PROTOTYPE-EVALUATION.md` P2 | Linter rule integration | B3, Phase 8.6 |
| `PROTOTYPE-EVALUATION.md` P3 | Multi-service specs | B6, Phase 5.2 |
| `PROTOTYPE-EVALUATION.md` P5 | Phase A with real base/head | Phase 1.8 |
| `presentation-notes.md` | Git-revision-based analysis | B5, Phase 8.5 |
| `source-tracing-analysis.md` | AST node identity for dedup | A4 (resolved) |
| Session `reporting-improvements-plan.md` | Progress logging, phase-aware messages, version comparisons | Phase 2.1-2.4 |
| User observations (2026-08-04) | New vs existing suppressions | A1, Phase 1.1 |
| User observations (2026-08-04) | Decorator hosting question | B1 |
| User observations (2026-08-04) | Source tracing unified algorithm | Completed (PR #4, #5) |
| User observations (2026-08-04) | Catastrophic breaking changes | A13, Phase 1.4 |
| User observations (2026-08-04) | Wildcard/blanket suppressions | B2 |
| User observations (2026-08-04) | Debuggability / logging levels | Phase 2 |
| User observations (2026-08-04) | Large-spec testing | Phase 3.9, Phase 5.1 |
| User observations (2026-08-04) | Output format documentation | Completed (PR #4) |
| User observations (2026-08-04) | Code documentation | Phase 4.2 |
| User observations (2026-08-04) | APIs to upstream to core | B4, Phase 4.4 |

---

## Appendix: Change Log

### 2026-08-08 — PR `fix/source-trace-100` (PR #5, continued)

**Work completed:**
| Category | Item |
|----------|------|
| **Testing** | Replaced fixture-dependent scenario tests with ARM inline fixtures using TesterWithArm |
| **Dependencies** | Added `@azure-tools/typespec-azure-core` and `@azure-tools/typespec-azure-resource-manager` as devDependencies |
| **Testing** | All 420 tests pass, 0 skipped (previously 2 skipped) |
| **Planning** | Created `docs/a1-a2-tdd-plan.md` — TDD plan for suppression classification and version scoping |
| **Docs** | Restructured comprehensive plan with Completed Work section and Prioritized Next Steps |

### 2026-08-08 — PR `fix/source-trace-100` (PR #5)

**Work completed in this PR:**

| Category | Item | Commit |
|----------|------|--------|
| **Source tracing** | Parameter declaration tracing via `getParameterDeclarationType()` restores declaration-backed HEAD tracing for query/header/path diffs | `0c00c323`, `7eb870b8` |
| **Source tracing** | Base source tracing implemented via `resolveBaseSourceLocations()` | `25942f49` |
| **Integration tests** | Fleet real-spec validation fixed across 14 versions / 9 version pairs | `25942f49` |
| **Tests** | Test suite expanded to 418 passing tests | `7eb870b8`, `25942f49` |
| **Coverage** | `resolve-location.ts` improved from 71% to 98%, `diff-operations.ts` reached 100%, overall branch coverage reached 85.93% | `7eb870b8`, `25942f49` |

**Comprehensive plan items completed:**
- B2 residual (base source tracing) → Resolved & Implemented
- Phase 3.9 validation updated to 100% HEAD/base tracing on Network and Fleet

### 2026-08-07 — PR `fleet/improvements` (PR #4)

**Work completed in this PR:**

| Category | Item | Commit |
|----------|------|--------|
| **Source tracing** | 6-level fallback chain with scoped namespace lookup | `56d7b4ff`, `6114e52a`, `5a2fe608` |
| **Source tracing** | Template type parameter tracing via `sourceModels`/`templateMapper.args` | `a0bab899` |
| **Source tracing** | Real-spec evaluation: Network 92%, Fleet 88.6%, AppConfig 100% | `0aa75bbd` |
| **Bug fix** | Resource merge suppression kinds (`ResourcePropertyMadeOptional` severity, `validDiffKinds`) | `014d3b9d` |
| **Tests** | 9 Resource merge + suppression scenario tests across all diff kinds | `014d3b9d` |
| **Tests** | Priority 4 resource merge edge case tests | `f6e63eea` |
| **Refactor** | Reorganize src/ into `cli/`, `diff/`, `pipeline/`, `suppression/`, `reporting/` | `bc07b6b4` |
| **Docs** | Output format documentation (`docs/output-formats.md`) | `65772c58` |
| **Docs** | Implementation developer guide (`docs/prototype-dev-guide.md`) | `acc05c2b` |
| **Docs** | Source tracing deep-dive and evaluation docs | `135e3a8c`, `0aa75bbd` |
| **Docs** | Updated design overview §8.2 with template tracing | `135e3a8c` |
| **Docs** | GitHub Actions integration inventory in dev guide | `864bd981` |
| **Docs** | Updated comprehensive plan and validation strategy | `864bd981` |

**Test count:** 364 → 400 (36 new tests)

**Comprehensive plan items completed:**
- B2 (source tracing) → Resolved & Implemented
- B4 (output format docs) → Resolved & Implemented
- B5 (template tracing) → Resolved & Implemented
- Phase 1.2, 1.3 → Done
- Phase 3.3, 3.4, 3.9 → Done
- Phase 4.1, 4.2, 4.3 → Done
