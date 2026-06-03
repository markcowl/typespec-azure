# TypeSpec Breaking Change Detection Tool (`@azure-tools/typespec-breaking-change`)

## 1. Title and Introduction

`@azure-tools/typespec-breaking-change` is a dedicated breaking change detector for TypeSpec-authored HTTP APIs. It exists to compare the wire-level shape of a service across branches and across `api-version` values without depending on emitted OpenAPI, which avoids false positives from emitter-specific document changes and gives results that map back to the original TypeSpec source.

The tool is intended for Azure REST API authoring workflows where reviewers need a reliable answer to a simple question: did this PR change an existing contract in a way that will break clients? Its job is to answer that question using canonical HTTP metadata, stable endpoint identities, and CI-friendly reporting.

## 2. Goals and Non-Goals

### Goals

The tool is designed to do the following:

- Detect breaking HTTP API changes between a base branch and a head branch.
- Detect breaking HTTP API changes across `api-version` evolution on the head branch.
- Treat both same-version regressions and cross-version evolution checks as first-class comparison modes.
- Compare APIs at the wire contract level rather than at the emitted OpenAPI document level.
- Trace findings back to TypeSpec declarations and source locations instead of to generated artifacts.
- Use stable endpoint identities so results survive refactors that do not change the wire contract.
- Support fine-grained, per-change suppression so approved exceptions can be recorded inline with the spec.
- Integrate with CI so findings can surface as diagnostics, machine-readable output, and PR feedback.
- Replace `oad` for TypeSpec-authored specifications.
- Coexist with `oad` for hand-authored OpenAPI specifications that are outside this tool's scope.

### Non-Goals

The tool is explicitly not trying to solve every compatibility problem around a service. The following are out of scope:

- SDK-facing concerns such as generated client names or client-shaping behavior.
- `operationId`, because it is not part of the HTTP wire contract and is primarily an SDK/client concern.
- Comparison of hand-authored OpenAPI documents.
- Long-running operation semantics.
- Pagination semantics.
- OpenAPI extension tracking.

In other words, the tool focuses on HTTP contract compatibility as represented by TypeSpec's compiled HTTP model. It does not attempt to be a general-purpose API governance engine, SDK review tool, or OpenAPI document differ.

## 3. Design Overview

### Summary

The design centers on comparing two compiled views of a TypeSpec service: one from the base input and one from the head input. For each comparison pair, the tool compiles TypeSpec, applies version mutators to materialize the desired `api-version`, canonicalizes the resulting HTTP metadata with `HttpCanonicalizer`, walks the two live type graphs together, classifies the observed differences with breaking-change rules, and reports findings.

This is a **standalone comparison tool**, not a linter rule and not an emitter. That distinction matters because it performs multiple compilations and multiple version-specific evaluations before it can decide whether a change is breaking.

### Architectural shape

At a high level, the execution flow is:

1. Compile the base TypeSpec input.
2. Compile the head TypeSpec input.
3. Apply TypeSpec version mutators to produce the versioned views that need comparison.
4. Canonicalize each versioned view with `@typespec/http-canonicalization`.
5. Build identity-keyed maps of operations and HTTP components.
6. Walk the base and head graphs simultaneously.
7. Feed structural differences into the rule classifier.
8. Emit findings, then resolve suppressions and format output.

### Why the tool is separate from linting and emitting

A linter sees one compilation at a time.

An emitter takes one compilation and produces artifacts.

This tool needs more than that:

- two logical inputs (`--base` and `--head`),
- multiple compilations,
- multiple version-mutated program views,
- pair selection logic,
- comparison-specific reporting.

Because of that, the comparison engine sits beside the compiler pipeline rather than inside a single TypeSpec extension point.

### Canonicalization as the comparison boundary

The design relies on `@typespec/http-canonicalization` to extract canonical HTTP metadata from each compiled program view. That library provides the wire-facing shape of operations, parameters, request bodies, responses, content types, visibility-aware projections, and type transformations needed for comparison.

This keeps the tool focused on comparison rather than re-implementing TypeSpec's HTTP interpretation rules. The breaking change detector still owns identity extraction, comparison pairing, graph walking, rule evaluation, suppression resolution, and reporting, but it deliberately reuses canonical HTTP extraction instead of rebuilding it.

### Comparison model

The tool compares **live type objects**, not serialized JSON snapshots.

That choice is deliberate:

- canonicalized graphs can contain cycles and shared references,
- anonymous and inline types are easier to compare by structural position than by synthetic IDs,
- rule evaluation often needs rich type metadata during traversal,
- direct graph walking avoids building and maintaining a separate serialization contract as the primary comparison format.

JSON dumps may still be useful for debugging, but they are not the core design. The core design is simultaneous traversal of the two in-memory canonical graphs.

### Reporting model

The output of graph walking is not the final user-facing result. Structural differences are first normalized into comparison facts, then classified by rules into breaking or non-breaking outcomes. Findings are then reported with enough context to support:

- CLI output,
- CI annotations,
- PR feedback,
- per-change suppression matching,
- traceability back to TypeSpec source.

### Simple pipeline diagram

```text
Base TypeSpec ── compile ── version mutators ── HttpCanonicalizer ──┐
                                                                    ├── graph walk ── rules ── findings
Head TypeSpec ── compile ── version mutators ── HttpCanonicalizer ──┘
                                                                                      │
                                                                                      └── suppressions / CI output
```

A more comparison-oriented view is:

