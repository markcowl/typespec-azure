# Configurable API Diff Architecture

## Overview

Rather than building a bespoke breaking-change detector, we structure the tool as a
**general-purpose HTTP API diff engine** with a **configurable policy layer** that
classifies diffs by context.

```
┌──────────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│ Canonical HTTP   │────▶│ Diff Engine  │────▶│ Policy Engine   │────▶│ Report   │
│ API Graphs (x2) │     │ (all changes)│     │ (context rules) │     │          │
└──────────────────┘     └──────────────┘     └─────────────────┘     └──────────┘
         ▲                                            ▲
         │                                            │
   Version mutators                             Policy config
   + canonicalization                          (phase A / phase B)
```

**Key principle:** The diff engine answers "what changed?" with no opinion on severity.
The policy engine answers "does this change matter in this context?" based on configuration.

---

## Diff Taxonomy

Each diff is an instance of a well-defined `DiffKind`. The taxonomy is exhaustive for
HTTP API surfaces — every observable change maps to exactly one kind.

### Service-Level Diffs

| DiffKind | Description |
|----------|-------------|
| `ApiVersionRemoved` | An API version was removed from the service |
| `ApiVersionAdded` | A new API version was added |
| `AuthSchemeRemoved` | A supported auth scheme was removed |
| `AuthSchemeAdded` | A new auth scheme requirement was added |
| `OAuthScopeRemoved` | An OAuth scope was removed from a flow |
| `OAuthScopeAdded` | A new OAuth scope was added to a flow |

### Operation-Level Diffs

| DiffKind | Description |
|----------|-------------|
| `OperationRemoved` | An operation (route + method) was removed |
| `OperationAdded` | A new operation was added |
| `OperationRouteChanged` | An operation's route template changed |

### Request Diffs

| DiffKind | Description |
|----------|-------------|
| `RequestParameterAdded` | A new parameter was added to the request |
| `RequestParameterRemoved` | A parameter was removed from the request |
| `RequestPropertyAdded` | A new property was added to the request body |
| `RequestPropertyRemoved` | A property was removed from the request body |
| `RequestTypeChanged` | A parameter/property type was changed incompatibly |
| `RequestTypeNarrowed` | A parameter/property type was narrowed (compatible) |
| `RequestTypeWidened` | A parameter/property type was widened (compatible) |
| `RequestParameterMadeRequired` | An optional parameter became required |
| `RequestParameterMadeOptional` | A required parameter became optional |
| `RequestPropertyMadeRequired` | An optional body property became required |
| `RequestPropertyMadeOptional` | A required body property became optional |
| `RequestConstraintStrengthened` | A validation constraint was tightened (minLength, pattern, etc.) |
| `RequestConstraintRelaxed` | A validation constraint was loosened |
| `RequestParameterLocationChanged` | Parameter moved (query→header, path→query, etc.) |
| `RequestContentTypeRemoved` | A supported request content type was removed |
| `RequestContentTypeAdded` | A new request content type was added |
| `RequestEncodingChanged` | Wire encoding changed (@encode) |

### Response Diffs

| DiffKind | Description |
|----------|-------------|
| `ResponsePropertyAdded` | A new property was added to a response body |
| `ResponsePropertyRemoved` | A property was removed from a response body |
| `ResponseTypeChanged` | A response property type was changed incompatibly |
| `ResponseTypeNarrowed` | A response property type was narrowed |
| `ResponseTypeWidened` | A response property type was widened |
| `ResponsePropertyMadeOptional` | A required response property became optional |
| `ResponsePropertyMadeRequired` | An optional response property became required |
| `ResponseStatusCodeRemoved` | A documented status code was removed |
| `ResponseStatusCodeAdded` | A new status code was added |
| `ResponseContentTypeRemoved` | A response content type was removed |
| `ResponseContentTypeAdded` | A new response content type was added |
| `ResponseHeaderRemoved` | A response header was removed |
| `ResponseHeaderAdded` | A new response header was added |
| `ResponseConstraintStrengthened` | A response constraint was tightened |
| `ResponseConstraintRelaxed` | A response constraint was loosened |
| `ResponseEncodingChanged` | Wire encoding changed for a response property |

