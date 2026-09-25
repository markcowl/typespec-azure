import { describe, expect, it } from "vitest";
import {
  createOperationKey,
  createResourceKey,
  formatResourceType,
  normalizeArmPath,
  normalizeOptions,
} from "../src/index.js";

describe("ARM canonicalization", () => {
  const resourceType = {
    provider: "Microsoft.Example",
    types: ["Widgets", "Extensions"],
  };

  it("formats the display resource type without changing casing", () => {
    expect(formatResourceType(resourceType)).toBe("Microsoft.Example/Widgets/Extensions");
  });

  it("normalizes literal casing and path parameter names", () => {
    expect(normalizeArmPath("/Subscriptions/{subscriptionId}/Widgets/{widgetName}")).toBe(
      "/subscriptions/{}/widgets/{}",
    );
    expect(
      createResourceKey(resourceType, "/Subscriptions/{sub}/Widgets/{name}/Extensions/{ext}"),
    ).toBe("microsoft.example/widgets/extensions|/subscriptions/{}/widgets/{}/extensions/{}");
    expect(createOperationKey("GET", "/Widgets/{widgetName}/DoThing")).toBe(
      "get|/widgets/{}/dothing",
    );
  });
});

describe("emitter options", () => {
  it("defaults to CSV and standard file stems", () => {
    expect(normalizeOptions(undefined)).toEqual({
      format: "csv",
      resourcesFile: "resources",
      operationsFile: "operations",
      sourceUrlTemplate: undefined,
      sourceRevision: undefined,
    });
  });

  it("trims values and removes supported extensions", () => {
    expect(
      normalizeOptions({
        format: "yaml",
        "resources-file": " custom-resources.JSON ",
        "operations-file": "custom-operations.yml",
        "source-url-template": " https://example/{path} ",
        "source-revision": " main ",
      }),
    ).toEqual({
      format: "yaml",
      resourcesFile: "custom-resources",
      operationsFile: "custom-operations",
      sourceUrlTemplate: "https://example/{path}",
      sourceRevision: "main",
    });
  });

  it.each(["../resources", "/resources", "C:\\resources"])(
    "rejects output paths outside the emitter directory",
    (value) => {
      expect(() => normalizeOptions({ "resources-file": value })).toThrow(
        "Output filename must be relative",
      );
    },
  );

  it("requires a revision when the URL template uses it", () => {
    expect(() =>
      normalizeOptions({ "source-url-template": "https://example/{revision}/{path}" }),
    ).toThrow("source-revision is required");
  });
});