```text
base@V or base@S  ── canonicalize ──┐
                                    ├── compare matching HTTP graphs ── classify ── report
head@V or head@N  ── canonicalize ──┘
```

### Brief code sketch

```ts
const basePrograms = compileAllRequestedVersions(baseInput);
const headPrograms = compileAllRequestedVersions(headInput);
const comparisonPairs = buildComparisonPairs(basePrograms, headPrograms, options);

for (const pair of comparisonPairs) {
  const baseOps = canonicalizeOperations(pair.baseProgram);
  const headOps = canonicalizeOperations(pair.headProgram);

  for (const [identity, headOp] of headOps) {
    const baseOp = baseOps.get(identity);
    if (!baseOp) continue;

    walkOperationGraphs(baseOp, headOp, diff => {
      const finding = classifyDiff(diff, pair.context);
      if (finding) report(finding);
    });
  }
}
```

The important point in this sketch is not the exact function shape. It is the comparison strategy:

- canonicalize each versioned view,
- correlate by stable operation identity,
- walk both graphs together,
- classify differences with rule logic,
- report findings with source-aware context.

## 4. How Comparisons Work

### Comparison phases

The tool performs comparisons in two distinct phases.

### Phase A: same-version regression

For every version that exists on both the base branch and the head branch, the tool compares:

- `base@V`
- `head@V`

This is the regression check for an already-existing contract. Any breaking difference found here means the PR changed a version that already existed before the change set.

Conceptually:

```text
base@2023-01-01  vs  head@2023-01-01
base@2024-01-01  vs  head@2024-01-01
base@2024-05-01-preview  vs  head@2024-05-01-preview
```

If the same version exists on both sides, it is compared directly to itself across branches. This is the primary way the tool detects regressions in published or previously-declared versions.

### Phase B: cross-version evolution

After Phase A, the tool evaluates versions that are new on the head branch.

For every new version on head, the tool compares that new version against the **previous stable** version, not against the previous preview version.

That means the comparison shape is:

- `head@previousStable` vs `head@newPreview`
- `head@previousStable` vs `head@newStable`

Examples:

```text
head@2024-01-01         vs  head@2024-05-01-preview
head@2024-01-01         vs  head@2025-01-01
```

This phase evaluates whether the newly introduced version evolves from the last stable contract in a breaking way.

### Baseline rules

The baseline policy is strict and intentionally simple:

- Previews are never baselines.
- New versions are always compared to the previous stable version.
- Preview-to-preview comparison is not used to determine breaking change results.
- Stable-to-previous-stable comparison produces errors when breaking changes are found.
- Preview-to-previous-stable comparison also produces errors when breaking changes are found.
- All comparison findings are reported as errors, not warnings.

This policy avoids creating a chain of preview baselines that would make results hard to reason about and easy to manipulate.

### Preview rule consequence

A key consequence of the baseline policy is that types introduced in preview are not treated as existing baseline contract when the next stable version is compared.

If something is introduced in a preview version and then changed before the next stable release, that change is **not** considered breaking solely because it differed from the preview. The stable version is compared to the previous stable baseline, where that preview-only type did not yet exist.

In practice:

1. A type appears for the first time in preview.
2. That type is revised before stable release.
3. The stable version is compared to the previous stable version.
4. Because the type did not exist in that previous stable version, it is treated as new from the baseline perspective.
5. Therefore, the preview-to-stable revision is not reported as a breaking change.

### Version enum integrity

Before comparison begins, the tool validates the version model itself.

The following integrity rules are part of the design:

- Stable versions cannot be removed.
- Versions must remain monotonically ordered.
- Preview replacement is allowed.

These checks protect the meaning of the comparison matrix. If version ordering is invalid, or if a stable version disappears, the comparison result is no longer trustworthy as a contract evolution analysis.

### Pair selection logic

At a high level, pair construction looks like this:

```ts
for (const version of versionsPresentInBaseAndHead) {
  compare(base.at(version), head.at(version), { phase: "same-version" });
}

for (const version of versionsOnlyInHead) {
  const stableBaseline = findPreviousStable(version, head.versions);
  compare(head.at(stableBaseline), head.at(version), { phase: "cross-version" });
}
```

Once a pair is selected, the engine uses the same structural comparison flow for both phases:

1. Build identity-keyed operation maps.
2. Match operations by method and normalized path.
3. Compare request components.
4. Compare response components.
5. Recurse through nested wire types.
6. Classify each structural difference.
7. Report any breaking finding as an error.

### What gets compared inside a pair

Within each selected pair, the tool compares canonical HTTP metadata such as:

- operation identity,
- path and method,
- request path/query/header parameters,
- request body shape,
- response status codes,
- response body shape,
- response headers,
- content-type-specific wire representations.

The comparison is structural and directional. For example, what is breaking for a request payload is not always the same as what is breaking for a response payload, so the rule engine evaluates the direction and context of each change after the graph walker records the difference.

### CLI surface

The comparison engine is exposed through a CLI that selects the inputs, scope, and output format.

Core flags:

- `--base`
- `--head`
- `--version`
- `--format`

Supported modes:

| Mode | Description |
| --- | --- |
| Full matrix | Run Phase A and Phase B together. |
| Base-only | Run only same-version comparisons between base and head. |
| Cross-version-only | Run only new-version comparisons on head against the previous stable baseline. |
| Specific pair | Compare one explicitly selected version pair. |

A representative shape of the interface is:

