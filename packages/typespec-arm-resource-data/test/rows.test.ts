import type {
  ArmResourceOperation,
  Provider,
  ResolvedResource,
} from "@azure-tools/typespec-azure-resource-manager";
import { createSourceFile, type Model, type Operation } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { collectResolvedArmResourceData } from "../src/index.js";

function sourceTarget(text: string, name: string): Model {
  const file = createSourceFile(text, "C:/repo/main.tsp");
  const pos = text.indexOf(name);
  return { file, pos, end: pos + name.length } as unknown as Model;
}

function operation(
  name: string,
  verb: string,
  path: string,
  kind: ArmResourceOperation["kind"],
): ArmResourceOperation {
  return {
    name,
    kind,
    path,
    operationGroup: "Widgets",
    resourceModelName: "Widget",
    operation: sourceTarget(`op ${name}(): void;`, name) as unknown as Operation,
    httpOperation: { verb } as ArmResourceOperation["httpOperation"],
  };
}

function resource(): ResolvedResource {
  const read = operation(
    "get",
    "get",
    "/Subscriptions/{subscriptionId}/providers/Microsoft.Test/Widgets/{widgetName}",
    "read",
  );
  const create = operation(
    "create",
    "put",
    "/subscriptions/{sub}/providers/microsoft.test/widgets/{name}",
    "createOrUpdate",
  );
  return {
    type: sourceTarget("model Widget {}", "Widget"),
    kind: "Tracked",
    providerNamespace: "Microsoft.Test",
    resourceName: "Widget",
    resourceType: { provider: "Microsoft.Test", types: ["Widgets"] },
    resourceInstancePath:
      "/subscriptions/{subscriptionId}/providers/Microsoft.Test/Widgets/{widgetName}",
    operations: {
      lifecycle: { read: [read], createOrUpdate: [create] },
      lists: [
        operation(
          "list",
          "get",
          "/subscriptions/{subscriptionId}/providers/Microsoft.Test/Widgets",
          "list",
        ),
      ],
      actions: [
        operation(
          "restart",
          "post",
          "/subscriptions/{subscriptionId}/providers/Microsoft.Test/Widgets/{widgetName}/Restart",
          "action",
        ),
      ],
    },
    associatedOperations: [
      operation(
        "export",
        "post",
        "/subscriptions/{subscriptionId}/providers/Microsoft.Test/Widgets/{widgetName}/Export",
        "other",
      ),
    ],
  };
}

describe("ARM resource row collection", () => {
  it("flattens lifecycle, list, action, and associated operations", () => {
    const datasets = collectResolvedArmResourceData(
      { resources: [resource()] } satisfies Provider,
      { projectRoot: "C:/repo" },
    );

    expect(datasets.resources).toHaveLength(1);
    expect(datasets.resources[0]).toMatchObject({
      resourceKey: "microsoft.test/widgets|/subscriptions/{}/providers/microsoft.test/widgets/{}",
      resourceType: "Microsoft.Test/Widgets",
      bicepResource: true,
    });
    expect(datasets.resources[0].readOperation).toEqual(["main.tsp#L1:4"]);
    expect(datasets.operations.map((row) => row.operationKind).sort()).toEqual([
      "action",
      "createOrUpdate",
      "list",
      "read",
      "unknown",
    ]);
    expect(datasets.operations.find((row) => row.operationName === "export")).toMatchObject({
      operationKey: "post|/subscriptions/{}/providers/microsoft.test/widgets/{}/export",
      operationKind: "unknown",
    });
  });

  it("marks a resource without both lifecycle operations as non-Bicep", () => {
    const value = resource();
    value.operations.lifecycle.read = undefined;
    value.associatedOperations = undefined;
    const datasets = collectResolvedArmResourceData(
      { resources: [value] },
      {
        projectRoot: "C:/repo",
        sourceLinkResolver: (source) => `source:${source.line}:${source.column}`,
      },
    );

    expect(datasets.resources[0].bicepResource).toBe(false);
    expect(datasets.resources[0].resourceDefinition).toBe("source:1:7");
  });

  it("returns empty datasets for an empty provider", () => {
    expect(collectResolvedArmResourceData({}, { projectRoot: "C:/repo" })).toEqual({
      resources: [],
      operations: [],
    });
  });
});
