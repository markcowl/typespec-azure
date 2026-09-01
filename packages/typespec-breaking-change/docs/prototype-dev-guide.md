# Prototype Developer Guide

This guide captures operational knowledge for developing, deploying, and testing the
`@azure-tools/typespec-breaking-change` prototype. It is intended for any developer
(human or agent) picking up this work.

## 1. Build and Test

```bash
# From packages/typespec-breaking-change/
npm test                       # Run all tests (vitest, ~364 tests)
npx tsc -p tsconfig.build.json # Build JS to dist/src/
tsp format path/to/file.tsp    # Always format .tsp files after editing
```

When changing decorator option models in `.tsp` files, regenerate TypeScript types with `tspd`.

### Real-spec integration tests

The real-spec suite uses an external `azure-rest-api-specs` checkout. It first checks
`AZURE_REST_API_SPECS`, then looks for a sibling checkout next to `typespec-azure`. If neither is
available, the external suite is skipped.

```powershell
$env:AZURE_REST_API_SPECS = "C:\repos\azure-rest-api-specs"
pnpm test:real-specs
```

The checked-in manifest covers ARM and data-plane services using stable invariant thresholds
rather than exact version or finding counts. To exercise Phase A with separate compilations, point
`AZURE_REST_API_SPECS_BASE` at a second checkout:

```powershell
$env:AZURE_REST_API_SPECS = "C:\repos\azure-rest-api-specs-head"
$env:AZURE_REST_API_SPECS_BASE = "C:\repos\azure-rest-api-specs-base"
pnpm test:real-specs
```

The base and head variables must resolve to different checkouts. Pin their commits in CI or when
capturing benchmark results so failures are reproducible.

Known tool failures belong in the manifest as `expectedCanonicalizationError` entries. These cases
still compile the real service and assert the current failure message. If the underlying issue is
fixed, the test fails until the expectation is removed and normal pipeline assertions are enabled.

## 2. Repository Layout

| Location                                                    | Purpose                                              |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `markcowl/typespec-azure` (fork)                            | Tool source, branch `prototype/breaking-change-tool` |
| `markcowl/azure-rest-api-specs` (fork)                      | Demo PRs with deployed JS                            |
| `rfcs/breaking-changes/`                                    | Design documents (on prototype branch)               |
| `packages/typespec-breaking-change/`                        | Package root                                         |
| `packages/typespec-breaking-change/docs/`                   | Developer docs, demo plans                           |
| `packages/typespec-breaking-change/PROTOTYPE-EVALUATION.md` | Performance benchmarks, Q&A                          |

### Key Branches (markcowl/typespec-azure)

| Branch                               | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `prototype/breaking-change-tool`     | Main working branch (source + docs)                            |
| `fork/rfc/breaking-changes`          | Original detailed design docs (now copied to prototype branch) |
| `fork/rfc/breaking-changes-overview` | Original overview doc (now merged into prototype branch)       |

### Rollback Tags

| Tag                         | Location             | Purpose                               |
| --------------------------- | -------------------- | ------------------------------------- |
| `source-link-principle-pre` | typespec-azure       | Before source link resolution changes |
| `demo-source-link-fix-pre`  | azure-rest-api-specs | Before source link fix deployment     |

## 3. GitHub Actions Integration (azure-rest-api-specs)

The tool runs via four workflow files and one deployed tool directory. All paths are relative to the `azure-rest-api-specs` repo root.

### Workflow Files

| File                                                       | Purpose                                                                                                                                                                                             | Trigger                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `.github/workflows/typespec-breaking-change-code.yaml`     | **Phase B analysis** (cross-version). Runs CLI with `--phase cross-version` on each impacted TypeSpec folder. Posts PR comment, uploads report artifact, sets `BreakingChangeReviewRequired` label. | `pull_request` (opened/synchronize/reopened/edited/labeled/unlabeled) |
| `.github/workflows/typespec-breaking-change-status.yaml`   | Sets commit status for Phase B. Monitors the code workflow via `_reusable-set-check-status.yaml`. Override labels: `BreakingChange-Approved-*`.                                                     | `pull_request_target`, `workflow_run`                                 |
| `.github/workflows/typespec-versioning-change-code.yaml`   | **Phase A analysis** (same-version). Checks out base revision in-place, runs CLI with `--phase same-version --base <base_folder>`. Posts PR comment, sets `VersioningReviewRequired` label.         | `pull_request` (opened/synchronize/reopened/edited/labeled/unlabeled) |
| `.github/workflows/typespec-versioning-change-status.yaml` | Sets commit status for Phase A. Override labels: `Versioning-Approved-*`.                                                                                                                           | `pull_request_target`, `workflow_run`                                 |

### Deployed Tool Directory

