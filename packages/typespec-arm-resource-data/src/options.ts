import type { JSONSchemaType } from "@typespec/compiler";

export type ArmResourceDataFormat = "csv" | "json" | "yaml";

export interface ArmResourceDataEmitterOptions {
  format?: ArmResourceDataFormat;
  "resources-file"?: string;
  "operations-file"?: string;
  "source-url-template"?: string;
  "source-revision"?: string;
}

export interface NormalizedArmResourceDataEmitterOptions {
  format: ArmResourceDataFormat;
  resourcesFile: string;
  operationsFile: string;
  sourceUrlTemplate?: string;
  sourceRevision?: string;
}

export const emitterOptionsSchema: JSONSchemaType<ArmResourceDataEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    format: { type: "string", enum: ["csv", "json", "yaml"], nullable: true },
    "resources-file": { type: "string", nullable: true },
    "operations-file": { type: "string", nullable: true },
    "source-url-template": { type: "string", nullable: true },
    "source-revision": { type: "string", nullable: true },
  },
};

function normalizeStem(value: string | undefined, fallback: string): string {
  const stem = value?.trim();
  const normalized = stem && stem.length > 0 ? stem.replace(/\.(csv|json|ya?ml)$/i, "") : fallback;
  if (/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(normalized) || normalized.split(/[\\/]/).includes("..")) {
    throw new Error(`Output filename must be relative to the emitter output directory: ${stem}`);
  }
  return normalized;
}

export function normalizeOptions(
  options: ArmResourceDataEmitterOptions | undefined,
): NormalizedArmResourceDataEmitterOptions {
  const sourceUrlTemplate = options?.["source-url-template"]?.trim() || undefined;
  const sourceRevision = options?.["source-revision"]?.trim() || undefined;
  if (sourceUrlTemplate?.includes("{revision}") && sourceRevision === undefined) {
    throw new Error("source-revision is required when source-url-template contains {revision}");
  }
  return {
    format: options?.format ?? "csv",
    resourcesFile: normalizeStem(options?.["resources-file"], "resources"),
    operationsFile: normalizeStem(options?.["operations-file"], "operations"),
    sourceUrlTemplate,
    sourceRevision,
  };
}
