---
applyTo: "packages/typespec-data-exporter/**/*,packages/typespec-*-data/**/*"
---

# TypeSpec data exporter development

Use `@azure-tools/typespec-data-exporter` when a tool needs to extract compiler API data and emit deterministic artifacts.

- Keep domain extraction and row/dataset mapping in the domain emitter package. The toolkit must not depend on domain libraries such as Azure Resource Manager.
- Define exported TypeScript interfaces for datasets consumed by automation. Prefer these APIs over requiring callers to parse emitted files.
- Build artifacts with `createArtifact` and a typed `ArtifactSerializer<T>`. Use the built-in CSV, JSON, or YAML serializers when possible.
- Add a custom serializer in the domain package only when the format has domain-specific semantics. Pass it directly in code; never load executable plugin paths from emitter options.
- Emitter options may select only formats explicitly registered by that emitter.
- Do not mutate the TypeSpec `Program`. Keep extraction, mapping, sorting, and serialization deterministic.
- Sort unordered compiler collections using stable canonical keys before serialization.
- Report failures through TypeSpec diagnostics. Do not emit partial success-shaped artifacts after extraction or serialization errors.
- Source links must have a portable project-relative fallback. Durable web URLs require an explicit URL template and revision.
- Add representative TypeSpec fixture projects that exercise the compiler APIs used by the exporter, plus unit tests for mapping and serializers.
- Maintain at least 90% line, branch, function, and statement coverage in each exporter/toolkit package.
- Document CLI emitter usage and programmatic typed-data usage, and add a Chronus change description.

Use `@azure-tools/typespec-arm-resource-data` as the reference implementation for the extraction → dataset → serializer → artifact pattern.
