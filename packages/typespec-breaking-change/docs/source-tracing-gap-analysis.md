# Source Tracing Gap Analysis

This document explains the remaining gap between declaration-level source tracing and overall location resolution in `@azure-tools/typespec-breaking-change`.

The analysis is based on:

- `docs/source-tracing-evaluation.md`
- `scripts/evaluate-source-tracing.mjs`
- `test/integration-real-spec.test.ts`
- `src/diff/diff-operations.ts`
- `src/diff/origin.ts`
- `src/pipeline/resolve-location.ts`

## 1. What "92% / 88%" Means

The **92%** (Network) and **88.6%** (Fleet) numbers measure **origin-backed declaration resolution**, not general source coverage.

In the evaluation script, that metric is computed as:

- `originCount / finalCount`
- where `originCount` means `finding.diff.origin` is present

That tells us whether a finding can be traced back to the specific TypeSpec declaration that caused it: typically a `ModelProperty` or named model declaration.

Important distinction:

- **Declaration-level / origin-backed resolution is not 100%**
- **Any-location resolution is 100%**

`resolveFindingLocation()` still resolves **every** finding to some location through the fallback chain, even when it cannot recover the exact declaration. In other words, the gap is in **specificity**, not **coverage**.

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

## 4. Examples of Unsuccessful Declaration-Level Tracing

The remaining declaration-level gap in the evaluated specs is the Network query-parameter diff:

- `AzureFirewall.tsp:72-73`
- `@query("createAfcControlPlane")`
- `createAfcControlPlane?: boolean;`

That produced:

- `RequestQueryParameterAdded`
- `elementPath = query.createAfcControlPlane`
- `headType = Intrinsic:never`

This finding still resolves to the Azure Firewall operation declaration, so it is fully covered by the fallback chain. But it does **not** resolve to the specific parameter declaration as a `ModelProperty` origin.

Why it falls to operation level:

1. the diff is created from the **wire parameter type**
2. that wire type is often an intrinsic or canonicalized scalar
3. `resolveOrigin()` cannot follow `sourceProperty` or template metadata from `Intrinsic:never`
4. `resolveFindingLocation()` therefore skips declaration-level anchors and lands on the owning operation

## 5. Root Cause Analysis

The gap is in **`src/diff/diff-operations.ts`**, not in **`src/pipeline/resolve-location.ts`**.

`resolve-location.ts` is already doing the right thing: it consumes whatever anchors the diff engine preserved and falls back cleanly through the six levels.

The real issue is earlier:

- when comparing **query/header/path parameters**
- `diff-operations.ts` stores the **wire type**
- specifically `baseParam.wireType` / `headParam.wireType`
- and often compares `getComparableType(...)`

That means the diff is frequently anchored to:

- `Intrinsic:never`
- a scalar
- or another canonicalized non-declaration type

In those cases, `src/diff/origin.ts` has nothing useful to follow:

- no `ModelProperty`
- no `sourceProperty`
- no template-instantiation chain

By contrast, model property diffs are much more successful because their `baseType` / `headType` are already the declaration `ModelProperty` values. Once the diff carries a real property, `resolveOrigin()` can recover the declaration path and source location.

## 6. Path to 100% Declaration-Level Resolution

The fix path is straightforward:

1. **Change `diff-operations.ts` to carry the declaration `ModelProperty` for parameter diffs**
   - keep the parameter declaration object alongside the wire type comparison
2. **Set `baseSourceLocation` / `headSourceLocation` from that declaration property**
3. **Call `resolveOrigin()` on the declaration property**
   - the same way model-property diffs already do

Concretely, the parameter diff should preserve both:

- the **declaration property** for source tracing
- the **wire type** for semantic comparison

That would let query/header/path parameter findings behave like model-property findings: compare by wire shape, report by declaration source.

## 7. Metrics Summary

| Spec | Total Findings | Origin-Backed | Origin % | Any-Location | Any-Location % |
|------|---------------:|--------------:|---------:|-------------:|---------------:|
| Network | 26 | 24 | 92.3% | 26 | 100% |
| Fleet | 70 | 62 | 88.6% | 70 | 100% |
| AppConfig | 0 | 0 | N/A | 0 | N/A |

## Conclusion

The source tracing system already has **full location coverage** on the evaluated real specs. The remaining gap is narrower: some operation parameter diffs are still represented in a way that loses the original declaration anchor before location resolution runs. Fixing that in `diff-operations.ts` should close the last declaration-level gap without changing the fallback logic in `resolve-location.ts`.
