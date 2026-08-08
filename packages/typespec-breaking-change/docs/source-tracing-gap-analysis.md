# Source Tracing: Current State and Remaining Work

This document describes how `@azure-tools/typespec-breaking-change` traces findings to TypeSpec source declarations, and what remains to be implemented.

**HEAD source tracing:** 100% declaration-level origin resolution on all evaluated real specs.
**Base source tracing:** Not yet implemented — see section 4.

## 1. How HEAD Source Tracing Works

### The 6-Level Fallback Chain

`src/pipeline/resolve-location.ts` resolves locations in priority order:

| Level | Source | What it resolves |
|---|---|---|
| 1 | `headSourceLocation` | Direct link to the HEAD-side declaration |
| 2 | `origin.sourceLocation` | Named declaration via `sourceProperty`, template tracing, or named ancestor |
| 3 | `baseSourceLocation` | Base-compilation declaration location |
| 4 | `parentModel` | Parent container (enclosing model / enum / union) |
| 5 | `operation` | The operation declaration that owns the diff |
| 6 | `namespace` | Service namespace + `elementPath` |

In practice, all findings resolve at level 1, 2, or 5. Levels 3-4 and 6 exist as safety nets.

### Origin Resolution (`src/diff/origin.ts`)

The origin resolver traces a type back to its named declaration through:

1. **`sourceProperty` chain** — follows TypeSpec's property provenance links
2. **Template tracing** — walks `model.sourceModels` and `templateMapper.args` to find user-declared types through `TrackedResource<T>` and similar patterns
3. **Canonical-property recovery** — matches by AST node identity
4. **Named-ancestor climb** — walks up the parent chain to find a named declaration

### Parameter Declaration Tracing (`src/diff/diff-operations.ts`)

For query/header/path parameter diffs, the diff engine uses `getParameterDeclarationType()`:

```typescript
function getParameterDeclarationType(param: ModelPropertyHttpCanonicalization): Type | undefined {
  return param.sourceType ?? param.wireType;
}
```

This ensures parameter diffs carry the declaration `ModelProperty` (for tracing) while still comparing by wire type (for semantic correctness).

## 2. Examples

### Direct property resolution
- Network `models.tsp:6815` → `ApplicationGatewaySslCertificatePropertiesFormat.hsm`
- Finding: `ResourcePropertyAdded`, traced directly to the property declaration

### Template tracing through `TrackedResource<T>`
- Fleet `fleet.tsp:58` → `FleetProperties.hubProfile`
- The property is declared on `FleetProperties` but surfaces through template expansion; `sourceModels`/`templateMapper.args` tracing recovers the original declaration

### Operation-level resolution (correct terminal)
- Fleet `run.tsp:467` → `skip is ArmResourceActionAsync<...>`
- Finding: `OperationAdded` — operation-level IS the correct declaration for this diff kind

### Parameter declaration resolution
- Network `AzureFirewall.tsp:72` → `createAfcControlPlane?: boolean`
- Finding: `RequestQueryParameterAdded`, traced to the `@query` parameter declaration via `param.sourceType`

## 3. HEAD Tracing Metrics

| Spec | Total Findings | Origin-Backed | Origin % |
|------|---------------:|--------------:|---------:|
| Network | 55 | 55 | 100% |
| Fleet | 126 | 126 | 100% |
| AppConfig | 0 | 0 | N/A |

## 4. Remaining Work: Base Source Tracing

HEAD source tracing answers "where should the developer look to fix this?" Base source tracing answers "where in the original spec was this defined before it changed?"

### Current state

- `baseSourceLocation` is set during diff creation for model property diffs (the declaration `ModelProperty` is already captured)
- For parameter diffs, `baseType` is now set to declaration `ModelProperty` (groundwork laid)
- But there is **no `resolveBaseSourceLocations()`** equivalent that applies the full fallback chain to base types
- Current base tracing percentage: **~0%** (no structured evaluation exists)

### What's needed

1. **`resolveBaseSourceLocations()`** — mirror the HEAD algorithm for base types:
   - Template tracing via `sourceModels`/`templateMapper.args` on base types
   - Scoped namespace lookup in the base program
   - Same 6-level fallback chain
2. **Phase A vs Phase B handling:**
   - Phase A: base and head are separate compilations (different type identity)
   - Phase B: base and head are projections within the same program (shared identity)
3. **`baseSourceTraceLevel`** field for debuggability
4. **Tests** verifying base tracing for all finding categories

See `docs/base-source-tracing-plan.md` for the full TDD implementation plan.
