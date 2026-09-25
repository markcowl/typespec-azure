import { createSourceFile, type EmitContext, type Program } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import {
  createArtifact,
  createCsvSerializer,
  defaultSourceLinkResolver,
  defineDataExporter,
  getSourceReference,
  jsonSerializer,
  runDataExporter,
  yamlSerializer,
  type ArtifactSerializer,
} from "../src/index.js";

describe("serializers", () => {
  it("serializes fixed-schema CSV with escaping and sorting", () => {
    const serializer = createCsvSerializer<{ name: string; enabled: boolean }>({
      columns: [
        { header: "name", value: (row) => row.name },
        { header: "enabled", value: (row) => row.enabled },
      ],
      compare: (left, right) => left.name.localeCompare(right.name),
    });

    expect(
      serializer.serialize([
        { name: 'z,"quoted"', enabled: false },
        { name: "alpha", enabled: true },
      ]),
    ).toEqual({
      content: 'name,enabled\nalpha,true\n"z,""quoted""",false\n',
      extension: "csv",
      mediaType: "text/csv",
    });
  });

  it("serializes nullish values without a comparator", () => {
    const serializer = createCsvSerializer<{ empty?: string | null }>({
      columns: [{ header: "empty", value: (row) => row.empty }],
    });
    expect(serializer.serialize([{ empty: undefined }, { empty: null }]).content).toBe(
      "empty\n\n\n",
    );
  });

  it("preserves structured values in JSON and YAML", () => {
    const value = [{ enabled: true, links: ["one", "two"] }];
    expect(JSON.parse(jsonSerializer.serialize(value).content)).toEqual(value);
    expect(yamlSerializer.serialize(value)).toMatchObject({
      extension: "yaml",
      mediaType: "application/yaml",
    });
    expect(yamlSerializer.serialize(value).content).toContain("enabled: true");
  });

  it("accepts a custom serializer without toolkit registration", () => {
    const serializer: ArtifactSerializer<readonly number[]> = {
      format: "lines",
      serialize: (values) => ({
        content: `${values.join("\n")}\n`,
        extension: "txt",
        mediaType: "text/plain",
      }),
    };
    const artifact = createArtifact({ name: "values", value: [1, 2], serializer });
    expect(artifact.serialize()).toEqual({
      content: "1\n2\n",
      extension: "txt",
      mediaType: "text/plain",
    });
  });
});

describe("source references", () => {
  const file = createSourceFile("model Widget {}", "C:/repo/spec/main.tsp");
  const target = { file, pos: 6, end: 12 };

  it("creates a project-relative reference", () => {
    expect(getSourceReference(target, { projectRoot: "C:/repo" })).toEqual({
      path: "spec/main.tsp",
      line: 1,
      column: 7,
      reference: "spec/main.tsp#L1:7",
    });
  });

  it("expands an encoded URL template", () => {
    const options = {
      projectRoot: "C:/repo",
      revision: "feature branch",
      urlTemplate: "https://example.test/{revision}/{path}?line={line}&column={column}",
    };
    expect(getSourceReference(target, options).reference).toBe(
      "https://example.test/feature%20branch/spec/main.tsp?line=1&column=7",
    );
  });

  it("supports URL templates without a revision", () => {
    expect(
      getSourceReference(target, {
        projectRoot: "C:/repo",
        urlTemplate: "https://example.test/{revision}/{path}",
      }).reference,
    ).toBe("https://example.test//spec/main.tsp");
  });

  it("supports a custom source-link resolver", () => {
    expect(
      getSourceReference(target, { projectRoot: "C:/repo" }, (source) => `custom:${source.path}`)
        .reference,
    ).toBe("custom:spec/main.tsp");
    expect(
      defaultSourceLinkResolver(
        { path: "main.tsp", line: 1, column: 1 },
        { projectRoot: "C:/repo" },
      ),
    ).toBe("main.tsp#L1:1");
  });
});

describe("exporter runtime", () => {
  it("normalizes options, serializes artifacts, and emits files", async () => {
    const writes = new Map<string, string>();
    const program = {
      host: {
        mkdirp: async () => undefined,
        writeFile: async (path: string, content: string) => {
          writes.set(path, content);
        },
      },
    } as unknown as Program;
    const context = {
      program,
      emitterOutputDir: "C:/output",
      options: { prefix: "custom" },
    } as EmitContext<{ prefix?: string }>;
    const definition = defineDataExporter({
      normalizeOptions: (options: { prefix?: string } | undefined) => ({
        prefix: options?.prefix ?? "default",
      }),
      buildArtifacts: (_context, options) => [
        createArtifact({
          name: `${options.prefix}-rows`,
          value: [{ value: 1 }],
          serializer: jsonSerializer,
        }),
      ],
    });

    await runDataExporter(context, definition);

    expect(writes.get("C:/output/custom-rows.json")).toBe('[\n  {\n    "value": 1\n  }\n]\n');
  });

  it("normalizes a serializer extension with a leading dot", async () => {
    const writes = new Map<string, string>();
    const program = {
      host: {
        mkdirp: async () => undefined,
        writeFile: async (path: string, content: string) => void writes.set(path, content),
      },
    } as unknown as Program;
    const serializer: ArtifactSerializer<string> = {
      format: "text",
      serialize: (value) => ({ content: value, extension: ".txt", mediaType: "text/plain" }),
    };
    await runDataExporter(
      {
        program,
        emitterOutputDir: "C:/output",
        options: {},
      } as EmitContext<Record<string, never>>,
      defineDataExporter({
        normalizeOptions: () => undefined,
        buildArtifacts: () => [createArtifact({ name: "value", value: "ok", serializer })],
      }),
    );
    expect(writes.get("C:/output/value.txt")).toBe("ok");
  });

  it.each([new Error("broken"), "broken"])("reports exporter failures", async (failure) => {
    const diagnostics: unknown[] = [];
    const program = {
      reportDiagnostic: (diagnostic: unknown) => diagnostics.push(diagnostic),
      getGlobalNamespaceType: () => ({ kind: "Namespace" }),
      host: {},
    } as unknown as Program;
    await runDataExporter(
      {
        program,
        emitterOutputDir: "C:/output",
        options: {},
      } as EmitContext<Record<string, never>>,
      defineDataExporter({
        normalizeOptions: () => {
          throw failure;
        },
        buildArtifacts: () => [],
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "@azure-tools/typespec-data-exporter/export-failed",
      message: "Data export failed: broken",
    });
  });
});
