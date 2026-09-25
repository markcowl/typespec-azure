import { emitFile, resolvePath, type EmitContext } from "@typespec/compiler";
import { reportDiagnostic } from "./lib.js";

export interface SerializedArtifact {
  content: string;
  extension: string;
  mediaType: string;
}

export interface ArtifactSerializer<T> {
  readonly format: string;
  serialize(value: T): SerializedArtifact;
}

export interface PendingArtifact {
  readonly name: string;
  readonly serialize: () => SerializedArtifact;
}

export interface CreateArtifactOptions<T> {
  name: string;
  value: T;
  serializer: ArtifactSerializer<T>;
}

export function createArtifact<T>(options: CreateArtifactOptions<T>): PendingArtifact {
  return {
    name: options.name,
    serialize: () => options.serializer.serialize(options.value),
  };
}

export interface DataExporterDefinition<TOptions extends object, TNormalizedOptions> {
  normalizeOptions(options: TOptions | undefined): TNormalizedOptions;
  buildArtifacts(
    context: EmitContext<TOptions>,
    options: TNormalizedOptions,
  ): Promise<readonly PendingArtifact[]> | readonly PendingArtifact[];
}

export function defineDataExporter<TOptions extends object, TNormalizedOptions>(
  definition: DataExporterDefinition<TOptions, TNormalizedOptions>,
): DataExporterDefinition<TOptions, TNormalizedOptions> {
  return definition;
}

export async function runDataExporter<TOptions extends object, TNormalizedOptions>(
  context: EmitContext<TOptions>,
  definition: DataExporterDefinition<TOptions, TNormalizedOptions>,
): Promise<void> {
  try {
    const options = definition.normalizeOptions(context.options);
    const artifacts = await definition.buildArtifacts(context, options);
    const serializedArtifacts = artifacts.map((artifact) => ({
      name: artifact.name,
      serialized: artifact.serialize(),
    }));
    for (const artifact of serializedArtifacts) {
      const serialized = artifact.serialized;
      const path = resolvePath(
        context.emitterOutputDir,
        `${artifact.name}.${serialized.extension.replace(/^\./, "")}`,
      );
      await emitFile(context.program, {
        path,
        content: serialized.content,
      });
    }
  } catch (error) {
    reportDiagnostic(context.program, {
      code: "export-failed",
      target: context.program.getGlobalNamespaceType(),
      format: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
