import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "@azure-tools/typespec-data-exporter",
  diagnostics: {
    "export-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Data export failed: ${"message"}`,
      },
    },
  },
});

export const { reportDiagnostic, createDiagnostic } = $lib;
