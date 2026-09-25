import { describe, expect, it } from "vitest";
import { getArmDataSerializers, type ArmOperationRow, type ArmResourceRow } from "../src/index.js";

const resource: ArmResourceRow = {
  resourceKey: "microsoft.test/widgets|/widgets/{}",
  resourceType: "Microsoft.Test/widgets",
  resourceInstancePath: "/widgets/{widgetName}",
  resourceName: "Widget",
  resourceDefinition: "main.tsp#L1:1",
  bicepResource: true,
  readOperation: ["main.tsp#L2:1", "main.tsp#L3:1"],
  createOrUpdateOperation: ["main.tsp#L4:1"],
};

const operation: ArmOperationRow = {
  operationKey: "get|/widgets/{}",
  operationName: "get",
  operationVerb: "get",
  operationPath: "/widgets/{widgetName}",
  operationKind: "read",
  operationDefinition: "main.tsp#L2:1",
  resourceKey: resource.resourceKey,
  resourceType: resource.resourceType,
  resourceInstancePath: resource.resourceInstancePath,
  resourceName: resource.resourceName,
};

describe("ARM data serializers", () => {
  it("serializes all resource and operation CSV columns", () => {
    const serializers = getArmDataSerializers("csv");
    const resourceCsv = serializers.resources.serialize([resource]).content;
    const operationCsv = serializers.operations.serialize([operation]).content;
    expect(resourceCsv).toContain("main.tsp#L2:1;main.tsp#L3:1");
    expect(operationCsv).toContain("get|/widgets/{},get,get,/widgets/{widgetName},read");
  });

  it.each(["json", "yaml"] as const)("selects the %s serializers", (format) => {
    const serializers = getArmDataSerializers(format);
    expect(serializers.resources.format).toBe(format);
    expect(serializers.operations.format).toBe(format);
  });
});