### Model / Union Diffs

| DiffKind | Description |
|----------|-------------|
| `EnumValueRemoved` | A value was removed from a closed enum |
| `EnumValueAdded` | A value was added to a closed enum |
| `UnionVariantRemoved` | A variant was removed from a union |
| `UnionVariantAdded` | A variant was added to a union |
| `DiscriminatorChanged` | The discriminator property/value changed |

---

## Diff Structure

Each diff instance carries structured metadata:

```typescript
interface ApiDiff {
  kind: DiffKind;
  path: DiffPath;         // e.g., "GET /users/{id}" → request → parameters → "filter"
  base: unknown;          // value in the base graph (undefined if added)
  head: unknown;          // value in the head graph (undefined if removed)
  details?: Record<string, unknown>;  // kind-specific metadata
}

// DiffPath identifies exactly where in the API surface the change occurred
interface DiffPath {
  operation?: string;     // "GET /users/{id}"
  component: "request" | "response" | "service" | "model";
  statusCode?: string;    // for response diffs
  element: string;        // parameter name, property path, etc.
}
```

The diff engine produces `ApiDiff[]` — a flat, complete list of all observable changes.

---

## Policy Configuration

A policy maps `(DiffKind, context metadata) → Classification`.

### Classification

```typescript
type Severity = "error" | "warning" | "info" | "ignore";

interface DiffClassification {
  severity: Severity;
  message: string;        // human-readable explanation
  ruleName: string;       // e.g., "AddedRequiredRequestParameter"
}
```

### Policy Structure

```typescript
interface PolicyRule {
  match: DiffMatcher;
  classify: Severity;
  ruleName: string;
  message?: string;       // override template
}

interface DiffMatcher {
  kind: DiffKind | DiffKind[];
  // Optional refinements:
  isRequired?: boolean;
  isOptional?: boolean;
  direction?: "request" | "response";
  // ... additional filters as needed
}

type PolicyConfig = PolicyRule[];
```

### Context-Dependent Policies

The key insight: the same `DiffKind` maps to different severities depending on comparison context.

#### Phase A Policy (same version, head vs. base)

In this context, we're detecting regressions in a PR. The base represents the "contract"
that the spec previously defined. **Any** observable change to an existing version is
potentially a regression.

```yaml
# phase-a-policy.yaml
name: "Same-Version Regression Detection"
description: "All changes to existing API versions between base and head are flagged"

rules:
  # Every change is an error unless explicitly allowed
  - match: { kind: "*" }
    severity: error

  # Adding a new operation is allowed (additive)
  - match: { kind: "OperationAdded" }
    severity: info

  # Adding an optional request parameter is allowed
  - match: { kind: "RequestParameterAdded", isOptional: true }
    severity: info

  # Adding a response property is allowed (additive for consumers)
  - match: { kind: "ResponsePropertyAdded" }
    severity: info

  # Adding a new status code is informational
  - match: { kind: "ResponseStatusCodeAdded" }
    severity: info

  # Adding a new API version is fine
  - match: { kind: "ApiVersionAdded" }
    severity: ignore

  # Adding a new enum value (response) is additive
  - match: { kind: "EnumValueAdded", direction: "response" }
    severity: info
```

#### Phase B Policy (version vs. previous stable)

In this context, we're checking that no version introduces breaking changes relative
to the last stable release. Compatible evolution is expected.

