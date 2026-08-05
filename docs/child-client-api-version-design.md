# Design: Child-Client API Versions and ARM Feature-File Versions

## Summary

Implement two additive version overrides:

1. Add `@overrideClientApiVersion` to the `Azure.ClientGenerator.Core.Legacy` namespace, allowing a non-root SDK client that models a legacy API to override its default wire API-version value with an opaque string that does not need to appear in the parent service's versions.
2. By default, have AutoRest infer each emitted document's OpenAPI 2 `info.version` when every operation in that document has the same effective `Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion`.
3. Retain `version?: string` on ARM `@featureFileOptions` as an explicit, authoritative override and conflict-resolution escape hatch.

Neither override changes TypeSpec version projections, operation availability, output paths, filenames, or the service-wide version enum.

## Goals

- Allow nested clients to use wire API-version defaults that differ from, and may be absent from, the parent service's declared versions.
- Preserve language scoping while keeping each legacy override local to one interface client.
- Expose enough TCGC metadata for emitters to distinguish a child override from the package default.
- Infer Swagger `info.version` from consistently applied client overrides without requiring duplicate author configuration.
- Allow each ARM feature file to declare an explicit `info.version` when inference is impossible or intentionally overridden.
- Preserve existing default-document and `@info` behavior.
- Avoid expanding the deprecated ARM API.

## Non-goals

- Selecting or creating TypeSpec version projections.
- Supporting API-version overrides for multi-service child clients.
- Changing the package-wide API-version enum.
- Making the decorator value an immutable protocol constant.
- Changing OpenAPI 3 behavior.
- Changing feature filenames or feature assignment.
- Globally changing AutoRest's existing `@info.version` precedence.
- Treating feature-file partitions and client partitions as inherently equivalent.

## 1. Client Generator Core Legacy Decorator

### Proposed API

Add the declaration to
`packages/typespec-client-generator-core/lib/legacy.tsp`, in
`Azure.ClientGenerator.Core.Legacy`:

```typespec
namespace Azure.ClientGenerator.Core.Legacy;

/**
 * Overrides the default wire API version for a non-root client that represents
 * a legacy API.
 *
 * The value is an opaque wire-level default and does not need to be declared
 * by the client's service version enum.
 *
 * The override applies only to the client represented by this interface.
 */
extern dec overrideClientApiVersion(
  target: Interface,
  version: valueof string,
  scope?: valueof string
);
```

This decorator is distinct from:

- `@apiVersion`, which identifies a model property as an API-version parameter.
- `@clientApiVersions`, which controls the service-wide SDK version enum.
- `@clientInitialization`, which controls the structure of client initialization.

`Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion` changes only the
default string sent through a child client's API-version parameter. It does not
participate in TypeSpec version projection or modify any version enum. Its
Legacy placement communicates that this mechanism is for matching existing
legacy service behavior, not for designing new versioning schemes.

Relevant existing declarations are in
`packages/typespec-client-generator-core/lib/legacy.tsp`. That file is imported
by `lib/main.tsp`, and its JavaScript implementations are registered separately
under `"Azure.ClientGenerator.Core.Legacy"` in `src/tsp-index.ts`.

### Example

```typespec
@service
@versioned(Versions)
namespace Contoso;

enum Versions {
  v1: "2024-01-01",
  v2: "2025-01-01",
}

namespace Contoso {
  @Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion("2021-11-01")
  interface LegacyOperations {
    op getLegacyResource(): string;
  }

  interface CurrentOperations {
    op getCurrentResource(): string;
  }
}
```

`LegacyOperations` defaults to `2021-11-01`, which intentionally is not a
member of `Versions`. `CurrentOperations` retains the normal package default.
No `@client` decorator is required in this example: when a specification has no
explicit `@client` declarations, TCGC automatically creates subclients for
nested non-template interfaces.

Scoped overrides remain supported:

```typespec
@@Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion(
  ContosoSdk.LegacyOperations,
  "2021-11-01",
  "go"
);

@@Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion(
  ContosoSdk.LegacyOperations,
  "2022-06-15",
  "javascript"
);
```

