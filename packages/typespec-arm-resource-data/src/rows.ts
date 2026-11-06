import {
  resolveArmResources,
  type ArmLifecycleOperationKind,
  type ArmResolvedOperationsForResource,
  type ArmResourceOperation,
  type Provider,
  type ResolvedResource,
} from "@azure-tools/typespec-azure-resource-manager";
import {
  getSourceReference,
  type SourceLinkResolver,
  type SourceReferenceOptions,
} from "@azure-tools/typespec-data-exporter";
import type { Program } from "@typespec/compiler";
import {
  createOperationKey,
  createResourceKey,
  formatResourceType,
  normalizeArmPath,
} from "./canonicalization.js";

export interface ArmResourceRow {
  resourceKey: string;
  resourceType: string;
  resourceInstancePath: string;
  resourceName: string;
  resourceDefinition: string;
  duplicateResourceError: boolean;
  duplicateResourceErrorAnalysis: string;
  bicepResource: boolean;
  readOperation: string[];
  createOrUpdateOperation: string[];
}

export type ExportedArmOperationKind = ArmLifecycleOperationKind | "list" | "action" | "unknown";

export interface ArmOperationRow {
  operationKey: string;
  operationName: string;
  operationVerb: string;
  operationPath: string;
  operationKind: ExportedArmOperationKind;
  operationDefinition: string;
  resourceKey: string;
  resourceType: string;
  resourceInstancePath: string;
  resourceName: string;
}

export interface ArmResourceDatasets {
  resources: ArmResourceRow[];
  operations: ArmOperationRow[];
}

export interface CollectArmResourceDataOptions extends SourceReferenceOptions {
  sourceLinkResolver?: SourceLinkResolver;
}

function operationLink(
  operation: ArmResourceOperation,
  options: CollectArmResourceDataOptions,
): string {
  return getSourceReference(operation.operation, options, options.sourceLinkResolver).reference;
}

function sortedLinks(
  operations: readonly ArmResourceOperation[] | undefined,
  options: CollectArmResourceDataOptions,
): string[] {
  return (operations ?? []).map((operation) => operationLink(operation, options)).sort();
}

function createOperationRow(
  resource: ResolvedResource,
  operation: ArmResourceOperation,
  operationKind: ExportedArmOperationKind,
  options: CollectArmResourceDataOptions,
): ArmOperationRow {
  const operationVerb = operation.httpOperation.verb;
  return {
    operationKey: createOperationKey(operationVerb, operation.path),
    operationName: operation.name,
    operationVerb,
    operationPath: operation.path,
    operationKind,
    operationDefinition: operationLink(operation, options),
    resourceKey: createResourceKey(resource.resourceType, resource.resourceInstancePath),
    resourceType: formatResourceType(resource.resourceType),
    resourceInstancePath: resource.resourceInstancePath,
    resourceName: resource.resourceName,
  };
}

function flattenOperations(
  resource: ResolvedResource,
  options: CollectArmResourceDataOptions,
): ArmOperationRow[] {
  const rows: ArmOperationRow[] = [];
  const lifecycle = resource.operations.lifecycle;
  for (const kind of [
    "read",
    "createOrUpdate",
    "update",
    "delete",
    "checkExistence",
  ] as const satisfies readonly (keyof ArmResolvedOperationsForResource["lifecycle"])[]) {
    for (const operation of lifecycle[kind] ?? []) {
      rows.push(createOperationRow(resource, operation, kind, options));
    }
  }
  for (const operation of resource.operations.lists) {
    rows.push(createOperationRow(resource, operation, "list", options));
  }
  for (const operation of resource.operations.actions) {
    rows.push(createOperationRow(resource, operation, "action", options));
  }
  for (const operation of resource.associatedOperations ?? []) {
    rows.push(createOperationRow(resource, operation, "unknown", options));
  }
  return rows;
}

function compareResources(left: ArmResourceRow, right: ArmResourceRow): number {
  return `${left.resourceName}|${left.resourceKey}`.localeCompare(
    `${right.resourceName}|${right.resourceKey}`,
  );
}

function compareOperations(left: ArmOperationRow, right: ArmOperationRow): number {
  return [left.resourceName, left.operationName, left.operationKey, left.operationKind]
    .join("|")
    .localeCompare(
      [right.resourceName, right.operationName, right.operationKey, right.operationKind].join("|"),
    );
}

function addDuplicateResourceErrors(resources: ArmResourceRow[]): void {
  const resourcesByPath = new Map<string, ArmResourceRow[]>();
  for (const resource of resources) {
    const normalizedPath = normalizeArmPath(resource.resourceInstancePath);
    const matchingResources = resourcesByPath.get(normalizedPath) ?? [];
    matchingResources.push(resource);
    resourcesByPath.set(normalizedPath, matchingResources);
  }

  for (const [normalizedPath, matchingResources] of resourcesByPath) {
    if (new Set(matchingResources.map((resource) => resource.resourceName)).size < 2) {
      continue;
    }

    const identities = [
      ...new Set(
        matchingResources.map(
          (resource) =>
            `${resource.resourceName} [${resource.resourceType}; ${resource.resourceDefinition}]`,
        ),
      ),
    ].sort();
    const analysis =
      `Normalized ARM resource instance path "${normalizedPath}" is shared by resources with ` +
      `distinct resourceName values: ${identities.join("; ")}.`;
    for (const resource of matchingResources) {
      resource.duplicateResourceError = true;
      resource.duplicateResourceErrorAnalysis = analysis;
    }
  }
}

export function collectArmResourceData(
  program: Program,
  options: CollectArmResourceDataOptions,
): ArmResourceDatasets {
  return collectResolvedArmResourceData(resolveArmResources(program), options);
}

export function collectResolvedArmResourceData(
  provider: Provider,
  options: CollectArmResourceDataOptions,
): ArmResourceDatasets {
  const resources = (provider.resources ?? []).map((resource): ArmResourceRow => {
    const readOperations = resource.operations.lifecycle.read ?? [];
    const createOperations = resource.operations.lifecycle.createOrUpdate ?? [];
    return {
      resourceKey: createResourceKey(resource.resourceType, resource.resourceInstancePath),
      resourceType: formatResourceType(resource.resourceType),
      resourceInstancePath: resource.resourceInstancePath,
      resourceName: resource.resourceName,
      resourceDefinition: getSourceReference(resource.type, options, options.sourceLinkResolver)
        .reference,
      duplicateResourceError: false,
      duplicateResourceErrorAnalysis: "",
      bicepResource: readOperations.length > 0 && createOperations.length > 0,
      readOperation: sortedLinks(readOperations, options),
      createOrUpdateOperation: sortedLinks(createOperations, options),
    };
  });
  const operations = (provider.resources ?? []).flatMap((resource) =>
    flattenOperations(resource, options),
  );
  addDuplicateResourceErrors(resources);
  resources.sort(compareResources);
  operations.sort(compareOperations);
  return { resources, operations };
}
