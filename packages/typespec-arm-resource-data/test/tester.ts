import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";

export const ArmTester = createTester(resolvePath(import.meta.dirname, ".."), {
  libraries: [
    "@typespec/http",
    "@typespec/openapi",
    "@typespec/rest",
    "@typespec/versioning",
    "@azure-tools/typespec-azure-core",
    "@azure-tools/typespec-azure-resource-manager",
    "@azure-tools/typespec-arm-resource-data",
  ],
})
  .importLibraries()
  .using("Http", "Rest", "Versioning", "Azure.Core", "Azure.ResourceManager");

export const ArmResourceDataTester = ArmTester.emit("@azure-tools/typespec-arm-resource-data", {});
