# @azure-tools/typespec-arm-resource-data

Emits comparable ARM resource and operation datasets from `resolveArmResources`.

```bash
tsp compile . --emit @azure-tools/typespec-arm-resource-data
```

The default output is `resources.csv` and `operations.csv`. JSON and YAML use the same fields:

```yaml
emit:
  - "@azure-tools/typespec-arm-resource-data"
options:
  "@azure-tools/typespec-arm-resource-data":
    format: json
    resources-file: arm-resources
    operations-file: arm-operations
    source-url-template: "https://github.com/org/repo/blob/{revision}/{path}#L{line}"
    source-revision: "0123456789abcdef"
```

`resources-file` and `operations-file` are filename stems; the selected format supplies the extension.

## Matching resources and operations

`resourceKey` combines a lowercase ARM resource type with a normalized resource instance path. `operationKey` combines the lowercase HTTP verb with a normalized operation path. ARM literal path segments are lowercased and every path parameter segment is represented as `{}`, so parameter naming and casing differences do not prevent SDK comparisons.

The package also exports `collectArmResourceData`, row types, and canonicalization helpers for automation that should consume typed data directly.
