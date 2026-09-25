# @azure-tools/typespec-data-exporter

Toolkit for building deterministic TypeSpec data emitters. It separates a data export into four stages:

1. Extract data from a TypeSpec `Program`.
2. Map it into typed datasets.
3. Serialize each dataset with a built-in or custom `ArtifactSerializer<T>`.
4. Emit the artifacts through TypeSpec's `emitFile`.

The package includes deterministic CSV, JSON, and YAML serializers and portable source-reference helpers. It does not dynamically load executable plugins from emitter options. A domain emitter deliberately registers the serializers it supports.

## Authoring an exporter

```ts
import {
  createArtifact,
  defineDataExporter,
  jsonSerializer,
  runDataExporter,
} from "@azure-tools/typespec-data-exporter";
import type { EmitContext } from "@typespec/compiler";

interface Options {
  format?: "json";
}

const exporter = defineDataExporter<Options, Required<Options>>({
  normalizeOptions: (options) => ({ format: options?.format ?? "json" }),
  buildArtifacts: (context) => {
    const rows = [{ namespace: context.program.getGlobalNamespaceType().name }];
    return [createArtifact({ name: "namespaces", value: rows, serializer: jsonSerializer })];
  },
});

export async function $onEmit(context: EmitContext<Options>): Promise<void> {
  await runDataExporter(context, exporter);
}
```

A custom format implements `ArtifactSerializer<T>` and is passed directly to `createArtifact`. Keep extraction, mapping, and serialization deterministic; sort unordered compiler collections before emitting.