Authors may instead write
`using Azure.ClientGenerator.Core.Legacy;` and use
`@overrideClientApiVersion`, but fully qualified examples make the legacy-only
intent explicit.

### Legacy Usage Policy

The decorator is intentionally placed in the Legacy namespace:

- It should be used only when an existing service exposes a child API whose
  wire API-version value cannot be represented by the parent service's normal
  version declarations.
- New APIs should model versioning through ordinary TypeSpec versioning rather
  than introducing out-of-band child defaults.
- The existing Azure Core `no-legacy-usage` lint rule may warn when the
  decorator is applied. That warning is intentional guidance rather than a
  TCGC compilation error.

The legacy classification does not change runtime semantics. AutoRest and
language emitters consume the same public accessor/effective metadata, and
usage remains scoped through the normal TCGC scoped-state helpers.

### Target Identity

After the active emitter's client hierarchy has been built:

- The target must be an `Interface` that maps by exact identity to an `SdkClient`.
- Interfaces are the preferred and only supported target because TypeSpec
  versioning can add, remove, and rename them when the legacy child API must
  exceptionally be replaced.
- The interface may represent either an implicit or explicit client.
- Virtual or synthesized clients cannot be targeted directly.
- The target must be a non-root client.

TCGC has two client-shaping modes:

1. If no applicable `@client` declaration exists, TCGC creates a root client
   for each service namespace and implicit subclients for nested non-template
   namespaces and interfaces (`src/cache.ts:330-359,560-625`).
2. If any applicable `@client` or deprecated `@operationGroup` declaration
   exists, TCGC uses explicit mode. The decorated interface must then also be
   declared as a client or its operations will not belong to a generated client
   (`src/cache.ts:197-310`; `src/decorators.ts:336-350`).

The override decorator itself must not switch the specification into explicit
mode. Requiring authors to add `@client` unnecessarily could cause unrelated
undecorated interfaces or namespaces to disappear from the generated client
hierarchy.

Client hierarchy and service resolution occur after decorators execute, so
full target validation must run after the client cache has been prepared.

### Scoping

The implementation should use the existing scoped-state helpers:

- Store values with `setScopedDecoratorData`.
- Resolve values with `getScopedDecoratorData`.
- Preserve positive, negative, grouped-negative, and all-emitter scope behavior.
- Consider only the interface decoration applicable to the active emitter.

Existing scoped-state patterns are in
`packages/typespec-client-generator-core/src/decorators.ts:102-151`.

### Interface-Local Semantics

The override applies only to the client represented by the decorated interface.
It is not inherited from enclosing namespaces. This keeps the legacy behavior
explicit and makes each affected child API independently discoverable.

### Wire-Level Override Semantics

The supplied value is an opaque protocol string:

- It does not need to exist in the service's `@versioned` enum.
- It is valid for an unversioned service when the client has an API-version parameter.
- It does not need to survive emitter `api-version` filtering.
- It must not be added to `client.apiVersions` or `versionsEnum`.
- It does not change client, operation, model, or package availability.
- It changes only the effective `clientDefaultValue` of API-version parameters for that interface client.

The client must still resolve to exactly one service because one override string
cannot identify which service it applies to in a multi-service client. The
client must also expose an API-version parameter; otherwise the override has no
wire location to affect.

This design is feasible with the current TCGC data flow. The per-client
`__clientApiVersionDefaultValueCache` already stores arbitrary strings
(`src/interfaces.ts:72`, `src/package.ts:150-173`), and API-version parameter
defaults are populated from that cache (`src/internal-utils.ts:325-359`).
Availability and projection are computed separately
(`src/internal-utils.ts:360-438`), so an out-of-enum value does not alter the
projected API surface.

### Validation Timing

Use two validation phases:

1. Decorator time rejects an empty or whitespace-only version.
2. SDK package generation resolves client identity, shaping mode, service count, API-version parameter presence, and applicable scope.

Semantic resolution should run after client and operation cache preparation but
before API-version default information is populated. This timing is required
for client hierarchy and target resolution. The active emitter context is still
needed to resolve scoped decorator applicability, but no version-enum or
projection membership check is performed.

