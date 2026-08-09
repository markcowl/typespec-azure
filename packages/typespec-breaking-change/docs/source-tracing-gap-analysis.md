# Source Tracing: Current State and Remaining Work

This document describes how `@azure-tools/typespec-breaking-change` traces findings to TypeSpec source declarations, the current implemented state, and any remaining follow-up.

**HEAD source tracing:** 100% declaration-level origin resolution on all evaluated real specs.
**Base source tracing:** Implemented with 100% resolution on all evaluated specs — see section 4.

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

## 4. Base Source Tracing Status

HEAD source tracing answers "where should the developer look to fix this?" Base source tracing answers "where in the original spec was this defined before it changed?"

### Current state

- `resolveBaseSourceLocations()` is implemented, achieving **100%** base-side resolution on all evaluated specs
- Evaluated metrics: **Network 55/55**, **Fleet 126/126**
- Base tracing now mirrors the HEAD repair flow, including declaration-path lookup, scoped namespace lookup, template tracing, and parent-model fallback
- `baseSourceTraceLevel` is recorded for debuggability
- In the final selected report anchor, trace levels are still often **operation-level**, which is correct for many cross-version diffs where the base side is a projected version rather than the preferred user-facing location

### Remaining work

- No known functional gap remains for base source tracing
- Remaining follow-up is broader evaluation coverage on additional specs, not new tracing mechanics
- For suppression classification and version scoping implementation plans, see `docs/a9-a10-tdd-plan.md`.

See `docs/base-source-tracing-plan.md` for the historical TDD plan that led to the implementation.
