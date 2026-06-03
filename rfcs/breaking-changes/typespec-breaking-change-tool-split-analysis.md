# TypeSpec Breaking Change Tool Split Analysis

## 1. Introduction

This document analyzes whether TypeSpec breaking change detection should remain a single combined tool or be split into two separate tools. The core question is whether the implementation and user experience benefits of shared infrastructure outweigh the conceptual differences between the two comparison phases:

- **Phase A (same-version regression):** compare `base@V` vs `head@V` for shared API versions to detect accidental mutations of existing stable versions.
- **Phase B (cross-version evolution):** compare new head versions against the previous stable version to detect intentional but breaking API evolution.

The phases are related, but they answer different questions, operate on different comparison boundaries, and support different remediation workflows.

## 2. Option A: Single Combined Tool (current design)

### Advantages

- **Single invocation and shared compilation work.** CI and local users run one command. The head branch only needs to be compiled once, which is especially valuable if compilation, projection, or canonicalization are expensive.
- **One integration surface.** There is one output format, one CI step, one package, and one place to configure reporting behavior.
- **Better end-to-end context.** Phase A and Phase B often describe the same underlying change from different angles. A combined tool can show both the root cause and the downstream effect in one report.
- **Natural causal ordering.** If Phase A runs first, the tool can explicitly say: the real problem is an undecorated mutation of an existing version; any Phase B break is secondary context, not an independent approval decision.
- **Shared suppression and reporting infrastructure.** Even if the suppression semantics differ, the plumbing for attaching metadata, correlating identities, formatting findings, and surfacing source locations can stay unified.
- **Users do not need to decide which checker applies.** This lowers adoption friction and reduces mistakes in CI setup and local usage.
- **Shared engine investment pays off once.** Identity correlation, canonical HTTP metadata extraction, graph walking, and rule evaluation are complex and likely to evolve. A single tool avoids duplicated maintenance.

### Disadvantages

- **The conceptual model is less clean.** The tool is doing two different kinds of comparison: same-version regression across branches and cross-version evolution within one compilation. That can make the code and the user story harder to explain.
- **Severity semantics are mixed.** Phase A really means "you forgot to version this change correctly," while Phase B means "this version transition is breaking." Those are related but not identical failure classes.
- **Suppression semantics are not actually the same.** Phase A findings should not usually be suppressible with `@approved`; the correct fix is to add the missing decorator. Phase B findings, by contrast, are exactly the kind of changes that may require scoped approval.
- **Different audiences may want different signals.** Spec authors care about decorator hygiene and branch regressions. Reviewers and approvers care about whether a new version introduces an acceptable break.
- **Combined output can confuse prioritization.** Without careful presentation, users may treat a Phase B approval workflow as a way to silence what is really a Phase A authoring mistake.

## 3. Option B: Two Separate Tools

### Tool 1: Version Integrity Checker (Phase A equivalent)

- Compares `base@V` vs `head@V` for all shared versions.
- Purpose: detect undecorated mutations of existing versions.
- Output: "You changed version X but did not add versioning decorators."
- Suppression: not applicable; the expected fix is to correct the versioning model.
- Could potentially be implemented as a linter-style rule if the base snapshot is made available.

### Tool 2: Breaking Change Detector (Phase B equivalent)

- Compares version `N` vs previous stable version `S` within head.
- Purpose: detect breaking evolution between versions.
- Output: "The change from version S to version N is breaking."
- Suppression: full `@approved` mechanism with version scoping.
- This is the tool reviewers and approvers would most directly interact with.

### Advantages of splitting

- **Cleaner separation of concerns.** Tool 1 is about version-integrity enforcement; Tool 2 is about compatibility policy across versions.
- **Simpler mental model per tool.** Each tool answers a single question, with a single remediation path and a single audience.
- **More precise CI ownership.** Different pipelines, labels, or reviewer groups can be attached to integrity failures versus approved breaking changes.
- **Tool 2 can run independently.** For local work, a developer may only care whether the new version transition is breaking, without needing base-branch comparison.
- **Tool 1 may fit linter ergonomics better.** If surfaced close to compilation, Phase A can feel like a direct authoring validation rather than a breaking-change review step.
- **Testing can be more focused.** Each tool can validate its own semantics without carrying the full matrix of both phases in every test surface.

### Disadvantages of splitting

- **Infrastructure duplication risk.** Even if the tools share libraries, they still need packaging, configuration, versioning, and integration surfaces. Without discipline, logic will drift.
- **Extra compilation cost.** Both tools need the head compilation, and Tool 1 also needs base. CI becomes more expensive unless orchestration is added to share artifacts.
- **Two integration points instead of one.** More commands, more documentation, more places for failures, and more decisions for users.
- **Overlap is harder to explain.** The same underlying undecorated change may produce both a Tool 1 integrity error and a Tool 2 compatibility break. Cross-tool causality becomes harder to present clearly.
- **Correlation becomes a product problem.** If Tool 2 reports a break caused by a Tool 1 issue, users now need help understanding that the approval path is not the right fix.
- **Higher maintenance burden.** Two packages, two release cadences, and a mandatory shared library boundary for canonical HTTP metadata, identity matching, and structural comparison logic.

## 4. Hybrid: Single Tool, Two Modes

A practical middle ground is to keep one binary and one shared engine, but expose the phases as explicit modes:

- `typespec-breaking-change --phase-a` for integrity checking only
- `typespec-breaking-change --phase-b` for evolution checking only
- `typespec-breaking-change` for both phases, as the default CI behavior

This preserves shared compilation, shared canonicalization, and one distribution artifact, while giving users the mental separation that the split design offers. It also allows the output to be clearly partitioned by concern, with different severity language and suppression behavior per section.

## 5. Recommendation

The strongest argument for splitting is conceptual clarity: Phase A is fundamentally **decoration hygiene**, while Phase B is **API compatibility policy**. They target different mistakes, different remediations, and partially different audiences. If judged purely as product concepts, they look like two tools.

However, the strongest argument against splitting is practical: they share a large amount of non-trivial infrastructure, they often describe the same change chain, and a split makes correlation, CI setup, packaging, and maintenance more expensive. A clean conceptual boundary does not automatically justify a fragmented implementation surface.

**Recommended direction: keep a single tool, but formalize it as two explicit modes within that tool.**

That recommendation best balances the trade-offs:

- It preserves **shared compilation and shared engine code**, minimizing maintenance cost.
- It keeps **one CI integration point by default**, which is operationally simpler.
- It allows **different semantics per phase**: Phase A as non-suppressible authoring/integrity failure, Phase B as approval-aware compatibility review.
- It improves **user understanding** by making the two concerns visible and separately invocable.
- It creates room for future evolution, including possibly surfacing Phase A more like a linter without prematurely forcing a package split.

In other words, the implementation should stay unified, but the product experience should acknowledge that these are not the same kind of finding. Treating them as two modes of one tool gives most of the clarity benefits of a split without paying the full operational and maintenance cost of separate tools.