```
eng/tools/typespec-breaking-change/
├── package.json          # Deployment package.json (pinned deps, no workspace refs)
├── lib/
│   ├── main.tsp          # TypeSpec library entry point
│   └── decorators.tsp    # Suppression decorator declarations
└── src/
    ├── index.js           # Package entry point
    ├── types.js           # Type definitions
    ├── diff-kind.js       # DiffKind enum
    ├── lib.js             # TypeSpec library registration
    ├── tsp-index.js       # TypeSpec decorator implementations
    ├── cli/
    │   └── cli.js         # CLI entry point (invoked by workflows)
    ├── diff/
    │   ├── differ.js      # Diff engine
    │   ├── origin.js      # Origin/source model resolution
    │   └── ...
    ├── pipeline/
    │   ├── orchestrator.js # Analysis pipeline (Phase A + B)
    │   ├── resolve-location.js # Source link resolution
    │   └── ...
    ├── suppression/
    │   └── suppression.js # Suppression matching
    └── reporting/
        └── reporter.js    # Markdown/JSON output formatting
```

### Key Shared Dependencies

| File                                                | Used By                                               |
| --------------------------------------------------- | ----------------------------------------------------- |
| `.github/actions/setup-node-install-deps`           | Both code workflows (installs Node, runs npm install) |
| `.github/workflows/_reusable-set-check-status.yaml` | Both status workflows                                 |
| `eng/scripts/Get-TypeSpec-Folders.ps1`              | Both code workflows (finds impacted TypeSpec folders) |

### CLI Invocation

Both workflows invoke the CLI as:

```bash
node eng/tools/typespec-breaking-change/src/cli/cli.js "$folder" \
  [--base "$base_folder"] \
  --phase {cross-version | same-version} \
  [--report-title "..."] \
  --json-output "$folder_json" \
  --markdown-output "$folder_md" \
  [--github-annotations] \
  --fail-on-breaking
```

Phase B (`typespec-breaking-change-code.yaml`) compiles head only and compares consecutive versions within it. Phase A (`typespec-versioning-change-code.yaml`) checks out the base revision to a separate directory and compares base vs head programs.

### Updating the Tool

See Section 4 below for the deployment runbook. Critical reminders:

- Use `git add -f` (`.gitignore` excludes `.js` files)
- Update **both** workflow files if the CLI entry point path changes
- After pushing to main, rebase all PR branches and force-push

## 4. Deployment to azure-rest-api-specs

The tool's built JS is deployed to the specs fork for demo PRs. **This is a manual process:**

### Step-by-step

```bash
# 1. Build JS in the tool package
cd packages/typespec-breaking-change
npx tsc -p tsconfig.build.json

# 2. Copy built JS to specs fork
# Source: dist/src/**/*
# Destination: eng/tools/typespec-breaking-change/src/ in the specs repo
cp -r dist/src/* /path/to/azure-rest-api-specs/eng/tools/typespec-breaking-change/src/

# 3. Also copy updated .tsp and package.json if changed
cp lib/decorators.tsp /path/to/azure-rest-api-specs/eng/tools/typespec-breaking-change/lib/
cp package.json /path/to/azure-rest-api-specs/eng/tools/typespec-breaking-change/

# 4. Commit to main in the specs fork (use -f because .gitignore excludes .js)
cd /path/to/azure-rest-api-specs
git add -f eng/tools/typespec-breaking-change/
git commit -m "chore: update breaking change tool JS"

# 5. Rebase all PR branches onto main (so JS changes don't appear in PR diffs)
for branch in demo/contoso-breaking-change demo/contoso-breaking-change-fixed versioning-test-unsup demo/contoso-unversioned-suppressed; do
  git checkout $branch
  git rebase main
done

# 6. Force push all branches
git push fork main --force
for branch in ...; do
  git push fork $branch --force
done

# 7. Verify PR diffs on GitHub (local git diff may not match GitHub's merge-base)
gh pr diff 2 --repo markcowl/azure-rest-api-specs --name-only
gh pr diff 3 --repo markcowl/azure-rest-api-specs --name-only
gh pr diff 4 --repo markcowl/azure-rest-api-specs --name-only
gh pr diff 5 --repo markcowl/azure-rest-api-specs --name-only
# Each should show ONLY spec files, no .js files
```

### Common mistakes

- **Pushing to wrong branch names** — e.g., `pr4` instead of `versioning-test-unsup`. Always use the actual PR branch names.
- **Forgetting to rebase** — If you commit JS to main but don't rebase PR branches, the PR diffs will show all the JS changes.
- **Local vs GitHub diff mismatch** — After force-pushing, always verify on GitHub with `gh pr diff`. Local `git diff` uses a different merge-base.
- **`.gitignore` blocking `git add`** — The specs repo's `.gitignore` excludes `.js` and `.js.map` files. You must use `git add -f` (force) to stage compiled JS files. Without `-f`, `git add` silently ignores them with no error.
- **Sparse checkout preventing subdirectory commits** — If the specs repo uses sparse checkout, ensure the tool directory is in the sparse-checkout cone (`git sparse-checkout add eng/tools/typespec-breaking-change`) before adding files. Files outside the cone are silently skipped by `git add`.

