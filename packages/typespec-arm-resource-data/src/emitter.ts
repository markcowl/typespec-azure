import {
  createArtifact,
  defineDataExporter,
  runDataExporter,
} from "@azure-tools/typespec-data-exporter";
import type { EmitContext } from "@typespec/compiler";
import { normalizeOptions, type ArmResourceDataEmitterOptions } from "./options.js";
import { collectArmResourceData } from "./rows.js";
import { getArmDataSerializers } from "./serializers.js";

const exporter = defineDataExporter({
  normalizeOptions,
  buildArtifacts(
    context: EmitContext<ArmResourceDataEmitterOptions>,
    options: ReturnType<typeof normalizeOptions>,
  ) {
    const datasets = collectArmResourceData(context.program, {
      projectRoot: context.program.projectRoot,
      urlTemplate: options.sourceUrlTemplate,
      revision: options.sourceRevision,
    });
    const serializers = getArmDataSerializers(options.format);
    return [
      createArtifact({
        name: options.resourcesFile,
        value: datasets.resources,
        serializer: serializers.resources,
      }),
      createArtifact({
        name: options.operationsFile,
        value: datasets.operations,
        serializer: serializers.operations,
      }),
    ];
  },
});

export async function $onEmit(context: EmitContext<ArmResourceDataEmitterOptions>): Promise<void> {
  await runDataExporter(context, exporter);
}
