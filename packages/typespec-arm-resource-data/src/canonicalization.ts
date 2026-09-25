import type { ResourceType } from "@azure-tools/typespec-azure-resource-manager";

export function normalizeArmPath(path: string): string {
  return path
    .split("/")
    .map((segment) => (/^\{[^}]+\}$/.test(segment) ? "{}" : segment.toLowerCase()))
    .join("/");
}

export function formatResourceType(resourceType: ResourceType): string {
  return [resourceType.provider, ...resourceType.types].join("/");
}

export function normalizeResourceType(resourceType: ResourceType): string {
  return formatResourceType(resourceType).toLowerCase();
}

export function createResourceKey(
  resourceType: ResourceType,
  resourceInstancePath: string,
): string {
  return `${normalizeResourceType(resourceType)}|${normalizeArmPath(resourceInstancePath)}`;
}

export function createOperationKey(verb: string, path: string): string {
  return `${verb.toLowerCase()}|${normalizeArmPath(path)}`;
}
