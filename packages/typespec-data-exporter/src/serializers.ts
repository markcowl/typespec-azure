import { stringify as stringifyYaml } from "yaml";
import type { ArtifactSerializer, SerializedArtifact } from "./exporter.js";

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export interface CsvSerializerOptions<T> {
  columns: readonly CsvColumn<T>[];
  compare?: (left: T, right: T) => number;
}

function escapeCsvValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "boolean" ? String(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createCsvSerializer<T>(
  options: CsvSerializerOptions<T>,
): ArtifactSerializer<readonly T[]> {
  return {
    format: "csv",
    serialize(rows): SerializedArtifact {
      const orderedRows = options.compare ? [...rows].sort(options.compare) : rows;
      const lines = [
        options.columns.map((column) => escapeCsvValue(column.header)).join(","),
        ...orderedRows.map((row) =>
          options.columns.map((column) => escapeCsvValue(column.value(row))).join(","),
        ),
      ];
      return {
        content: `${lines.join("\n")}\n`,
        extension: "csv",
        mediaType: "text/csv",
      };
    },
  };
}

export const jsonSerializer: ArtifactSerializer<unknown> = {
  format: "json",
  serialize(value): SerializedArtifact {
    return {
      content: `${JSON.stringify(value, undefined, 2)}\n`,
      extension: "json",
      mediaType: "application/json",
    };
  },
};

export const yamlSerializer: ArtifactSerializer<unknown> = {
  format: "yaml",
  serialize(value): SerializedArtifact {
    return {
      content: stringifyYaml(value, { lineWidth: 0 }),
      extension: "yaml",
      mediaType: "application/yaml",
    };
  },
};