```yaml
# phase-b-policy.yaml
name: "Cross-Version Breaking Change Detection"
description: "Changes from previous stable that break client compatibility"

rules:
  # --- Errors: definitely breaking ---
  - match: { kind: "OperationRemoved" }
    severity: error
    ruleName: "RemovedEndpoint"

  - match: { kind: "RequestParameterAdded", isRequired: true }
    severity: error
    ruleName: "AddedRequiredRequestParameter"

  - match: { kind: "RequestPropertyAdded", isRequired: true }
    severity: error
    ruleName: "AddedRequiredRequestProperty"

  - match: { kind: "RequestTypeChanged" }
    severity: error
    ruleName: "RequestTypeChanged"

  - match: { kind: "ResponsePropertyRemoved" }
    severity: error
    ruleName: "RemovedResponseProperty"

  - match: { kind: "ResponseTypeChanged" }
    severity: error
    ruleName: "ResponseTypeChanged"

  - match: { kind: "EnumValueRemoved" }
    severity: error
    ruleName: "RemovedEnumValue"

  - match: { kind: "ApiVersionRemoved" }
    severity: error
    ruleName: "RemovedApiVersion"

  # --- Warnings: potentially breaking ---
  - match: { kind: "RequestTypeWidened" }
    severity: warning
    ruleName: "RequestTypeWidened"

  - match: { kind: "ResponseTypeNarrowed" }
    severity: warning
    ruleName: "ResponseTypeNarrowed"

  - match: { kind: "RequestConstraintRelaxed" }
    severity: warning

  # --- Info: notable but not breaking ---
  - match: { kind: "ResponsePropertyAdded" }
    severity: info

  - match: { kind: "RequestParameterAdded", isOptional: true }
    severity: info

  - match: { kind: "OperationAdded" }
    severity: ignore

  # --- Default: flag unknown diffs for review ---
  - match: { kind: "*" }
    severity: warning
```

---

## Comparison to Bespoke Detector

| Dimension | Bespoke Detector | Configurable Diff + Policy |
|-----------|-----------------|---------------------------|
| **Separation of concerns** | Detection and severity intertwined | Clean separation |
| **Adding a new context** | New code paths with conditional logic | New policy file |
| **Testing** | Must test each rule × each context | Test diff engine once, test policies as data |
| **Suppression model** | "Suppress this breaking change" | "Acknowledge this diff" (cleaner) |
| **Changelog generation** | Separate tool needed | Same diffs, different policy (all → info) |
| **User transparency** | User sees violations | User sees changes + classification |
| **Complexity** | Lower initial, higher long-term | Higher initial, lower long-term |
| **Performance** | Can short-circuit | Enumerates all diffs (mitigated by scoping) |

---

## How Suppressions Map

With this architecture, `@approved` acknowledges a *diff*, not a *violation*:

```typespec
// "I know this diff exists and it's intentional"
@approved(reason: "Consolidating auth to OAuth2 only")
@service
namespace MyService { ... }
```

The suppression mechanism becomes:
1. Diff engine produces `ApiDiff[]`
2. Suppression resolver matches `@approved` annotations to specific diffs by path
3. Suppressed diffs are removed (or reclassified to `info`) before policy evaluation
4. Policy engine classifies remaining diffs

This means suppressions are **context-independent** — you suppress the diff once, and it
applies regardless of which policy evaluates it. This is correct because the approval
is about acknowledging the change itself, not its classification.

---

## Diff Engine Implementation Sketch