```text
typespec-breaking-change --base <path-or-ref> --head <path> --format console
typespec-breaking-change --base <path-or-ref> --head <path> --version <api-version>
typespec-breaking-change --base-only --base <path-or-ref> --head <path>
typespec-breaking-change --cross-version-only --head <path>
typespec-breaking-change --compare <fromVersion> <toVersion> --head <path>
```

### Result model

Regardless of mode, the design intent is consistent:

- pick the right version pair,
- canonicalize both sides,
- compare them structurally,
- classify differences using breaking-change rules,
- emit errors for breaking results.

That gives the tool one mental model across both regression detection and version evolution: every run is a comparison of two concrete wire-contract views, and every reported result is grounded in that pair.

---

## 5. Breaking Change Rules

The `@azure-tools/typespec-breaking-change` tool evaluates wire compatibility by comparing a version to the **previous stable version**.
For versions that already existed before the change, the same rule semantics still apply when the tool detects a structural regression.

Rules are evaluated against canonical HTTP metadata.
That means the tool cares about the observable contract on the wire: operation identity, parameters, payload shapes, status codes, headers, content types, authentication, and encoded value sets.

### 5.1 Service-Level Rules

#### Removing an api-version

Severity: Error, except for replacing the latest preview version.

❌ Removing a stable api-version breaks clients that target that contract and is always an error.
The normal exception is preview churn: replacing the most recent preview with a newer preview is allowed, while removing older previews or any stable version is not.

#### Removing an authentication scheme

Severity: Error.

❌ Removing a supported authentication scheme is breaking because existing clients may only implement that scheme.
If the service no longer accepts the credential flow a client uses today, the contract has been narrowed in a way the client cannot recover from automatically.

#### Adding a required authentication scheme

Severity: Error.

❌ Adding a new required authentication mechanism is breaking when clients must now satisfy more than they did before.
For example, changing from “Bearer **or** API key” to “Bearer **and** extra proof” forces existing callers to change how they authenticate.

#### Narrowing OAuth scopes

Severity: Error.

❌ Narrowing OAuth scopes is breaking because callers that were previously authorized may now be rejected.
Removing a required scope from the accepted set is a service-level contract reduction, even when the operation signatures themselves do not change.

### 5.2 Operation Rules

#### Removing an endpoint

Severity: Error.

❌ Removing an endpoint is breaking because existing clients may still call it.
An operation is identified by `{method} {normalized-path}`, so removing that identity removes the callable contract.

> Operation identity is `{method} {normalized-path}`.
> A method change or path change is not a distinct mutation rule.
> The tool reports it as one removed endpoint plus one added endpoint.

### 5.3 Request Rules

#### Adding a required parameter or property

Severity: Error.

❌ Adding a required request parameter or request-body property is breaking because existing clients will not send it.
If the server now requires a new field for a request to succeed, older clients become invalid without any change on their side.

#### Removing a parameter or property

Severity: Error.

❌ Removing a request parameter or property is breaking because existing clients may continue to send it.
If the service no longer recognizes or allows the field, previously valid requests can fail validation or be interpreted differently.

#### Incompatible type change — format change

Severity: Error.

❌ A format change is always breaking for requests because the wire representation itself changes.
Examples include `int32` to `string`, `utcDateTime` to `plainDate`, or any `@encode` change that alters the effective wire format.

```typespec
// Before
model CreateWidgetRequest {
  count: int32;
}

// After
model CreateWidgetRequest {
  count: string;
}
```

#### Type narrowing — accepting fewer values

Severity: Error.

❌ A narrowing change is breaking for requests because clients may send values that used to be accepted but are now rejected.
Typical examples include shrinking a numeric range, converting an open type to a closed set, or removing union variants.

```typespec
// Before
model CreateWidgetRequest {
  state: string;
}

// After
model CreateWidgetRequest {
  state: "active" | "inactive";
}
```

#### Type widening — accepting more values

Severity: Warning.

✅ A widening change in requests is usually compatible because the server accepts more than it did before.
The tool still reports a warning so reviewers can see that the accepted input domain changed, even though existing clients keep working.

#### Making an optional parameter required

Severity: Error.

❌ Changing an optional request parameter or property to required is breaking.
Clients that omitted the field before will now fail unless they are updated to always provide it.

#### Strengthening a constraint

Severity: Error.

❌ Tightening a validation constraint is breaking because it narrows the set of accepted values without changing the declared TypeSpec type.
This includes stronger `@minLength`, `@maxValue`, `@pattern`, `@minItems`, and similar validation rules.

```typespec
// Before
model CreateWidgetRequest {
  @minLength(1)
  name: string;
}

// After
model CreateWidgetRequest {
  @minLength(3)
  name: string;
}
```

#### Moving a parameter location

Severity: Error.

❌ Moving a parameter between locations such as query, header, path, or body is breaking.
The logical meaning may be similar, but the HTTP request shape changes and existing clients send the value in the wrong place.

#### Removing a request content type

Severity: Error.

❌ Removing a supported request content type is breaking because clients may still send payloads using that media type.
If an operation used to accept both JSON and XML and now only accepts JSON, XML callers break even though the operation still exists.

### 5.4 Response Rules

#### Removing a response property

Severity: Error.

❌ Removing a response property is breaking because clients may rely on it being present.
Even if some clients ignore the field, the contract no longer guarantees data that existing callers may read or persist.

#### Incompatible type change — format change

Severity: Error.

❌ A response format change is always breaking because the client receives a different wire representation than before.
Changing a field from a number to a string, or from one temporal wire format to another, can break parsing and downstream logic immediately.

