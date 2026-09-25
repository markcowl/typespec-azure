import type { EmitContext } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  $onEmit,
  type ArmOperationRow,
  type ArmResourceDataEmitterOptions,
  type ArmResourceRow,
} from "../src/index.js";
import { ArmResourceDataTester, ArmTester } from "./tester.js";

const armSpec = `
  @armProviderNamespace
  namespace Microsoft.Test;

  model WidgetProperties {
    size?: int32;
  }

  model Widget is TrackedResource<WidgetProperties> {
    @key("widgetName")
    @segment("widgets")
    @path
    name: string;
  }

  @armResourceOperations
  interface Widgets extends TrackedResourceOperations<Widget, WidgetProperties> {
    listBySubscription is ArmListBySubscription<Widget>;
  }
`;

async function emit(format: "csv" | "json" | "yaml" = "csv", code = armSpec) {
  return ArmResourceDataTester.compileAndDiagnose(code, {
    compilerOptions: {
      options: {
        "@azure-tools/typespec-arm-resource-data": {
          format,
          "source-url-template": "https://example.test/{revision}/{path}#L{line}",
          "source-revision": "abc123",
        },
      },
    },
  });
}

describe("ARM template emitter", () => {
  it("emits complete CSV datasets by default", async () => {
    const [{ outputs }, diagnostics] = await emit();
    expect(diagnostics).toEqual([]);
    expect(Object.keys(outputs).sort()).toEqual(["operations.csv", "resources.csv"]);
    expect(outputs["resources.csv"]).toContain(
      "resourceKey,resourceType,resourceInstancePath,resourceName,resourceDefinition,bicepResource,readOperation,createOrUpdateOperation",
    );
    expect(outputs["resources.csv"]).toContain("microsoft.test/widgets|/subscriptions/{}/");
    expect(outputs["resources.csv"]).toContain(",true,");
    expect(outputs["operations.csv"]).toContain("operationKey,operationName,operationVerb");
    expect(outputs["operations.csv"]).toContain("get|/subscriptions/{}/");
  });

  it("emits equivalent JSON datasets with native booleans and arrays", async () => {
    const [{ outputs }, diagnostics] = await emit("json");
    expect(diagnostics).toEqual([]);
    const resources = JSON.parse(outputs["resources.json"]) as ArmResourceRow[];
    const operations = JSON.parse(outputs["operations.json"]) as ArmOperationRow[];
    expect(resources[0].bicepResource).toBe(true);
    expect(resources[0].readOperation).toHaveLength(1);
    expect(operations.some((row) => row.operationKind === "list")).toBe(true);
  });

  it("emits equivalent YAML datasets", async () => {
    const [{ outputs }, diagnostics] = await emit("yaml");
    expect(diagnostics).toEqual([]);
    const resources = parseYaml(outputs["resources.yaml"]) as ArmResourceRow[];
    const operations = parseYaml(outputs["operations.yaml"]) as ArmOperationRow[];
    expect(resources[0].resourceKey).toContain("microsoft.test/widgets|");
    expect(operations.map((row) => row.operationKind)).toContain("createOrUpdate");
  });

  it("runs the source emitter entry point directly", async () => {
    const { program } = await ArmTester.compile(armSpec);
    await $onEmit({
      program,
      emitterOutputDir: "tsp-output",
      options: {
        format: "json",
        "resources-file": "custom-resources.json",
        "operations-file": "custom-operations.json",
      },
    } as EmitContext<ArmResourceDataEmitterOptions>);
    expect(program.diagnostics).toEqual([]);
  });

  it("supports tracked, proxy child, extension, and singleton ARM templates", async () => {
    const [{ outputs }, diagnostics] = await emit(
      "json",
      `
        @armProviderNamespace
        namespace Microsoft.Test;

        model ParentProperties {}
        model Parent is TrackedResource<ParentProperties> {
          @key("parentName") @segment("parents") @path name: string;
        }
        @armResourceOperations
        interface Parents extends TrackedResourceOperations<Parent, ParentProperties> {}

        model ChildProperties {}
        @parentResource(Parent)
        model Child is ProxyResource<ChildProperties> {
          @key("childName") @segment("children") @path name: string;
        }
        @armResourceOperations
        interface Children extends ProxyResourceOperations<Child> {}

        model ExtensionProperties {}
        model Extension is ExtensionResource<ExtensionProperties> {
          @key("extensionName") @segment("extensions") @path name: string;
        }
        @armResourceOperations
        interface Extensions extends ExtensionResourceOperations<Extension, ExtensionProperties> {}

        model SettingsProperties {}
        @singleton("default")
        model Settings is ProxyResource<SettingsProperties> {
          ...ResourceNameParameter<Settings>;
        }
        @armResourceOperations
        interface SettingsOperations extends ProxyResourceOperations<Settings> {}
      `,
    );
    expect(diagnostics).toEqual([]);
    const resources = JSON.parse(outputs["resources.json"]) as ArmResourceRow[];
    expect(resources.map((resource) => resource.resourceName).sort()).toEqual([
      "Child",
      "Extension",
      "Parent",
      "Settings",
    ]);
    expect(resources.every((resource) => resource.bicepResource)).toBe(true);
  });
});
