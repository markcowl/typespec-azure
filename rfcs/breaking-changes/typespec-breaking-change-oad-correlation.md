## 1. Introduction

We are replacing OAD (openapi-diff) with a TypeSpec-native breaking change tool for TypeSpec-authored specs. This document correlates the OAD rule map used in Azure with the new tool's coverage. OAD's `CrossVersion` and `SameVersion` scenarios align to our Phase B (compare current against previous stable) and Phase A (same-version base vs. head regression check), respectively.

## 2. Coverage Correlation Table

| OAD Rule | Our Equivalent | Notes |
| --- | --- | --- |
| AddedAdditionalProperties | Not covered | Gap to evaluate. This is the open/closed model question: whether additional unknown properties become accepted. |
| AddedEnumValue | Adding closed enum/union value (Warning) / Type widening (Warning in requests) | Covered, but direction-aware. In responses we warn on adding a closed enum/union value; in requests this is effectively widening. |
| AddedOperation | No diagnostic (allowed additive endpoint) | Intentionally not treated as breaking. Our tool focuses on breaking changes, so adding an endpoint is allowed. |
| AddedOptionalProperty | No diagnostic (allowed additive request property) | Intentionally allowed for requests because adding an optional property is non-breaking. |
| AddedPath | No diagnostic (allowed additive endpoint) | Intentionally not treated as breaking. Method/path changes decompose to remove + add, and the add side is allowed. |
| AddedPropertyInResponse | Adding optional response property (Allowed) | Covered as an allowed additive change. OAD reports it, but our tool intentionally does not flag it as breaking. |
| AddedReadOnlyPropertyInResponse | Adding optional response property (Allowed) | Same as above: additive response properties are allowed. |
| AddedRequiredProperty | Adding required parameter/property (Error) | Covered for request-side required additions. |
| AddedXmsEnum | Not applicable | `x-ms-enum` is an SDK/codegen concern, not a wire-level breaking change. |
| AddingHeader | No diagnostic (allowed additive response header) | Intentionally allowed. Adding a response header is additive, so our tool does not flag it. |
| AddingOptionalParameter | No diagnostic (allowed additive optional parameter) | Intentionally allowed for requests because adding an optional parameter is non-breaking. |
| AddingRequiredParameter | Adding required parameter/property (Error) | Covered. |
| AddingResponseCode | No diagnostic (allowed additive response status code) | Intentionally allowed. Adding a response status is additive, not breaking. |
| ArrayCollectionFormatChanged | Not covered | Gap to evaluate. This is a wire-level serialization change for array parameters (`style`/`explode`/collection format). |
| ChangedParameterOrder | Not covered | Gap to evaluate. For HTTP this is usually not wire-relevant, so we do not currently model it. |
| ConstantStatusHasChanged | Incompatible type/value change | Covered by wire-level type/value compatibility checks rather than a dedicated constant-status rule. |
| ConstraintChanged | Partial: Strengthening constraint / Type widening-warning split | OAD has a generic bucket; our design splits this into stronger vs. weaker. If a change cannot be classified, we have no generic fallback rule today. |
| ConstraintIsStronger | Strengthening constraint (Error) | Covered. |
| ConstraintIsWeaker | Type widening / weakened constraint (Warning) | Covered conceptually, but our tool treats weaker request-side constraints as warnings rather than errors. |
| DefaultValueChanged | Not covered | Gap to evaluate. Whether this is wire-breaking depends on whether the default is protocol-visible or only a documentation/client behavior change. |
| DifferentAllOf | Not applicable | OpenAPI structural change. Our tool compares flattened wire shapes, so `allOf` restructuring is intentionally ignored. |
| DifferentDiscriminator | Incompatible type change / response type change | Covered as a wire-level polymorphism/discriminator change. |
| DifferentExtends | Not applicable | OpenAPI inheritance structure is not a direct wire contract if the serialized shape is unchanged. |
| ModifiedOperationId | Not applicable | `operationId` is not wire-level and is explicitly a non-goal. |
| NoVersionChange | Not applicable | Informational/versioning metadata rule, not a breaking wire-contract rule. |
| ParameterInHasChanged | Moving parameter location (Error) | Covered. This is effectively the same wire-level concern as parameter location changes. |
| ParameterLocationHasChanged | Moving parameter location (Error) | Covered. |
| ProtocolNoLongerSupported | Not covered | Gap to evaluate. Scheme/protocol support changes (for example, dropping HTTP/HTTPS support) are not in the current design. |
| ReadonlyPropertyChanged | Partial: direction-aware request/response analysis | Partially covered. `readonly` affects request vs. response applicability, and our model handles direction separately, but we do not have a dedicated readonly-status rule. |
| ReferenceRedirection | Not applicable | OpenAPI `$ref` graph changes are structural only; if wire shape changes, our type/property rules catch that directly. |
| RemovedAdditionalProperties | Not covered | Gap to evaluate. This is the inverse open/closed model problem: unknown properties that were accepted no longer are. |
| RemovedClientParameter | Not applicable | Client parameter behavior is SDK-facing, not an HTTP wire contract concern. |
| RemovedDefinition | Not applicable | Removing a definition is only indirectly relevant. Wire impacts show up as removed properties/types, which our other rules cover. |
| RemovedEnumValue | Removing closed enum/union value (Error) / Type narrowing (Error in requests) | Covered, with direction-aware handling. |
| RemovedOperation | Removing an endpoint (Error) | Covered. |
| RemovedOptionalParameter | Removing parameter/property (Error) | Covered for requests. |
| RemovedPath | Removing an endpoint (Error) | Covered. |
| RemovedProperty | Removing parameter/property (Error) / Removing response property (Error) | Covered, with request/response direction determining the exact diagnostic. |
| RemovedRequiredParameter | Removing parameter/property (Error) | Covered for requests. |
| RemovedResponseCode | Removing status code (Error) | Covered. |
| RemovedXmsEnum | Not applicable | `x-ms-enum` is SDK/codegen metadata, not wire-level. |
| RemovingHeader | Removing header (Error) | Covered for response headers. |
| RequestBodyFormatNoLongerSupported | Removing request content type (Error) | Covered. |
| RequiredStatusChange | Making optional→required (Error) / Making required→optional (Error in responses) | Covered, but direction-aware: request optional→required is breaking, and response required→optional is breaking. |
| ResponseBodyFormatNowSupported | Not covered | Gap to evaluate, though likely intentionally ignored because adding a response content type is additive/informational. |
| TypeChanged | Incompatible type change (request/response direction-aware) | Covered. Our tool analyzes request and response compatibility separately. |
| TypeFormatChanged | Incompatible type change / format change (request/response direction-aware) | Covered. We treat incompatible format changes as breaking. |
| VersionsReversed | Version enum integrity check | Covered by the service-level version ordering/integrity validation in cross-version analysis. |
| XmsEnumChanged | Not applicable | SDK/codegen extension change, not a wire-contract change. |
| XmsLongRunningOperationChanged | Not applicable | LRO orchestration metadata is explicitly a non-goal and not a wire-level contract change. |

