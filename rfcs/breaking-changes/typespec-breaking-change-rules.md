## 5. Breaking Change Rules

The `@azure-tools/typespec-breaking-change` tool evaluates wire compatibility by comparing a version to the **previous stable version**.
For versions that already existed before the change, the same rule semantics still apply when the tool detects a structural regression.

Rules are evaluated against canonical HTTP metadata.
That means the tool cares about the observable contract on the wire: operation identity, parameters, payload shapes, status codes, headers, content types, authentication, and encoded value sets.

### 5.1 Service-Level Rules

#### Removing an api-version

**Rule:** `RemovedApiVersion`

Severity: Error, except for replacing the latest preview version.

❌ Removing a stable api-version breaks clients that target that contract and is always an error.
The normal exception is preview churn: replacing the most recent preview with a newer preview is allowed, while removing older previews or any stable version is not.

#### Removing an authentication scheme

**Rule:** `RemovedAuthScheme`

Severity: Error.

❌ Removing a supported authentication scheme is breaking because existing clients may only implement that scheme.
If the service no longer accepts the credential flow a client uses today, the contract has been narrowed in a way the client cannot recover from automatically.

#### Adding a required authentication scheme

**Rule:** `AddedRequiredAuth`

Severity: Error.

❌ Adding a new required authentication mechanism is breaking when clients must now satisfy more than they did before.
For example, changing from “Bearer **or** API key” to “Bearer **and** extra proof” forces existing callers to change how they authenticate.

#### Narrowing OAuth scopes

**Rule:** `NarrowedOAuthScopes`

Severity: Error.

❌ Narrowing OAuth scopes is breaking because callers that were previously authorized may now be rejected.
Removing a required scope from the accepted set is a service-level contract reduction, even when the operation signatures themselves do not change.

### 5.2 Operation Rules

#### Removing an endpoint

**Rule:** `RemovedEndpoint`

Severity: Error.

❌ Removing an endpoint is breaking because existing clients may still call it.
An operation is identified by `{method} {normalized-path}`, so removing that identity removes the callable contract.

> Operation identity is `{method} {normalized-path}`.
> A method change or path change is not a distinct mutation rule.
> The tool reports it as one removed endpoint plus one added endpoint.

### 5.3 Request Rules

#### Adding a required parameter or property

**Rule:** `AddedRequiredRequestParameter` / `AddedRequiredRequestProperty`

Severity: Error.

❌ Adding a required request parameter or request-body property is breaking because existing clients will not send it.
If the server now requires a new field for a request to succeed, older clients become invalid without any change on their side.

#### Removing a parameter or property

**Rule:** `RemovedRequestParameter` / `RemovedRequestProperty`

Severity: Error.

❌ Removing a request parameter or property is breaking because existing clients may continue to send it.
If the service no longer recognizes or allows the field, previously valid requests can fail validation or be interpreted differently.

#### Incompatible type change — format change

**Rule:** `RequestTypeChanged`

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

**Rule:** `RequestTypeNarrowed`

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

**Rule:** `RequestTypeWidened`

Severity: Warning.

✅ A widening change in requests is usually compatible because the server accepts more than it did before.
The tool still reports a warning so reviewers can see that the accepted input domain changed, even though existing clients keep working.

#### Making an optional parameter required

**Rule:** `ParameterMadeRequired`

Severity: Error.

❌ Changing an optional request parameter or property to required is breaking.
Clients that omitted the field before will now fail unless they are updated to always provide it.

#### Strengthening a constraint

**Rule:** `ConstraintStrengthened`

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

**Rule:** `ParameterLocationChanged`

Severity: Error.

❌ Moving a parameter between locations such as query, header, path, or body is breaking.
The logical meaning may be similar, but the HTTP request shape changes and existing clients send the value in the wrong place.

#### Removing a request content type

**Rule:** `RemovedRequestContentType`

Severity: Error.

❌ Removing a supported request content type is breaking because clients may still send payloads using that media type.
If an operation used to accept both JSON and XML and now only accepts JSON, XML callers break even though the operation still exists.

### 5.4 Response Rules

#### Removing a response property

**Rule:** `RemovedResponseProperty`

Severity: Error.

❌ Removing a response property is breaking because clients may rely on it being present.
Even if some clients ignore the field, the contract no longer guarantees data that existing callers may read or persist.

#### Incompatible type change — format change

**Rule:** `ResponseTypeChanged`

Severity: Error.

❌ A response format change is always breaking because the client receives a different wire representation than before.
Changing a field from a number to a string, or from one temporal wire format to another, can break parsing and downstream logic immediately.

#### Type widening — returning more possible values

**Rule:** `ResponseTypeWidened`

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

**Rule:** `ResponseTypeNarrowed`

Severity: Warning.

✅ A narrowing change in responses is usually compatible because the service promises a smaller set of outputs.
The tool reports a warning for awareness, but clients that handled the broader set should continue to handle the narrower one.

#### Making a required property optional

**Rule:** `ResponsePropertyMadeOptional`

Severity: Error.

❌ Changing a required response property to optional is breaking because clients may assume the field is always present.
Once the property can disappear, generated SDKs and handwritten consumers may encounter nullability or missing-field failures.

#### Removing a success status code

**Rule:** `RemovedResponseStatusCode`

Severity: Error.

❌ Removing a success status code is breaking because clients may depend on that status code being part of the successful contract.
A caller that treats `200` and `204` differently can break if one of those successful outcomes disappears.

#### Removing a response content type

**Rule:** `RemovedResponseContentType`

Severity: Error.

❌ Removing a response content type is breaking because clients may negotiate or parse that media type specifically.
The service is no longer honoring an output format that was previously part of the contract.

#### Removing a response header

**Rule:** `RemovedResponseHeader`

Severity: Error.

❌ Removing a response header is breaking when clients depend on that header for concurrency, paging, tracing, or cache behavior.
Headers are part of the HTTP contract just like body fields and status codes.

#### Removing a value from a closed enum or union

**Rule:** `RemovedEnumValue`

Severity: Error.

❌ Removing a member from a closed enum or a variant from a closed union is breaking in responses because clients may explicitly handle or expect that value.
All enums are closed in TypeSpec, so this rule applies to every enum automatically.

#### Adding a value to a closed enum or union

**Rule:** `AddedEnumValue`

Severity: Warning.

⚠️ Adding a member to a closed enum or adding a variant to a closed union is reported as a warning for responses.
It expands the set of values a client may observe, which is risky for strict parsers, but the design treats it as warning-level rather than an automatic error.

#### Adding an optional response property

**Rule:** `AddedOptionalResponseProperty`

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