### Runtime Precedence

The decorator sets a default; it is not an immutable protocol constant.

1. An API version explicitly supplied through that exact child's runtime options wins.
2. Otherwise, `Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion` supplies the child default.
3. A parent client's runtime API-version option must not cross an override boundary.
4. If an emitter has no child-specific runtime option, child requests use the decorator value.

### Diagnostics

All recommended diagnostics are errors because silently using the wrong protocol
version is unsafe.

| Diagnostic | Intent |
| --- | --- |
| `client-api-version-empty` | Version cannot be empty or whitespace-only. |
| `client-api-version-invalid-target` | Interface does not resolve to an implicit or explicit SDK client for the active scope. |
| `client-api-version-root-client` | The decorator is supported only on non-root clients. |
| `client-api-version-multiple-services` | The client does not resolve to exactly one service. |
| `client-api-version-no-parameter` | The client has no API-version parameter to override. |

Diagnostics should identify the client, service, and supplied version and target
the decorator argument where possible.

## 2. TCGC Data Model and Flow

### Internal Representation

Store the interface-local value directly on the internal client:

```ts
/** API-version override declared on this interface client. */
apiVersionOverride?: string;
```

Do not add an `apiVersionOverrideOwner?: SdkClient` pointer or
`isApiVersionOverrideOwner` flag. There is no inherited decorator value whose
declaration owner must be tracked, and TCGC has no precedent for synthetic
owner pointers for decorator metadata.

### Public `SdkClientType`

Expose:

```ts
/** API-version override declared for this interface client. */
apiVersionOverride?: string;
```

Do not overload `apiVersions`. That property continues to describe the versions
on which the client exists. The override value may intentionally be absent from
both `apiVersions` and `versionsEnum`; supporting emitters must not assume
membership in either collection.

### Package Generation

The package-generation sequence should become:

1. Prepare the client hierarchy and package versions.
2. Resolve and validate child API-version overrides.
3. Populate existing client API-version information.
4. Continue existing type and package creation.

For a valid override:

- Keep `client.apiVersions` as the existing filtered availability list.
- Set the client's API-version default-value cache to `apiVersionOverride`.
- Propagate that default to API-version parameters generated for the client.
- Keep `versionsEnum` service-wide.
- Copy the effective override into `SdkClientType`.

The override must take precedence over the normal projected-latest default and
any existing raw default assigned to the API-version parameter. It must not be
inserted into the service-wide version enum.

Do not change `SdkPackage.metadata.apiVersion` or `SdkPackage.metadata.apiVersions`;
they describe package or service projection metadata, not individual clients.

Relevant implementation points include:

- `packages/typespec-client-generator-core/src/package.ts:149-174`
- `packages/typespec-client-generator-core/src/internal-utils.ts:324-359`
- `packages/typespec-client-generator-core/src/clients.ts:198-287`
- `packages/typespec-client-generator-core/src/interfaces.ts:107-123,206-233`

### Override Boundaries and Parameter Identity

Current ancestor parameter promotion can reuse a child's API-version parameter.
When the child has an interface-local override:

- Do not promote the child's parameter to an ancestor as though it had the ancestor default.
- Clone rather than mutate a shared API-version parameter object when clients have different defaults.
- Keep initialization metadata carrying the interface-local override on the child.

This is a correctness requirement: existing client parameter propagation can
share parameter objects by reference (`src/clients.ts:259-268,410-419`).
Mutating such an object would also change the parent or a sibling.

An owner field would not itself prevent this aliasing bug. The actual safeguard
is client-specific parameter identity or cloning for the decorated interface.

## 3. Downstream Emitter Changes

These changes are required for complete end-to-end behavior.

### TypeScript

`packages/typespec-ts/src/modular/build-classical-client.ts:314-351`
currently propagates parent options directly into child construction.

At an override boundary, generated option ordering should be equivalent to:

```ts
{
  ...parentOptions,
  apiVersion: child.apiVersionOverride,
  ...explicitChildOptions,
}
```

This ensures:

- A parent runtime API version does not leak across the boundary.
- Explicit child options still win.
- Existing behavior remains unchanged when no override exists.

TypeScript already serializes `clientDefaultValue` directly for operation
parameters. It must additionally ensure every `isApiVersionParam` client or
context option is typed as `string`, including custom-named API-version
parameters, rather than identifying the parameter only by its conventional
name.

### Go

`packages/typespec-go/src/tcgcadapter/clients.ts:450-489,1319-1389` must
treat a child interface's overridden default as distinct from the parent's
default even when the API-version parameter names are identical.

- Child operations use the child's raw override string as their default constant.
- Parent `ClientOptions.APIVersion` must not replace the child override.
- The initial implementation need not add a new public child-options parameter solely for this feature.

Go already synthesizes a string constant when an API-version default is absent
from known service versions, so no production Go change is expected. Add
integration coverage to lock in that behavior.

### Other Emitters

Audit other emitters before advertising universal support. Changes outside
TypeScript and Go can be follow-up work unless those emitters claim support for
the decorator. Every supporting emitter must be able to emit the override as a
literal string without resolving it through `versionsEnum`.

## 4. Required Client Generator Core Changes

- `lib/legacy.tsp`: add the decorator declaration and legacy-only documentation.
- `src/decorators.ts`: add scoped state, setter, getter, and immediate string validation.
- `src/tsp-index.ts`: register `$overrideClientApiVersion` in the `"Azure.ClientGenerator.Core.Legacy"` decorator map.
- `src/interfaces.ts`: add internal and public override metadata.
- `src/cache.ts`: resolve the decorated interface under implicit or explicit client shaping.
- `src/package.ts`: resolve overrides before API-version information is populated.
- `src/internal-utils.ts`: apply the interface-local override to the resolved default.
- `src/clients.ts`: populate public metadata and prevent cross-boundary parameter sharing.
- `src/validations/clients.ts`: implement semantic validation.
- `src/lib.ts`: define diagnostics.
- `generated-defs/Azure.ClientGenerator.Core.Legacy.ts`: regenerate decorator definitions.
- Tests: add focused decorator, hierarchy, parameter, and versioning tests.
- Tests: cover fully qualified and `using ...Legacy` syntax, implicit interface clients, and explicit client mode.
- Documentation: update the package README and generated Legacy website reference.

## 5. ARM `@featureFileOptions.version`

This property remains part of the design, but it is no longer the default way
authors set `info.version`. AutoRest first attempts consistent per-document
inference from `Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion`.
The feature option is the explicit,
highest-precedence mechanism for files that do not align cleanly with client
boundaries or whose version must be stated independently.

### TypeSpec API

Extend only the current model in
`packages/typespec-azure-resource-manager/lib/decorators.tsp:310-339`:

```typespec
model ArmFeatureFileOptions {
  featureName: string;
  fileName: string;
  description: string;
  title?: string;
  termsOfService?: string;

  /** OpenAPI info.version emitted for this feature file. */
  version?: string;
}
```

### Legacy Compatibility

Do not add `version` to deprecated `ArmFeatureOptions`.

- The request applies specifically to `@featureFileOptions`.
- Existing legacy specifications continue to compile and retain current output.
- Avoid expanding and prolonging the deprecated public surface.
- Runtime storage can still use one internal shape with an optional version.

The existing implementation delegates through an unsafe cast in
`packages/typespec-azure-resource-manager/src/resource.ts:1664-1683`. Replace it
with a real `$featureFileOptions` implementation while continuing to use the
existing feature-options state map.

A resolved internal type can preserve compatibility:

```ts
export type ResolvedArmFeatureOptions =
  ArmFeatureOptions & Pick<ArmFeatureFileOptions, "version">;
```

Use that type for feature state and public getters. Preserve existing
last-application-wins replacement behavior.

### Value Validation

- Omitted `version`: no override.
- Empty or whitespace-only `version`: ARM diagnostic error.
- Valid values are preserved exactly rather than trimmed silently.
- An invalid option object should not replace an existing valid state entry.

### Required ARM Changes

