import {
  createCsvSerializer,
  jsonSerializer,
  yamlSerializer,
  type ArtifactSerializer,
} from "@azure-tools/typespec-data-exporter";
import type { ArmResourceDataFormat } from "./options.js";
import type { ArmOperationRow, ArmResourceRow } from "./rows.js";

const resourceCsvSerializer = createCsvSerializer<ArmResourceRow>({
  columns: [
    { header: "resourceKey", value: (row) => row.resourceKey },
    { header: "resourceType", value: (row) => row.resourceType },
    { header: "resourceInstancePath", value: (row) => row.resourceInstancePath },
    { header: "resourceName", value: (row) => row.resourceName },
    { header: "resourceDefinition", value: (row) => row.resourceDefinition },
    { header: "bicepResource", value: (row) => row.bicepResource },
    { header: "readOperation", value: (row) => row.readOperation.join(";") },
    {
      header: "createOrUpdateOperation",
      value: (row) => row.createOrUpdateOperation.join(";"),
    },
  ],
});

const operationCsvSerializer = createCsvSerializer<ArmOperationRow>({
  columns: [
    { header: "operationKey", value: (row) => row.operationKey },
    { header: "operationName", value: (row) => row.operationName },
    { header: "operationVerb", value: (row) => row.operationVerb },
    { header: "operationPath", value: (row) => row.operationPath },
    { header: "operationKind", value: (row) => row.operationKind },
    { header: "operationDefinition", value: (row) => row.operationDefinition },
    { header: "resourceKey", value: (row) => row.resourceKey },
    { header: "resourceType", value: (row) => row.resourceType },
    { header: "resourceInstancePath", value: (row) => row.resourceInstancePath },
    { header: "resourceName", value: (row) => row.resourceName },
  ],
});

export interface ArmDataSerializers {
  resources: ArtifactSerializer<readonly ArmResourceRow[]>;
  operations: ArtifactSerializer<readonly ArmOperationRow[]>;
}

export function getArmDataSerializers(format: ArmResourceDataFormat): ArmDataSerializers {
  switch (format) {
    case "csv":
      return { resources: resourceCsvSerializer, operations: operationCsvSerializer };
    case "json":
      return { resources: jsonSerializer, operations: jsonSerializer };
    case "yaml":
      return { resources: yamlSerializer, operations: yamlSerializer };
  }
}