## 5. Demo PRs (markcowl/azure-rest-api-specs)

| PR  | Branch                                | Scenario                                                    | Expected Result                              |
| --- | ------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| #2  | `demo/contoso-breaking-change`        | New version adds breaking change (no suppression)           | ❌ 1 unsuppressed `ResourcePropertyRemoved`  |
| #3  | `demo/contoso-breaking-change-fixed`  | Same change with `@approvedBreakingChange`                  | ⚠️ 1 suppressed finding (Phase B)            |
| #4  | `versioning-test-unsup`               | Existing version modified (property removed, no `@removed`) | ❌ Phase A unsuppressed, source link to HEAD |
| #5  | `demo/contoso-unversioned-suppressed` | Same as #4 with `@approvedUnversionedChange`                | ⚠️ Phase A suppressed (cross-compilation)    |

### Testing a PR locally

```bash
# Create a worktree for main as the "base" program
git worktree add ../azure-rest-api-specs-base main

# Run the tool comparing base vs PR branch
cd packages/typespec-breaking-change
node dist/src/cli/cli.js \
  --base /path/to/azure-rest-api-specs-base/specification/contosowidgetmanager/Contoso.Management \
  --head /path/to/azure-rest-api-specs/specification/contosowidgetmanager/Contoso.Management \
  --format console
```

## 6. Pitfalls and Hard-Won Knowledge

### TypeSpec Library Registration

The tool provides suppression decorators (`@approvedBreakingChange`, `@approvedUnversionedChange`).
For these to work when consumed by specs:

1. **`exports` field required in `package.json`:**

   ```json
   "exports": { ".": { "typespec": "./lib/main.tsp", "default": "./src/index.js" } }
   ```

   Without this, `extern dec` declarations are found but JS implementations are **silently** not loaded. The only symptom is "Unknown decorator" at compile time.

2. **Consumer specs need `using Azure.BreakingChange;`** for unqualified decorator names.

### Projected vs Source Model Names

When looking up types in the HEAD program (e.g., for source link resolution):

- ❌ `prop.model?.name` — Returns the **projected** model name (e.g., `EmployeePropertiesCreateOrUpdate`), which doesn't exist in the namespace tree.
- ✅ `prop.node?.parent?.id?.sv` — Returns the **AST source** model name (e.g., `EmployeeProperties`), which can be found in the namespace tree.

This distinction matters for any spread/intersection/template pattern (e.g., `TrackedResource<T>`).

### Pipeline Ordering

The post-processing pipeline order is **critical**:

```
dedup → merge → collapse → suppress → resolveHeadSourceLocations
```

- **Suppress MUST run after merge.** Users write `ResourcePropertyRemoved` in decorators (matching what they see in reports). Before merge, findings still have `RequestPropertyRemoved`/`ResponsePropertyRemoved` kinds. If suppression runs before merge, Resource suppressions never match.
- For backward compatibility, `matchesKind` also accepts `Request*`/`Response*` as aliases for `Resource*` findings.

### Resource Kind Validation

The `validDiffKinds` set in `decorators.ts` must include all `Resource*` kinds (e.g., `ResourcePropertyRemoved`, `ResourcePropertyTypeChanged`). Without these, the decorator validator rejects them and the suppression is silently not stored.

### Cross-Compilation Identity

TypeSpec state maps use **object identity**. Types from different compilations (base vs head) will never match via identity lookup. The suppression system handles this with `scanUnversionedSuppressions`, which builds a map keyed by `(namespace.model.property, diffKind)` as a fallback.

### Phase A Source Link Principle

Link to the type in HEAD **only when it exists in HEAD source** (the unmutated program). The comparison phase is NOT the right signal — `@added(v2)` creates a Phase A removal where the property EXISTS in head source but is projected out of an older version.

## 7. Environment Notes

When working on a shared machine:

- Check if other agents are using `session2\azure-rest-api-specs` or similar directories before making changes.
- Use `C:\Users\markcowl\azure-rest-api-specs` for specs repo changes.
- `C:\Users\markcowl\typespec-azure` is the primary source repo.

## 8. Remaining Work

See `rfcs/breaking-changes/typespec-breaking-change-test-coverage.md` for the detailed test plan.

Key items not yet completed:

- Comprehensive future plan document (see design overview Section 7 for open design decisions)
- Test coverage improvements (currently ~83% branch, target 95%)
- OAD parity validation (Phase 1 of validation strategy)
- Side-by-side CI evaluation
- Stale approval detection and codefixes
- Version scoping implementation (`since:` parameter)
- Wildcard path suppression (deferred to post-v1)