#### Type widening — returning more possible values

Severity: Error.

❌ A widening change is breaking for responses because the service can now return values the client may not know how to parse, store, or branch on.
This is the mirror image of request widening, which is why direction matters.

```typespec
// Before
model Widget {
  count: int32;
}

// After
model Widget {
  count: int64;
}
```

#### Type narrowing — returning fewer values

Severity: Warning.

✅ A narrowing change in responses is usually compatible because the service promises a smaller set of outputs.
The tool reports a warning for awareness, but clients that handled the broader set should continue to handle the narrower one.

#### Making a required property optional

Severity: Error.

❌ Changing a required response property to optional is breaking because clients may assume the field is always present.
Once the property can disappear, generated SDKs and handwritten consumers may encounter nullability or missing-field failures.

#### Removing a success status code

Severity: Error.

❌ Removing a success status code is breaking because clients may depend on that status code being part of the successful contract.
A caller that treats `200` and `204` differently can break if one of those successful outcomes disappears.

#### Removing a response content type

Severity: Error.

❌ Removing a response content type is breaking because clients may negotiate or parse that media type specifically.
The service is no longer honoring an output format that was previously part of the contract.

#### Removing a response header

Severity: Error.

❌ Removing a response header is breaking when clients depend on that header for concurrency, paging, tracing, or cache behavior.
Headers are part of the HTTP contract just like body fields and status codes.

#### Removing a value from a closed enum or union

Severity: Error.

❌ Removing a member from a closed enum or a variant from a closed union is breaking in responses because clients may explicitly handle or expect that value.
All enums are closed in TypeSpec, so this rule applies to every enum automatically.

#### Adding a value to a closed enum or union

Severity: Warning.

⚠️ Adding a member to a closed enum or adding a variant to a closed union is reported as a warning for responses.
It expands the set of values a client may observe, which is risky for strict parsers, but the design treats it as warning-level rather than an automatic error.

#### Adding an optional response property

Severity: Allowed.

✅ Adding an optional response property is not a breaking change.
Well-behaved clients should ignore unknown response fields, so extending the payload with optional data is compatible.

### 5.5 Model and Type Rules

#### Type transition classification

Every type transition is classified into one of three categories before request/response severity is applied.
The category describes the shape of the value-set change; the request/response direction determines whether that change is breaking, warning-level, or allowed.

| Category | Meaning | Request | Response |
|---|---|---|---|
| Format change | Incompatible wire representation or encoding change | ❌ Error | ❌ Error |
| Narrowing | Fewer possible values | ❌ Error | ⚠️ Warning |
| Widening | More possible values | ⚠️ Warning | ❌ Error |

A format change is always breaking.
A narrowing or widening change becomes more or less severe depending on whether the service is consuming the value or producing it.

#### Numeric transitions

Numeric transitions are evaluated by wire-family and range.
Changes within the same family are usually widening or narrowing; changes across incompatible families are format changes.

##### Widening within the numeric family

These transitions accept or produce a larger representable domain without changing the general family.
They are warnings in requests and errors in responses.

| From | To | Classification |
|---|---|---|
| `int8` | `int16` | Widening |
| `int8` | `int32` | Widening |
| `int8` | `int64` | Widening |
| `int8` | `numeric` | Widening |
| `int16` | `int32` | Widening |
| `int16` | `int64` | Widening |
| `int16` | `numeric` | Widening |
| `int32` | `int64` | Widening |
| `int32` | `numeric` | Widening |
| `int64` | `numeric` | Widening |
| `float32` | `float64` | Widening |
| `float32` | `numeric` | Widening |
| `float64` | `numeric` | Widening |

##### Narrowing within the numeric family

These transitions shrink the representable domain while staying in a comparable family.
They are errors in requests and warnings in responses.

| From | To | Classification |
|---|---|---|
| `int64` | `int32` | Narrowing |
| `int64` | `int16` | Narrowing |
| `int64` | `int8` | Narrowing |
| `int32` | `int16` | Narrowing |
| `int32` | `int8` | Narrowing |
| `int16` | `int8` | Narrowing |
| `float64` | `float32` | Narrowing |
| `numeric` | `int64` | Narrowing |
| `numeric` | `int32` | Narrowing |
| `numeric` | `float64` | Narrowing |
| `numeric` | `float32` | Narrowing |

##### Numeric format changes

These transitions change the effective wire representation or numeric family in a way that is not treated as a simple range expansion or contraction.
They are always errors.

| From | To | Why it is a format change |
|---|---|---|
| Any integer | Any float | Integer and floating-point wire forms differ |
| Any float | Any integer | Integer and floating-point wire forms differ |
| Any integer | `decimal` or `decimal128` | Decimal serialization semantics differ |
| `decimal` or `decimal128` | Any integer or float | Decimal serialization semantics differ |
| Any numeric | `string` | Number-to-string wire type change |
| `string` | Any numeric | String-to-number wire type change |

#### Temporal transitions

Temporal types are judged by the effective wire format, not just by the fact that they all represent time-like values.
If the target type changes what appears on the wire, the transition is a format change.

##### Temporal widening

These transitions expand the allowed or returned temporal domain while preserving a compatible family interpretation.
They are warnings in requests and errors in responses.

| From | To | Classification |
|---|---|---|
| `utcDateTime` | `offsetDateTime` | Widening |
| `duration` | `string` | Widening |

##### Temporal narrowing