- `lib/decorators.tsp`: add `version?: string`.
- `generated-defs/Azure.ResourceManager.ts`: regenerate generated types.
- `src/resource.ts`: implement the new decorator directly and expose the version.
- `src/lib.ts`: add the empty-version diagnostic.
- `src/index.ts`: export the resolved options type if public getters return it.
- `test/resource.test.ts`: cover storage, omission, invalid input, duplicate precedence, and legacy compatibility.
- README and generated website reference: document the property.

No state-key change or new public accessor is required. AutoRest already
consumes feature records through `getResourceFeatureSet`.

## 6. AutoRest `info.version`

AutoRest currently initializes `info.version` from the projected version,
falling back to `"0000-00-00"`, and later applies `@info` metadata.

Relevant code is in:

- `packages/typespec-autorest/src/openapi.ts:284-304`
- `packages/typespec-autorest/src/openapi.ts:3088-3092`
- `packages/typespec-autorest/src/openapi.ts:3256-3259`
- `packages/typespec-autorest/src/openapi.ts:3391-3411`

### Default Inference

AutoRest should collect the effective override for every `HttpOperation`
actually emitted to each physical OpenAPI document.

For each document:

1. No operations: do not infer; retain normal version behavior.
2. All operations have no override: do not infer; retain normal behavior.
3. Every operation has the same defined override: infer that value.
4. Operations have two or more distinct override values: warn once and do not infer.
5. Some operations have an override and some do not: warn once and do not infer.

On mismatch, AutoRest must never choose the first, majority, or lexically
preferred value. It retains the normal fallback deterministically.

Collection must occur from the exact in-scope operations assigned to the
document, not from namespace traversal. The correct insertion point is each
document proxy's `createOrGetEndpoint`, where both the destination document and
TypeSpec operation are known:

- Default proxy: `src/openapi.ts:3068-3077`
- Feature proxy: `src/openapi.ts:3221-3232`

Resolve the accumulated state immediately before document finalization:

- Default document: `src/openapi.ts:3110-3117`
- Feature documents: `src/openapi.ts:3278-3304`

This naturally excludes projected-away and out-of-scope operations and handles
feature assignment according to the actual emitted partition.

### Effective Override Accessor

AutoRest already depends on TCGC and creates a lightweight `TCGCContext`; it
does not need to build an `SdkPackage`. Add a public TCGC accessor:

```ts
getEffectiveClientApiVersionOverride(
  context: TCGCContext,
  operation: Operation,
): string | undefined;
```

The accessor must use TCGC's authoritative operation-to-client shaping rather
than lexical namespace ancestry. Lexical lookup is insufficient because:

- `@clientLocation` can move an operation.
- Implicit and virtual clients may not align with lexical containers.
- Same-named clients may be merged from multiple source targets.
- Interface and namespace clients participate in one shaped hierarchy.

The resolver must:

1. Locate the shaped client through TCGC's operation-to-client cache.
2. Read the scoped override directly from the client's backing interface.
3. Return no value for namespace-backed or virtual clients.
4. Detect conflicting source identities if interface clients are merged.
5. Resolve scope for AutoRest's emitter identity.

AutoRest version projections introduce an additional identity concern: projected
operations must map back to the decorator-bearing source operation/client. TCGC
must either accept AutoRest's projected Realm/root when creating its context or
provide a projected-to-original identity bridge. This is required before
inference is considered implemented; a raw decorator getter is not sufficient.

### Scope Policy

Only overrides applicable to the AutoRest emitter scope participate in
inference. Language-only values such as `"go"` or `"javascript"` do not affect
Swagger output. Unscoped overrides are therefore the normal authoring pattern
when the value should also become `info.version`.

The documentation must make this explicit because changing decorator scope can
otherwise change whether AutoRest infers a value.

### Precedence

| Priority | Source | Applies to |
| --- | --- | --- |
| 1 | Explicit `@featureFileOptions.version` | That feature document |
| 2 | One consistent effective `Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion` across every operation | Default or feature document |
| 3 | `@info.version` | Existing service behavior |
| 4 | Projected API version | Existing versioned-service fallback |
| 5 | `"0000-00-00"` | Existing unversioned fallback |