## 3. Key Differences in Philosophy

- **Wire-level only**: Our tool only detects changes visible on the HTTP wire. OAD also detects OpenAPI structural changes (`allOf`, `$ref` redirections, definitions) and SDK-facing changes (`x-ms-enum`, `operationId`, LRO extensions).
- **Direction-aware**: Our tool distinguishes request vs. response context for type changes and property compatibility. OAD uses broader rules such as `TypeChanged` without the same request/response split.
- **Three-way type classification**: We separate incompatible format/type change, narrowing, and widening. In practice this means request narrowing is an error, response narrowing is often a warning, request widening is often a warning, and response widening is an error.
- **No false positives from OpenAPI restructuring**: OAD reports `DifferentAllOf`, `ReferenceRedirection`, and `DifferentExtends`, which are often harmless restructurings. Our TypeSpec-native comparison is based on the effective wire contract, so those structural refactors do not trigger diagnostics by themselves.
- **Same scenarios**: OAD's `SameVersion` and `CrossVersion` modes map directly to our Phase A (same-version regression) and Phase B (compare against previous stable) analysis phases.

## 4. Summary

Out of the 50 OAD rules in the Azure rule map, 29 are fully covered by the TypeSpec breaking change tool, 2 are only partially covered (`ConstraintChanged` and `ReadonlyPropertyChanged`), 11 are out of scope because they are SDK-facing or OpenAPI-structural rather than wire-level, and 8 remain clear gaps worth evaluating. The largest follow-up areas are additional-properties/open-vs.-closed-model semantics, parameter serialization format changes, protocol support changes, default value changes, and whether to add any explicit handling for additive-but-reportable cases such as new response formats.