These transitions restrict the temporal domain without fully changing wire kind.
They are errors in requests and warnings in responses.

| From | To | Classification |
|---|---|---|
| `offsetDateTime` | `utcDateTime` | Narrowing |
| `string` | `duration` | Narrowing |

##### Temporal format changes

These transitions change what kind of temporal value is serialized or how it is encoded on the wire.
They are always errors.

| From | To | Why it is a format change |
|---|---|---|
| `utcDateTime` | `plainDate` | Time component removed |
| `utcDateTime` | `plainTime` | Date component removed |
| `plainDate` | `utcDateTime` | Different wire format |
| `plainTime` | `utcDateTime` | Different wire format |
| `plainDate` | `plainTime` | Different wire meaning and format |
| Any temporal | `string` | Loses temporal semantics unless already string-equivalent |
| Any temporal | Any numeric | Wire type changes |

#### String and string-like transitions

String-like transitions distinguish between constrained strings and completely different wire kinds.
A stronger string constraint is usually a narrowing; switching away from string semantics is a format change.

##### String-like widening

| From | To | Classification |
|---|---|---|
| `url` | `string` | Widening |

##### String-like narrowing

| From | To | Classification |
|---|---|---|
| `string` | `url` | Narrowing |

##### String-like format changes

| From | To | Why it is a format change |
|---|---|---|
| `string` | `bytes` | Plain text versus encoded bytes |
| `bytes` | `string` | Encoded bytes versus plain text |
| `string` | Any numeric | Wire type changes |
| Any numeric | `string` | Wire type changes |
| `string` | `boolean` | Wire type changes |
| `boolean` | `string` | Wire type changes |

#### Union and enum transitions

All `enum` types are closed.
The open/closed distinction only applies to string unions and numeric unions, where an open union includes the base scalar such as `string` or `int32`.

A closed union represents a finite value set.
An open union represents known values plus any value from the base scalar type.
The same distinction applies to numeric unions such as `1 | 2 | 3` versus `1 | 2 | 3 | int32`.

| Transition | Classification | Request | Response |
|---|---|---|---|
| Enum add member | Widening | ⚠️ Warning | ⚠️ Warning for closed response values |
| Enum remove member | Narrowing | ❌ Error | ❌ Error |
| Closed string or numeric union add variant | Widening | ⚠️ Warning | ⚠️ Warning for closed response values |
| Closed string or numeric union remove variant | Narrowing | ❌ Error | ❌ Error |
| Closed string union → open string union | Widening | ⚠️ Warning | ❌ Error |
| Open string union → closed string union | Narrowing | ❌ Error | ⚠️ Warning |
| Open string union add named variant | Informational / equivalent | ✅ Allowed | ✅ Allowed |
| Open string union remove named variant | Informational / equivalent | ✅ Allowed | ✅ Allowed |
| `string` → closed string union | Narrowing | ❌ Error | ⚠️ Warning |
| Closed string union → `string` | Widening | ⚠️ Warning | ❌ Error |
| `string` → open string union | Equivalent | ✅ Allowed | ✅ Allowed |
| Discriminated union add variant | Widening | ⚠️ Warning | ❌ Error |
| Discriminated union remove variant | Narrowing | ❌ Error | ⚠️ Warning |
| `T` → `T | null` | Widening | ⚠️ Warning | ❌ Error |
| `T | null` → `T` | Narrowing | ❌ Error | ⚠️ Warning |

```typespec
// Closed union: fixed set of values
alias Status = "active" | "inactive";

// Open union: known values plus any string
alias Status = "active" | "inactive" | string;
```

```typespec
// Enum values are always closed
// Adding Updating widens the set of possible values.
enum ProvisioningState {
  Succeeded,
  Failed,
  Updating,
}
```

For open unions, adding or removing a named literal is not breaking by itself because the base scalar already admits unknown values.
For closed unions and enums, adding or removing members changes the actual contract surface and must be evaluated directionally.

#### Encoding changes (`@encode`)

`@encode` participates in breaking-change analysis because it changes the effective wire format, not just the logical TypeSpec type.
A change is breaking unless the new encoding exactly matches the default encoding that would have applied without the decorator.

##### Default effective encodings

These defaults matter because adding a decorator that restates the default is a no-op.
Only a change to a different effective encoding is breaking.

| Type | Default effective encoding | Default wire type |
|---|---|---|
| `bytes` | `base64` | `string` |
| `utcDateTime` | `rfc3339` | `string` |
| `offsetDateTime` | `rfc3339` | `string` |
| `duration` | `ISO8601` | `string` |

##### Common encoding outcomes

| Change | Classification | Result |
|---|---|---|
| No `@encode` → `@encode("base64")` on `bytes` | Matches default | ✅ Allowed |
| No `@encode` → `@encode("base64url")` on `bytes` | Format change | ❌ Error |
| No `@encode` → `@encode("rfc3339")` on `utcDateTime` | Matches default | ✅ Allowed |
| No `@encode` → `@encode("rfc7231")` on `utcDateTime` | Format change | ❌ Error |
| No `@encode` → `@encode("unixTimestamp", int32)` on `utcDateTime` | Format change | ❌ Error |
| `@encode("rfc3339")` → `@encode("rfc7231")` | Format change | ❌ Error |
| `@encode("rfc3339")` → `@encode("unixTimestamp", int32)` | Format change | ❌ Error |
| `@encode("base64")` → `@encode("base64url")` | Format change | ❌ Error |
| `@encode("unixTimestamp", int32)` → no `@encode` on `utcDateTime` | Format change | ❌ Error |

