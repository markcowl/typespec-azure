import "./index.js";
import { reportDiagnostic } from "./lib.js";

import { isErrorModel, Model, ModelProperty, Operation, Program } from "@typespec/compiler";
import { getHttpOperation, HttpOperation, isStatusCode } from "@typespec/http";

/**
 * Filter the model properties of a model, using the given predicate
 * @param model The model to filter
 * @parm predicate The predicate function used to filter model properties
 * @returns a list of filtered properties, it will have length 0 if no properties
 * match the filter.
 */
export function filterModelProperties(
  model: Model,
  predicate: (prop: ModelProperty) => boolean
): ModelProperty[] {
  return [...getAllProperties(model).values()].filter(predicate);
}

/**
 * Filter operation responses using a predicate
 * @param operation The operation containign the response models to filter
 * @param predicate A predicate function to apply to each response model
 * @returns A list of models matching the predicate, or undefined if there are none
 */
export function filterResponseModels(
  operation: HttpOperation,
  predicate: (model: Model) => boolean
): Model[] | undefined {
  const models: Model[] = [];
  for (const response of operation.responses) {
    switch (response.type.kind) {
      case "Model":
        if (predicate(response.type)) models.push(response.type);
        break;
      case "Union":
        for (const variant of response.type.variants.values()) {
          if (variant.type.kind === "Model" && predicate(variant.type)) models.push(variant.type);
        }
        break;
      case "Tuple":
        for (const type of response.type.values) {
          if (type.kind === "Model" && predicate(type)) models.push(type);
        }
    }
  }
  return models.length > 0 ? models : undefined;
}

/**
 * Get the Http metadata for this operation
 * @param program The program being processed
 * @param operation The operation to get http metadata for
 * @returns An HttpOperation with http metadata.  May emit error diagnostics.
 */
export function getHttpMetadata(program: Program, operation: Operation): HttpOperation {
  const [httpOperation, diagnostics] = getHttpOperation(program, operation);
  if (diagnostics && diagnostics.length > 0) {
    program.reportDiagnostics(diagnostics);
  }

  return httpOperation;
}

/**
 * Get the main success response from an operation
 * @param program Get success responses for an operation
 * @param operation The operation to process
 * @returns A model, if there is a 2xx response, or nothing otherwise
 */
export function getOperationResponse(program: Program, operation: Operation): Model | undefined {
  const response = getSuccessResponse(program, getHttpMetadata(program, operation));
  if (response === undefined) {
    reportDiagnostic(program, { code: "expected-success-response", target: operation });
  }

  return response!;
}

/**
 * Return the first response model that has any properties matching the given model property predicate
 * @param program The program being processed
 * @param operation The operation to retrieve matching response from
 * @param predicate The predicate function to apply to each model property of the responses
 * @returns The model and matching model property, or nothing if no matching models are found
 */
export function getResultModelWithProperty(
  program: Program,
  operation: Operation,
  predicate: (prop: ModelProperty) => boolean
): [Model, ModelProperty] | undefined {
  const httpOperation = getHttpMetadata(program, operation);

  const models = filterResponseModels(
    httpOperation,
    (model) => filterModelProperties(model, predicate).length > 0
  );
  if (models === undefined || models.length < 1) return undefined;
  const properties = [...models[0].properties.values()].filter(predicate);
  if (properties.length < 1) return undefined;
  return [models[0], properties[0]];
}

/**
 * Get the first success response of an operation
 * @param program The program being processed
 * @param operation The operation to process
 * @returns The first success response, or nothing, if no matching models are found
 */
export function getSuccessResponse(program: Program, operation: HttpOperation): Model | undefined {
  const candidates = filterResponseModels(
    operation,
    (response) => !isErrorModel(program, response)
  )?.filter((m) => {
    const prop = getStatusCodeProperty(program, m);
    return (
      prop === undefined ||
      (prop.type?.kind === "String" && prop.type.value?.startsWith("2")) ||
      (prop.type?.kind === "Number" && prop.type.value >= 200 && prop.type.value < 300)
    );
  });

  if (candidates === undefined || candidates.length < 1) return undefined;
  return candidates[0];
}

/**
 *
 * @param program The probgram being processed
 * @param model The model to check for status code properties
 * @returns The property that represents an http status code, or nothing if there is none.
 */
function getStatusCodeProperty(program: Program, model: Model): ModelProperty | undefined {
  const properties = filterModelProperties(model, (prop) => isStatusCode(program, prop));
  return properties.length > 0 ? properties[0] : undefined;
}

/**
 *
 * @param model The model to process
 * @param collection The set of ModelProperties found so far
 * @returns The full set of model properties found in a model and all ancestors
 */
export function getAllProperties(
  model: Model,
  collection?: Map<string, ModelProperty>
): Map<string, ModelProperty> {
  const outCollection: Map<string, ModelProperty> = collection ?? new Map<string, ModelProperty>();
  for (const [name, value] of model.properties.entries()) {
    outCollection.set(name, value);
  }
  if (model.baseModel) return getAllProperties(model.baseModel, outCollection);
  return outCollection;
}