```typescript
function computeApiDiffs(base: CanonicalApi, head: CanonicalApi): ApiDiff[] {
  const diffs: ApiDiff[] = [];

  // Service-level
  diffs.push(...diffVersions(base.versions, head.versions));
  diffs.push(...diffAuth(base.auth, head.auth));

  // Operations
  for (const [id, baseOp] of base.operations) {
    const headOp = head.operations.get(id);
    if (!headOp) {
      diffs.push({ kind: "OperationRemoved", path: { operation: id, component: "service", element: id } });
      continue;
    }
    // Request diffs
    diffs.push(...diffRequest(id, baseOp.request, headOp.request));
    // Response diffs
    diffs.push(...diffResponses(id, baseOp.responses, headOp.responses));
  }

  // New operations in head
  for (const [id, headOp] of head.operations) {
    if (!base.operations.has(id)) {
      diffs.push({ kind: "OperationAdded", path: { operation: id, component: "service", element: id } });
    }
  }

  return diffs;
}

function diffRequest(opId: string, base: CanonicalRequest, head: CanonicalRequest): ApiDiff[] {
  const diffs: ApiDiff[] = [];

  // Parameters
  for (const [name, baseParam] of base.parameters) {
    const headParam = head.parameters.get(name);
    if (!headParam) {
      diffs.push({ kind: "RequestParameterRemoved", path: { operation: opId, component: "request", element: name } });
      continue;
    }
    diffs.push(...diffTypes(opId, "request", name, baseParam.type, headParam.type));
    if (!baseParam.required && headParam.required) {
      diffs.push({ kind: "RequestParameterMadeRequired", path: { ... }, base: baseParam, head: headParam });
    }
    // ... location, constraints, encoding
  }

  // New parameters in head
  for (const [name, headParam] of head.parameters) {
    if (!base.parameters.has(name)) {
      diffs.push({
        kind: "RequestParameterAdded",
        path: { operation: opId, component: "request", element: name },
        head: headParam,
        details: { isRequired: headParam.required }
      });
    }
  }

  // Body properties (same pattern)
  // ...

  return diffs;
}
```

---

## Policy Engine Implementation Sketch

```typescript
function classifyDiffs(diffs: ApiDiff[], policy: PolicyConfig): ClassifiedDiff[] {
  return diffs.map(diff => {
    // Find first matching rule (rules are ordered, first match wins)
    const rule = policy.rules.find(r => matchesRule(r.match, diff));
    if (!rule || rule.severity === "ignore") return null;
    return {
      ...diff,
      severity: rule.severity,
      ruleName: rule.ruleName ?? diff.kind,
      message: formatMessage(rule, diff),
    };
  }).filter(Boolean);
}

function matchesRule(matcher: DiffMatcher, diff: ApiDiff): boolean {
  if (matcher.kind !== "*" && !arrayify(matcher.kind).includes(diff.kind)) return false;
  if (matcher.isRequired !== undefined && diff.details?.isRequired !== matcher.isRequired) return false;
  if (matcher.direction !== undefined && diff.path.component !== matcher.direction) return false;
  return true;
}
```

---

## Open Questions

1. **Policy format:** YAML config files vs. TypeScript code vs. JSON schema?
   - YAML is readable but loses type safety
   - TypeScript functions give full expressiveness but are harder to share/override
   - Recommendation: TypeScript with a builder pattern, YAML for simple overrides

2. **Diff granularity:** How deep do we diff types?
   - Recursive type diffs could explode (model A references model B which changed)
   - Proposal: diff at the "leaf" level (where the type is used), not at model definition
   - If `ModelA.propX` changed from `string` to `int32`, report one diff on `propX`, not
     a cascading diff on every operation that uses `ModelA`

3. **Custom policies:** Should users be able to define their own policies?
   - For Azure: probably two built-in policies (Phase A, Phase B) with limited override
   - For broader adoption: full custom policy support
   - Start with built-in, add custom later

4. **Diff identity for suppressions:** How do we stably identify a diff across runs?
   - The `DiffPath` (operation + component + element) should be stable
   - Edge case: if an operation is renamed, the path changes — is the suppression still valid?
   - Proposal: suppressions are tied to the TypeSpec source location, not the diff path

5. **Performance:** Is eager enumeration of all diffs acceptable?
   - For typical Azure specs (50-200 operations), yes
   - For very large specs, could add a "scope" filter to the diff engine
   - Not a concern for v1

6. **Relation to OAD rules:** Should the policy ship with OAD-compatible rule names?
   - Recommendation: use our own taxonomy but document the mapping (already done in
     the correlation doc)