```typespec
// Allowed: explicit encoding matches the default
model BlobRef {
  @encode("base64")
  data: bytes;
}
```

```typespec
// Breaking: the wire format changes from RFC 3339 string to Unix timestamp integer
model Widget {
  @encode("unixTimestamp", int32)
  createdAt: utcDateTime;
}
```

`unixTimestamp` is only valid with a numeric wire type.
Any transition between `unixTimestamp` and a string-based datetime encoding is therefore a format change even when the logical value is still “a datetime”.

#### Optionality and requiredness transitions

Optionality changes are directional.
Making a value mandatory narrows the contract; making it optional widens the contract.

| Change | Classification | Request | Response |
|---|---|---|---|
| Optional → required | Narrowing | ❌ Error | ✅ Allowed |
| Required → optional | Widening | ✅ Allowed | ❌ Error |
| Add optional property | Widening | ✅ Allowed | ✅ Allowed |
| Add required property | Narrowing | ❌ Error | ✅ Allowed |
| Remove property | Contract removal | ❌ Error | ❌ Error |

For concrete response rules, a required property becoming optional is still treated as an error because clients may depend on the field always being present.
For concrete request rules, an optional property becoming required is an error because callers that omitted it no longer satisfy the contract.

#### Resource types (bidirectional models)

A model used in both requests and responses is evaluated once per direction.
If a change is breaking in either direction, the model change is treated as breaking overall.

```typespec
// BarProperties appears in both PUT requests and GET responses.
model BarProperties {
  count: int64; // was int32
}
```

In this example, `int32` to `int64` is a widening change.
✅ In requests, widening is acceptable because the service accepts more values.
❌ In responses, widening is breaking because clients may not handle the larger range.
Because the model is bidirectional, the overall result is breaking.

---

## 6. Suppression Mechanism

Every approved breaking change lives inline in TypeSpec source via the `@approved` decorator.
Approvals are version-controlled, reviewable, and co-located with the declarations they affect.
That keeps the approval record in the same PR as the API change, instead of splitting intent across external manifests or CI-only state.

The design uses two suppression modes:

- **Mode A** for changes on declarations that still exist in the new version.
- **Mode B** for changes on deleted declarations or derived HTTP metadata, where the exact target node is not available in the new version.

In both modes, the goal is the same: make approvals explicit, durable under ordinary editing, and easy for reviewers to inspect.

### 6.1 Type Identity Suppressions (Mode A)

Mode A is the common case.
When a breaking change occurs on a declaration that still exists in the new version, `@approved` goes directly on that declaration.
The approval identity is derived from the AST position of the decorated node.

This is the right fit for changes such as:

- property type changed
- scalar encoding changed
- constraint tightened
- optional property made required
- parameter made required
- discriminator shape changed

Example:

```typespec
model BarProperties {
  @approved("response-type-widened", { reason: "Widening count to int64 for large resource counts" })
  @typeChangedFrom(Versions.v2024_01_01, int32)
  count: int64;
}
```

In this form, no `path` value is needed.
The decorator is already attached to the exact node that triggered the finding.
The tool matches the finding to the declaration identity and sees the approval immediately.

This mode is intentionally simple:

1. the rule code identifies **what kind of breaking change** is being approved
2. the decorated declaration identifies **where the change happened**
3. the optional `reason` explains **why the approval is acceptable**

Because the node survives into the new version, the approval survives with it.
That makes Mode A stable across normal edits such as file moves, nearby formatting changes, or declaration reordering.

Mode A covers roughly **80%** of expected suppression scenarios.
It is the preferred authoring path because it is short, local, and easy to review.

### 6.2 Operation Identity Suppressions (Mode B)

Mode B exists for the cases where the target node does **not** survive into the new version, or where the change is on HTTP metadata rather than a standalone declaration.
In those cases, `@approved` goes on the nearest surviving ancestor and uses a `path:` value to identify the affected element.

Typical Mode B cases include:

- removed property
- removed operation
- removed enum member
- removed response header
- removed response status code
- request/response metadata changes with no dedicated declaration node

#### Removed property

When a property is removed, the approval is placed on the model that still survives:

```typespec
@approved("removed-response-property", { path: "properties.legacyStatus", reason: "Removed after deprecation period; field was never populated by the service" })
model BarProperties {
  @removed(Versions.v2024_01_01)
  legacyStatus: string;
}
```

The approval anchor is the model.
The `path` value identifies the removed property under that model.

#### Removed operation

When an operation is removed, the approval is placed on the containing interface:

```typespec
@approved("removed-endpoint", { path: "DELETE /subscriptions/{}/resourceGroups/{}/providers/Microsoft.Foo/bars/{}", reason: "Delete was retired in favor of soft-delete semantics" })
interface Bars {
  @removed(Versions.v2024_01_01)
  delete is ArmResourceDeleteAsync<Bar>;
}
```

Here the interface is the surviving anchor.
The `path` is the wire identity of the removed endpoint.

#### Removed response header

When the change is on HTTP metadata, the approval is placed on the operation:

```typespec
@approved("removed-response-header", { path: "responses.200.headers.X-Custom-Id", reason: "Custom correlation header replaced by standard tracing headers" })
op getBar(@path barName: string): Bar;
```

The header is not represented as an independent named declaration in the same way as a model property.
The operation is therefore the natural anchor, and the `path` points into its HTTP shape.

#### Path notation