The explicit feature value remains authoritative because feature partitions do
not inherently match client boundaries. It also suppresses inference-conflict
warnings for that feature file: the author has supplied an intentional,
unambiguous value.

Both explicit and inferred values must be applied after shared `@info` merging
so they cannot be overwritten. Globally changing default-document precedence
outside this chain remains out of scope.

### Mismatch Diagnostic

Add an AutoRest warning:

`inconsistent-client-api-version-override`

Suggested message:

> Operations emitted to OpenAPI document '{fileName}' must use one consistent
> `Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion` value to infer
`info.version`. Found: {values}.
> The normal document version '{fallbackVersion}' will be retained.

Render operations without an override as `<none>`.

The requested namespace diagnostic target should be the lowest common enclosing
namespace of the conflicting emitted operations, falling back to the service
namespace when there is no more specific common namespace. Because one file can
contain operations from multiple namespaces, the diagnostic message must also
name representative conflicting operations and values. An implementation may
add related diagnostics on those operations if supported.

Severity is warning rather than error because:

- Existing specifications must continue emitting.
- The fallback is deterministic.
- Authors can resolve ambiguity by making client overrides consistent or by
  setting `@featureFileOptions.version` explicitly.

### Scope of the Value

The feature version affects only `document.info.version`. It must not affect:

- Snapshot filtering.
- `context.version`.
- The AutoRest emitter's `version` option.
- Output path interpolation.
- Feature filenames.
- Included operations, schemas, or examples.

### Required AutoRest Changes

- `src/openapi.ts`: accumulate effective overrides per physical document, apply precedence, and issue mismatch warnings.
- `src/lib.ts`: define `inconsistent-client-api-version-override`.
- `src/emit.ts`: preserve or pass projection identity needed by the TCGC resolver.
- `test/arm/arm.test.ts`: test feature inference, explicit precedence, common files, and conflicts.
- `test/info.test.ts`: test inference for the default document and existing fallbacks.
- `test/versioning.test.ts`: test projected operation identity and prove inference does not alter projections.
- `test/options.test.ts`: update only if shared fixtures require it.

No new package dependency is needed because AutoRest already has TCGC as a peer
and development dependency.

## 7. Test Matrix

### Client Generator Core

- Valid direct child override.
- Implicit interface client without `@client`.
- Explicit interface client when the specification uses explicit client shaping.
- Undecorated interface is not accidentally promoted when explicit mode is active.
- Scope-specific and negated-scope selection.
- Root target error.
- Non-client and virtual-client target errors.
- Zero-service and multi-service errors.
- Override value absent from the service enum is accepted and preserved verbatim.
- Override on an unversioned service with an API-version parameter is accepted.
- Client without an API-version parameter reports an error.
- Empty and whitespace-only version errors.
- Override remains absent from `apiVersions`, while availability remains unchanged.
- Override remains absent from `versionsEnum`, which stays service-wide.
- API-version parameter receives the child default.
- Parent and sibling parameter defaults are not mutated through shared references.
- `@added` and `@removed` availability is unaffected.
- Package metadata remains unchanged.
- TypeScript parent, child default, and explicit child option precedence.
- TypeScript custom-named API-version parameters remain typed as strings.
- Go synthesizes and uses a literal constant for the out-of-enum override.

### ARM and AutoRest

- Version is stored for each feature.
- Omitted version preserves existing state and output.
- Empty and whitespace-only values are rejected.
- Legacy `@featureOptions` remains accepted without a version member.
- Different feature files can emit different versions.
- Feature version overrides `@info.version`.
- Without a feature version, `@info.version` wins.
- Without either value, the projected version wins.
- Unversioned fallback remains `"0000-00-00"`.
- Default document behavior remains unchanged.
- Feature version does not change paths, operations, filenames, or projected snapshots.

## 8. Documentation, Generated Artifacts, and Releases

- Run `tsp format` on every edited `.tsp` file.
- Regenerate decorator TypeScript definitions using each package's `tspd` or `gen-extern-signature` workflow.
- Regenerate library reference documentation.
- Update Client Generator Core versioning guidance.
- Update the ARM decorator README and generated website references.
- Add Chronus entries for Client Generator Core, ARM, AutoRest, and each emitter changed.

