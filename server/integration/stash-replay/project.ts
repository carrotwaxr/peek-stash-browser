/**
 * Projects a library value onto a GraphQL selection set (sweep item 83):
 * the answer holds exactly the fields the request selected, in its shape.
 *
 * A selected field the library value lacks is a strict failure naming the
 * operation and the path (ReplayUnsupported.missingField); null stays null.
 * Peek's operations use plain fields only, so fragments, aliases, directives
 * and arguments below the root fail too, instead of being answered wrongly.
 */
import {
  type FieldNode,
  Kind,
  type SelectionNode,
  type SelectionSetNode,
} from "graphql";
import { ReplayUnsupported, isRecord } from "./library.js";

function join(path: string, name: string): string {
  return path === "" ? name : `${path}.${name}`;
}

/** The selection as a plain field, or ReplayUnsupported for any other form. */
export function selectedField(
  selection: SelectionNode,
  operation: string,
  path: string
): FieldNode {
  const unsupported = (what: string) =>
    ReplayUnsupported.notEvaluated(operation, what, "project.ts");
  if (selection.kind === Kind.FRAGMENT_SPREAD) {
    throw unsupported(`fragment ...${selection.name.value} at ${path}`);
  }
  if (selection.kind === Kind.INLINE_FRAGMENT) {
    throw unsupported(`an inline fragment at ${path}`);
  }
  const fieldPath = join(path, selection.name.value);
  if (selection.alias) {
    throw unsupported(`the alias ${selection.alias.value} at ${fieldPath}`);
  }
  const directive = selection.directives?.[0];
  if (directive) {
    throw unsupported(`the directive @${directive.name.value} at ${fieldPath}`);
  }
  return selection;
}

/** Merges two projections of the same field selected twice. */
function merge(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((item: unknown, index) => merge(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const merged: Record<string, unknown> = { ...a };
    for (const [key, value] of Object.entries(b)) {
      merged[key] = key in merged ? merge(merged[key], value) : value;
    }
    return merged;
  }
  return b;
}

/**
 * `value` with only the fields `selection` selects, through nested objects
 * and arrays. `path` names `value` in errors, such as findScenes, and grows
 * as findScenes.scenes[].files[].fingerprints.
 */
export function project(
  value: unknown,
  selection: SelectionSetNode,
  operation: string,
  path: string
): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) =>
      project(item, selection, operation, `${path}[]`)
    );
  }
  if (!isRecord(value)) {
    throw ReplayUnsupported.missingField(operation, `${path} as an object`);
  }
  const projected: Record<string, unknown> = {};
  for (const node of selection.selections) {
    const field = selectedField(node, operation, path);
    const name = field.name.value;
    const fieldPath = join(path, name);
    const argument = field.arguments?.[0];
    if (argument) {
      throw ReplayUnsupported.notEvaluated(
        operation,
        `${fieldPath}(${argument.name.value})`,
        "project.ts"
      );
    }
    const child = value[name];
    if (
      !Object.prototype.hasOwnProperty.call(value, name) ||
      child === undefined
    ) {
      throw ReplayUnsupported.missingField(operation, fieldPath);
    }
    const answer = field.selectionSet
      ? project(child, field.selectionSet, operation, fieldPath)
      : child;
    projected[name] =
      name in projected ? merge(projected[name], answer) : answer;
  }
  return projected;
}