Mode B paths use the same notation the diff engine uses when it describes where a finding occurred.
Common forms include:

- `properties.X`
- `request.body.properties.X`
- `request.query.X`
- `request.path.X`
- `request.headers.X`
- `responses.200.body.properties.Y`
- `responses.200.headers.Z`
- `responses.204`
- `request.body.contentTypes.application/json`

A few concrete examples:

- `request.body.properties.tags`
- `request.query.filter`
- `request.path.barName`
- `responses.200.body.properties.provisioningState`
- `responses.200.headers.ETag`

The anchor determines how the path is interpreted:

- on a **model**, paths are rooted at that model, for example `properties.legacyStatus`
- on an **operation**, paths are rooted at operation HTTP metadata, for example `responses.200.body.properties.legacyStatus`
- on an **interface**, paths may identify a removed operation directly by its operation identity

#### Why Mode B is required for removed nodes

Removed declarations are often expressed in TypeSpec with `@removed(...)`.
Those declarations may still appear in source, but they are projected out of the target version.
The breaking change tool compares the projected old and new graphs.
If a node does not exist in the new projection, any decorator attached directly to that removed node disappears with it.

That is why removed elements cannot reliably carry their own approvals.
The approval must be attached to a declaration that still exists in the target version:

- model for a removed property
- interface for a removed operation
- enum for a removed enum value
- operation for response/request metadata changes

Mode B preserves approval visibility even when the exact changed node is gone.

### 6.3 Detecting New Suppressions for Review

Suppressing a breaking change is itself a reviewable action.
The CI workflow therefore compares approvals in the base branch and head branch to determine whether the PR introduced any new or modified approvals.

The mechanism is straightforward:

- compile the base branch
- compile the head branch
- collect all `@approved` decorators from each compilation
- compare them by declaration identity

For each `@approved` in head:

1. find the same node in base using identity matching
2. compare the approval metadata on that node
3. classify the result

The classification rules are:

- **NEW**: base has no matching `@approved`; head does
- **EXISTING**: base and head have the same `@approved`
- **REMOVED**: base had the approval; head removed it
- **MODIFIED**: both have an approval, but the metadata differs

Identity matching uses the same model the suppression system already relies on:

- direct declaration identity for Mode A
- ancestor identity plus `path` for Mode B

Metadata comparison includes the fields that matter for review, especially:

- rule code
- `path`
- `since`
- `reason`

The CI semantics are intentionally conservative:

- **new approvals** require reviewer sign-off
- **modified approvals** require re-review
- **existing approvals** do not require a new review
- **removed approvals** are cleanup and do not require a review gate

Any new or modified approval causes CI to request the `BreakingChangeReviewRequired` label.
That label is the signal that the PR changed the suppression surface and needs explicit reviewer attention.

This keeps two review questions separate but visible in the same PR:

1. **Did the PR introduce a breaking change?**
2. **Did the PR also introduce or change an approval for that breaking change?**

### 6.4 How Suppressions Are Surfaced to Reviewers

The tool surfaces both the overall approval summary and the exact approvals that need attention.
A reviewer should be able to see, from the PR comment alone, whether the suppression state is unchanged or whether the PR is asking for new approval authority.

A typical comment looks like this:

```text
✅ 3 existing approved breaking changes (no new review needed)
⚠️ 2 NEW approvals added in this PR — require reviewer sign-off:
  - @approved("response-type-widened") on BarProperties.count [since: v2024_01_01]
  - @approved("removed-response-property") on BarProperties [path: legacyStatus]

Label required: BreakingChangeReviewRequired
```

This summary tells the reviewer three things immediately:

- some breaking changes are already covered by historical approvals
- this PR added fresh approval intent that has not been reviewed before
- the label gate is tied specifically to those new approvals

The tool also helps authors when a breaking change is **not** approved.
For each unapproved finding, it emits a copy-pasteable suggestion that tells the author exactly what to add and where to add it.

Example:

```text
❌ Breaking change detected: removed-response-property
   Operation: GET /subscriptions/{}/resourceGroups/{}/providers/Microsoft.Foo/bars/{}
   Property: responses.200.body.properties.legacyField

   To approve, add above model Bar:
   @approved("removed-response-property", { path: "properties.legacyField", reason: "<your reason>" })
```

That suggestion is important for authoring quality.
It means authors do not need to reconstruct the right rule code, path syntax, or placement rule from memory.
The tool gives them the exact decorator shape it expects.

In practice, this reviewer experience closes the loop:

- the diff engine detects the breaking change
- the reporting layer explains the finding
- the suggestion shows how to approve it
- the approval-diff logic determines whether that approval is new or existing
- the PR label enforces final reviewer sign-off when needed

### 6.5 Stale Approvals

Approvals can outlive the changes they were meant to justify.
A property may be restored, a constraint may be relaxed again, or a declaration may be refactored so the old approval no longer matches any finding.
When that happens, the approval becomes stale.

The tool audits approvals as part of normal analysis.
If an `@approved` decorator does not match any current breaking change finding, it is reported as a warning rather than silently ignored.

Stale approvals are surfaced as hygiene issues:

- they do **not** block the PR by default
- they appear in reporting as cleanup candidates
- they make future reviews harder if left behind

The tool also provides a codefix to remove them.
In editor or CI-assisted workflows, the author can accept the suggested removal instead of editing the file manually.

The intended lifecycle is simple:

1. approval matches a real finding and is active
2. the spec evolves and the finding disappears
3. the approval no longer matches anything
4. the tool reports a warning
5. the author removes the stale approval using the codefix

