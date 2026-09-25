import {
  getRelativePathFromDirectory,
  getSourceLocation,
  normalizePath,
  type DiagnosticTarget,
} from "@typespec/compiler";

export interface SourceReference {
  path: string;
  line: number;
  column: number;
  reference: string;
}

export interface SourceReferenceOptions {
  projectRoot: string;
  urlTemplate?: string;
  revision?: string;
}

export type SourceLinkResolver = (
  source: Omit<SourceReference, "reference">,
  options: SourceReferenceOptions,
) => string;

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export const defaultSourceLinkResolver: SourceLinkResolver = (source, options) => {
  if (!options.urlTemplate) {
    return `${source.path}#L${source.line}:${source.column}`;
  }

  return options.urlTemplate
    .replaceAll("{path}", encodePath(source.path))
    .replaceAll("{line}", String(source.line))
    .replaceAll("{column}", String(source.column))
    .replaceAll("{revision}", encodeURIComponent(options.revision ?? ""));
};

export function getSourceReference(
  target: DiagnosticTarget,
  options: SourceReferenceOptions,
  resolver: SourceLinkResolver = defaultSourceLinkResolver,
): SourceReference {
  const location = getSourceLocation(target, { locateId: true });
  const position = location.file.getLineAndCharacterOfPosition(location.pos);
  const path = normalizePath(
    getRelativePathFromDirectory(
      normalizePath(options.projectRoot),
      normalizePath(location.file.path),
      process.platform === "win32",
    ),
  );
  const source = {
    path,
    line: position.line + 1,
    column: position.character + 1,
  };
  return {
    ...source,
    reference: resolver(source, options),
  };
}
