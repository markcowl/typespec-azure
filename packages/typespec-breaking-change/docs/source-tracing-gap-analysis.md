# Source Tracing Gap Analysis

This document explains how declaration-level source tracing was achieved for `@azure-tools/typespec-breaking-change`, including the gap that existed before the fix in `fix/source-trace-100` and how it was resolved.

The analysis is based on:

- `docs/source-tracing-evaluation.md`
- `scripts/evaluate-source-tracing.mjs`
- `test/integration-real-spec.test.ts`
- `src/diff/diff-operations.ts`
- `src/diff/origin.ts`
- `src/pipeline/resolve-location.ts`

## 1. What "92% / 88%" Meant (Before Fix)

The **92%** (Network) and **88.6%** (Fleet) numbers measured **origin-backed declaration resolution**, not general source coverage.

In the evaluation script, that metric is computed as:

- `originCount / finalCount`
- where `originCount` means `finding.diff.origin` is present

That tells us whether a finding can be traced back to the specific TypeSpec declaration that caused it: typically a `ModelProperty` or named model declaration.

Important distinction:

- **Declaration-level / origin-backed resolution was not 100%** (before fix)
- **Any-location resolution was already 100%**

`resolveFindingLocation()` always resolved **every** finding to some location through the fallback chain. The gap was in **specificity**, not **coverage**.

**After the fix:** Declaration-level resolution is now **100%** on all evaluated specs.

## 2. The 6-Level Fallback Chain

`src/pipeline/resolve-location.ts` resolves locations in this order:

| Level | Source | What it resolves | When it fails |
|---|---|---|---|
| 1 | `headSourceLocation` | Direct link to the HEAD-side declaration chosen for reporting | Missing when the diff never captured a usable declaration location, or when the declaration is projected out / absent |
| 2 | `origin.sourceLocation` | The named declaration recovered by `resolveOrigin()` via `sourceProperty`, template tracing, or named ancestor tracing | Fails when the diff only carries a wire-level type with no useful declaration chain |
| 3 | `baseSourceLocation` | Base-compilation declaration location | Fails when the base-side type is also non-declarative or synthetic |
| 4 | `parentModel` | Parent container such as the enclosing model / enum / union | Fails when there is no usable parent declaration to climb to |
| 5 | `operation` | The operation declaration that owns the diff | Used when the finding is operation-scoped or parameter-scoped but not declaration-backed |
| 6 | `namespace` | Service namespace plus `elementPath` for disambiguation | Final fallback when only service-level context remains |

In the real-spec evaluation, everything resolved by level 1 or level 5. Nothing reached namespace fallback, and nothing was unresolved.

## 3. Examples of Successful Source Tracing

### Direct property resolution

The clearest example is the Network finding tied to:

- `models.tsp:6815`
- `ApplicationGatewaySslCertificatePropertiesFormat.hsm`

In the Network spec, the declaration is:

- `ApplicationGatewaySslCertificatePropertiesFormat` in `models.tsp`
- `hsm?: ApplicationGatewayManagedHsm;` at line 6815

Because the diff carries a real declaration-backed property, the finding gets:

- `diff.origin`
- `headSourceLocation`
- a final report link directly to that property

### Template tracing through `TrackedResource<T>` (B5)

The B5 improvement in `src/diff/origin.ts` added tracing through:

- `model.sourceModels`
- `templateMapper.args`

That matters for ARM patterns such as:

- `model Fleet is TrackedResource<FleetProperties>` in `fleet.tsp`

Properties declared on `FleetProperties` can surface in HTTP shapes after template expansion without preserving a simple `sourceProperty` chain. The B5 logic recovers the declaration-backed property anyway, which is why the real-spec evaluation improved to:

- **Network: 24 / 26 origin-backed**
- **Fleet: 62 / 70 origin-backed**

Without that template tracing, many `TrackedResource<T>`-derived findings would stop short of the underlying `FleetProperties` declaration.

### Operation-level fallback for `OperationAdded`

Some findings are successful from a coverage standpoint even though they are not declaration-level. For example, Fleet has several `OperationAdded` findings such as:

- `POST .../updateRuns/{}/skip`
- `GET .../autoUpgradeProfiles/{}`
- `GET .../managedNamespaces/{}`
- `GET .../clusterMeshProfiles/{}`

These have no property/model declaration to trace to, so operation-level resolution is the correct terminal result. They are part of the 100% any-location success rate, but not part of declaration-level origin coverage.

## 4. The Gap That Existed: Parameter Declaration Tracing

Before the fix, the declaration-level gap was in query/header/path parameter diffs. For example, the Network query-parameter diff:

- `AzureFirewall.tsp:72-73`
- `@query("createAfcControlPlane")`
- `createAfcControlPlane?: boolean;`

That produced:

- `RequestQueryParameterAdded`
- `elementPath = query.createAfcControlPlane`
- `headType = Intrinsic:never` (the wire type, not the declaration)

The finding resolved to the Azure Firewall operation declaration (level 5 fallback), but could **not** resolve to the specific parameter declaration as a `ModelProperty` origin.

Why it fell to operation level:

1. the diff was created from the **wire parameter type** (`param.wireType`)
2. that wire type is often an intrinsic or canonicalized scalar
3. `resolveOrigin()` cannot follow `sourceProperty` or template metadata from `Intrinsic:never`
4. `resolveFindingLocation()` therefore skipped declaration-level anchors and landed on the owning operation

## 5. Root Cause and Fix

The gap was in **`src/diff/diff-operations.ts`**, not in **`src/pipeline/resolve-location.ts`**.

`resolve-location.ts` was already doing the right thing: consuming whatever anchors the diff engine preserved and falling back cleanly through the six levels.

The real issue was that when comparing **query/header/path parameters**, `diff-operations.ts` stored `param.wireType` instead of the declaration `ModelProperty`.

### The Fix (implemented in `fix/source-trace-100`)

Added `getParameterDeclarationType()`:

```typescript
function getParameterDeclarationType(param: ModelPropertyHttpCanonicalization): Type | undefined {
  return param.sourceType ?? param.wireType;
}
```

This prefers `param.sourceType` (the declaration `ModelProperty` from the HTTP canonicalization) over `param.wireType`. All parameter diff creation points now use this:

- **Parameter removed:** `getParameterDeclarationType(baseParam)` instead of `baseParam.wireType`
- **Parameter added:** `getParameterDeclarationType(headParam)` instead of `headParam.wireType`
- **Parameter made optional/required:** both sides use declaration type
- **Parameter type changed:** remaps `baseType`/`headType` to declaration types, sets both `baseSourceLocation` and `headSourceLocation` from the property's source location, and calls `resolveOrigin()`

The comparison still operates on the **wire type** (via `getComparableType()`), so semantic correctness is preserved. Only the **reporting anchor** changes to the declaration property.

## 6. Metrics Summary

### Before Fix

| Spec | Total Findings | Origin-Backed | Origin % | Any-Location % |
|------|---------------:|--------------:|---------:|---------------:|
| Network | 26 | 24 | 92.3% | 100% |
| Fleet | 70 | 62 | 88.6% | 100% |
| AppConfig | 0 | 0 | N/A | N/A |

### After Fix

| Spec | Total Findings | Origin-Backed | Origin % | Any-Location % |
|------|---------------:|--------------:|---------:|---------------:|
| Network | 55 | 55 | **100%** | 100% |
| Fleet | 126 | 126 | **100%** | 100% |
| AppConfig | 0 | 0 | N/A | N/A |

Note: finding counts increased because the updated evaluation runs against the latest upstream spec versions (more version pairs = more findings).

## 7. Remaining Work: Base Source Tracing

The fix sets both `headType` and `baseType` to declaration `ModelProperty` in parameter diffs, laying groundwork for future base source tracing. However, `resolveBaseSourceLocations()` (mirroring the HEAD algorithm for base types) is not yet implemented. See `docs/base-source-tracing-plan.md` for the TDD plan.

## Conclusion

Declaration-level source tracing is now **100%** on all evaluated real specs. The fix was surgical: a single helper function in `diff-operations.ts` that prefers `param.sourceType` over `param.wireType`, ensuring origin resolution receives a declaration `ModelProperty` it can trace through. The fallback chain in `resolve-location.ts` required no changes.