This keeps the inline suppression record accurate over time.

### 6.6 Version Scoping

By default, an unscoped `@approved` covers **one** stable-to-stable transition for a given `(rule, identity-path)`.
That works well for the common case where a breaking change happens once and then persists unchanged.

However, some APIs oscillate.
A property may be removed, later re-added, and then removed again.
If approvals were never version-scoped, the old approval could accidentally suppress the later removal even though it represents a new product decision.

That is why the design allows version scoping with `since:`.
The basic rule is:

- an unscoped approval is valid when it matches exactly one distinct stable baseline
- if the same `(rule, identity-path)` fires against multiple distinct baselines, version-scoped approvals are required

Example scenario:

```text
v2023-01-01: legacyStatus exists
v2024-01-01: legacyStatus removed  -> approval added
v2025-01-01: legacyStatus re-added
v2026-01-01: legacyStatus removed again
```

The first removal and the second removal are not the same review event.
They happen in different stable transitions.
If both produce `removed-response-property` for the same identity-path, the tool treats the old unscoped approval as ambiguous.
The later finding is then reported as unsuppressed until the approval is split.

Version-scoped replacements look like this:

```typespec
@approved("removed-response-property", { since: Versions.v2024_01_01, path: "properties.legacyStatus", reason: "Initial removal after deprecation" })
@approved("removed-response-property", { since: Versions.v2026_01_01, path: "properties.legacyStatus", reason: "Removed again after temporary restoration" })
model BarProperties {
  name: string;
}
```

With `since:`, each approval is tied to a specific introducing version.
That prevents reuse across unrelated future transitions and preserves the review history accurately.

## 7. Open Questions

The suppression design is intentionally specific, but several implementation questions remain open.
These do not invalidate the direction; they identify the places where v1 still needs sharper contracts or explicit product decisions.

### 7.1 What is the exact interface contract for the graph walker (`CanonicalTypeNode`)?

The comparison engine depends on simultaneous graph walking of canonicalized type information.
To make that reliable and testable, the tool needs a precise abstraction for what the walker consumes.

Open points include:

- what properties every canonical node must expose
- how child traversal works across models, unions, enums, and scalars
- how source locations are attached to canonical nodes
- how identity is represented for visited-set tracking and cycle detection
- how mock canonical nodes can be built for unit tests without compiling a full spec

Without a clean `CanonicalTypeNode` contract, the walker risks becoming tightly coupled to the exact shape of `@typespec/http-canonicalization` output.
That would make tests fragile and adapter changes harder.

### 7.2 How should implicit defaults vs explicit encoding choices be represented?

TypeSpec often allows metadata to be omitted when a default applies.
The canonicalizer may choose to materialize that default explicitly.
The comparison layer needs a stable rule for when these are considered equivalent.

Examples include:

- omitted vs explicit content type
- omitted vs explicit style or explode value
- omitted vs explicit scalar encoding choice
- default response metadata inferred by the compiler vs metadata written in source

If the tool does not normalize these cases carefully, it may report differences that are only artifacts of representation.
The open question is whether canonical metadata should preserve the distinction between **implicit** and **explicit**, or whether it should normalize both to a single effective wire form before diffing.

### 7.3 Is the full scalar transition table implementable in v1?

The design aims for detailed scalar transition rules rather than a single coarse `type-changed` bucket.
That is desirable, but it creates a substantial correctness surface.

The unresolved question is how much of the transition matrix can realistically ship in v1 with confidence.
Areas that increase complexity include:

- integer widening and narrowing
- float transitions
- decimal/string-like conversions
- temporal encodings
- bytes and content encodings
- enum-to-scalar and scalar-to-enum transitions
- union edge cases with wire-level equivalence

A narrower first release may be safer if the team cannot validate every scalar family adequately.
The tradeoff is between breadth of rule coverage and confidence in false-positive and false-negative behavior.

### 7.4 Should `@approved` support glob or wildcard paths for bulk changes?

The current design assumes **exact path matching only**.
That keeps suppression semantics predictable, but it may be verbose when a PR intentionally removes or changes many related fields at once.

Examples where authors may ask for bulk approval support:

- removing several headers from the same response
- deleting many deprecated properties under a large model
- applying the same approval rationale to a whole subtree of request or response properties

Wildcard support could reduce authoring overhead, but it would also raise difficult questions:

- how broad can a wildcard be before it becomes unsafe
- how are wildcard matches surfaced in review comments
- how do stale-approval checks work when the match set changes over time
- how is reviewer intent preserved if one wildcard suppresses many future findings

The current exact-match model is safer.
The open question is whether the ergonomics cost is high enough to justify a more expressive path language later.

### 7.5 How does performance scale for large specs with many versions?

Performance is a practical open question because the design requires multiple expensive steps:

- compiling base and head
- running version projections
- canonicalizing operations
- walking type graphs
- matching findings to approvals
- auditing stale approvals
- diffing approvals between base and head

Large Azure specs may have many operations, many stable versions, and many previews.
That raises several unknowns:

- whether compilation or canonicalization dominates runtime
- how much repeated work can be cached across comparisons
- whether approval matching becomes expensive with many Mode B paths
- how graph walking behaves on large recursive schemas
- what the CI budget is for shadow, warning, and gate modes

The design already assumes profiling and benchmarking against real repositories before hard gating.
What remains open is the exact scaling curve and which optimizations are required for acceptable CI latency.
