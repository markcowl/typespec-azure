import { createTypeSpecLibrary } from "@typespec/compiler";
import { emitterOptionsSchema } from "./options.js";

export const $lib = createTypeSpecLibrary({
  name: "@azure-tools/typespec-arm-resource-data",
  diagnostics: {},
  emitter: {
    options: emitterOptionsSchema,
  },
});
