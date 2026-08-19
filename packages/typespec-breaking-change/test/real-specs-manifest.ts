export interface RealSpecCase {
  name: string;
  plane: "management" | "data";
  relativePath: string;
  serviceName: string;
  minimumVersions: number;
  minimumOperations: number;
  minimumLatestOperations?: number;
  minimumComparisons: number;
  expectedCanonicalizationError?: string;
  phaseABaseline?: boolean;
  timeoutMs: number;
}

export const realSpecCases: readonly RealSpecCase[] = [
  {
    name: "AppConfiguration",
    plane: "management",
    relativePath:
      "specification/appconfiguration/resource-manager/Microsoft.AppConfiguration/AppConfiguration",
    serviceName: "AppConfiguration",
    minimumVersions: 2,
    minimumOperations: 10,
    minimumComparisons: 0,
    phaseABaseline: true,
    timeoutMs: 120_000,
  },
  {
    name: "Network",
    plane: "management",
    relativePath: "specification/network/resource-manager/Microsoft.Network/Network/Network",
    serviceName: "Network",
    minimumVersions: 2,
    minimumOperations: 700,
    minimumComparisons: 1,
    timeoutMs: 180_000,
  },
  {
    name: "ContainerService Fleet",
    plane: "management",
    relativePath:
      "specification/containerservice/resource-manager/Microsoft.ContainerService/fleet",
    serviceName: "ContainerService",
    minimumVersions: 10,
    minimumOperations: 10,
    minimumLatestOperations: 35,
    minimumComparisons: 1,
    timeoutMs: 180_000,
  },
  {
    name: "Image Analysis",
    plane: "data",
    relativePath: "specification/ai/ImageAnalysis",
    serviceName: "ImageAnalysis",
    minimumVersions: 1,
    minimumOperations: 1,
    minimumComparisons: 0,
    timeoutMs: 120_000,
  },
  {
    name: "Batch",
    plane: "data",
    relativePath: "specification/batch/data-plane/Batch",
    serviceName: "Batch",
    minimumVersions: 1,
    minimumOperations: 10,
    minimumComparisons: 0,
    expectedCanonicalizationError: "Cannot read properties of undefined (reading 'get')",
    timeoutMs: 120_000,
  },
];