The Client Generator Core and ARM changes are additive minor features. Emitter
changes should be classified according to the repository's Chronus policy.

## 9. Compatibility and Rollout Risks

- Existing specifications are unchanged unless they use the new API.
- Adding an optional ARM model property is source-compatible.
- Not changing legacy `ArmFeatureOptions` avoids expanding deprecated API.
- Emitters may continue inheriting the parent version unless they explicitly consume the interface-local override metadata.
- Emitters that resolve defaults only through `versionsEnum` may silently drop or fail to emit an out-of-enum override; literal-string emission is a required support criterion.
- Scoped validation must use the active emitter to avoid false diagnostics.
- API-version parameter objects must not be shared and mutated across clients with different defaults.
- AutoRest must apply the feature version after `@info` merging.
- Documentation must state which language emitters support the decorator in the initial release.

## 10. Alternatives Rejected

- Reusing `@apiVersion`: it classifies parameters and has different target semantics.
- Reusing `@clientApiVersions`: it changes the service-wide version enum rather than one client's wire default.
- Allowing root clients: this duplicates existing package and emitter version selection.
- Allowing multi-service clients: one string cannot identify which service it controls.
- Using the override to select projections: this would alter the emitted type graph rather than one client default.
- Adding the property to legacy `ArmFeatureOptions`: this unnecessarily expands deprecated API.
- Globally changing projected-version and `@info.version` precedence: this is unrelated and potentially breaking.
- Initializing feature documents with the feature version only: later `@info` merging would overwrite it.

## 11. Maintainer Decisions

1. Confirm TypeScript and Go as the initially supported emitters.
2. Decide whether a future Go API should expose child-specific runtime version options. This is not required for the initial implementation.

## 12. Addendum: Exceedingly Rare Subclient Version Evolution

The override is intentionally a fixed scalar for one interface declaration. It
does not need a service-version dimension. If the legacy subclient itself moves
to a different wire API version in a future parent service version, replace the
interface and its operations using standard TypeSpec versioning.

This is expected to happen exceedingly rarely.

```typespec
@service
@versioned(Versions)
namespace Contoso;

enum Versions {
  v1: "2024-01-01",
  v2: "2025-01-01",
}

namespace Contoso {
  @removed(Versions.v2)
  @renamedFrom(Versions.v2, "LegacyOperations")
  @Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion("2019-06-01")
  interface LegacyOperationsV1 {
    @sharedRoute
    @route("/legacy/widgets/{name}")
    op getWidget(@path name: string): Widget;
  }

  @added(Versions.v2)
  @Azure.ClientGenerator.Core.Legacy.overrideClientApiVersion("2021-08-01")
  interface LegacyOperations {
    @sharedRoute
    @route("/legacy/widgets/{name}")
    op getWidget(@path name: string): Widget;
  }
}
```

The v1 projection contains `LegacyOperationsV1` under its projected historical
name, `LegacyOperations`, with the `2019-06-01` override. The v2 projection
removes that interface and includes the new `LegacyOperations` interface with
the `2021-08-01` override.

Consequences:

- Both historical and current API shapes can be reconstructed from their
  respective projections.
- The old and new interfaces and operations are distinct TypeSpec identities.
- Operations may be duplicated, but shared models can remain unchanged.
- `@sharedRoute` is required when both declarations use the same HTTP route in
  the unprojected program.
- In normal implicit client mode, neither interface requires `@client`; each
  surviving interface becomes a subclient automatically.
- If the specification has opted into explicit client shaping, both interfaces
  must also use `@client` so each projected interface participates in the
  generated hierarchy.
- AutoRest inference observes only the operations surviving in the active
  projection, so each emitted document receives the matching override.

This replacement pattern is preferred over adding version-indexed state to
`@overrideClientApiVersion`. A version-aware decorator would require a more
complex TCGC state model, projection-aware accessors, emitter metadata, and
runtime behavior for SDKs that support multiple parent API versions.
