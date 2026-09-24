/**
 * The fields Peek's Stash queries select, merged per entity type (sweep
 * item 83), for the replay fixture: the generator gives every merged field
 * a synthetic value, and the recorder asks Stash for each of them.
 *
 * Every query operation in server/graphql/operations counts; mutations do
 * not. A list root (findScenes, ...) contributes the selection under its
 * list key, a single root (findGroup, findGallery) its own selection, so
 * FindScenes, FindScenesCompact and FindSceneIDs merge into one scene
 * selection. Each merged field keeps the operations that select it, for the
 * generator's error messages.
 */
import { readFileSync, readdirSync } from "fs";
import {
  Kind,
  type OperationDefinitionNode,
  OperationTypeNode,
  type SelectionSetNode,
  parse,
  print,
} from "graphql";
import path from "path";
import { fileURLToPath } from "url";
import {
  ENTITY_TYPES,
  type EntityType,
  LIST_ROOTS,
  SINGLE_ROOTS,
} from "./library.js";
import { selectedField } from "./project.js";

export interface SelectedField {
  /** The operations that select the field, sorted. */
  operations: string[];
  /** Its arguments as printed, "" for none; operations must agree. */
  arguments: string;
  /** The sub-selection of an object field. */
  fields?: SelectionTree;
}

export type SelectionTree = Record<string, SelectedField>;

export interface Selections {
  /** Per entity type, everything its list and single queries select. */
  entities: Record<EntityType, SelectionTree>;
  /** The Version and Configuration answers. */
  stash: { version: SelectionTree; configuration: SelectionTree };
}

/**
 * A field of one entity type that refers to entities of another. `via`
 * names the key that holds the entity in a list of links, such as a
 * scene's groups ({ scene_index, group }); the other keys are link fields.
 */
export interface Relation {
  target: EntityType;
  many: boolean;
  via?: string;
}

const one = (target: EntityType): Relation => ({ target, many: false });
const many = (target: EntityType): Relation => ({ target, many: true });
const links = (target: EntityType, via: string): Relation => ({
  target,
  many: true,
  via,
});

/** The entity references Peek's queries select, per entity type. */
export const RELATIONS: Record<EntityType, Record<string, Relation>> = {
  scene: {
    studio: one("studio"),
    performers: many("performer"),
    tags: many("tag"),
    galleries: many("gallery"),
    groups: links("group", "group"),
  },
  performer: { tags: many("tag") },
  studio: {
    parent_studio: one("studio"),
    child_studios: many("studio"),
    groups: many("group"),
    movies: many("group"),
    tags: many("tag"),
  },
  tag: { parents: many("tag"), children: many("tag") },
  group: {
    studio: one("studio"),
    tags: many("tag"),
    containing_groups: links("group", "group"),
    sub_groups: links("group", "group"),
  },
  gallery: {
    studio: one("studio"),
    performers: many("performer"),
    tags: many("tag"),
    scenes: many("scene"),
    cover: one("image"),
  },
  image: {
    galleries: many("gallery"),
    studio: one("studio"),
    tags: many("tag"),
    performers: many("performer"),
  },
  clip: { scene: one("scene"), primary_tag: one("tag"), tags: many("tag") },
};

export const OPERATIONS_DIR = fileURLToPath(
  new URL("../../graphql/operations/", import.meta.url)
);

function emptyEntities(): Record<EntityType, SelectionTree> {
  return {
    scene: {},
    performer: {},
    studio: {},
    tag: {},
    group: {},
    gallery: {},
    image: {},
    clip: {},
  };
}

function printedArguments(field: ReturnType<typeof selectedField>): string {
  const args = field.arguments ?? [];
  return args.length === 0 ? "" : `(${args.map(print).join(", ")})`;
}

/** Merges one operation's selection into `tree`; `where` names it in errors. */
function mergeInto(
  tree: SelectionTree,
  selectionSet: SelectionSetNode,
  operation: string,
  where: string
): void {
  for (const selection of selectionSet.selections) {
    const field = selectedField(selection, operation, where);
    const name = field.name.value;
    const fieldPath = `${where}.${name}`;
    const args = printedArguments(field);
    let merged = tree[name];
    if (merged === undefined) {
      merged = { operations: [], arguments: args };
      tree[name] = merged;
    } else if (merged.arguments !== args) {
      throw new Error(
        `selections: conflicting arguments for ${fieldPath}: ${merged.operations.join(", ")} selects ${name}${merged.arguments}, ${operation} selects ${name}${args}`
      );
    }
    if (!merged.operations.includes(operation)) {
      merged.operations = [...merged.operations, operation].sort();
    }
    if (field.selectionSet !== undefined) {
      merged.fields ??= {};
      mergeInto(merged.fields, field.selectionSet, operation, fieldPath);
    }
  }
}

function mergeOperation(
  selections: Selections,
  operation: OperationDefinitionNode
): void {
  const name = operation.name?.value ?? "(anonymous operation)";
  for (const selection of operation.selectionSet.selections) {
    const root = selectedField(selection, name, "");
    const rootName = root.name.value;
    const rootSelection = root.selectionSet;
    if (rootSelection === undefined) continue;
    if (rootName === "version" || rootName === "configuration") {
      mergeInto(selections.stash[rootName], rootSelection, name, rootName);
      continue;
    }
    const single = SINGLE_ROOTS[rootName];
    if (single !== undefined) {
      mergeInto(selections.entities[single], rootSelection, name, single);
      continue;
    }
    const list = LIST_ROOTS[rootName];
    if (list === undefined) {
      throw new Error(
        `selections: ${name} queries ${rootName}, which the replay does not answer; teach server/integration/stash-replay/library.ts`
      );
    }
    const [type, listKey] = list;
    for (const part of rootSelection.selections) {
      const field = selectedField(part, name, rootName);
      if (field.name.value === listKey && field.selectionSet !== undefined) {
        mergeInto(selections.entities[type], field.selectionSet, name, type);
      }
    }
  }
}

/** The merged selections of the query operations in `documents`. */
export function mergeSelections(documents: string[]): Selections {
  const selections: Selections = {
    entities: emptyEntities(),
    stash: { version: {}, configuration: {} },
  };
  for (const document of documents) {
    for (const definition of parse(document).definitions) {
      if (
        definition.kind === Kind.OPERATION_DEFINITION &&
        definition.operation === OperationTypeNode.QUERY
      ) {
        mergeOperation(selections, definition);
      }
    }
  }
  return selections;
}

/** The merged selections of every .graphql file in `dir`, in name order. */
export function loadSelections(dir: string = OPERATIONS_DIR): Selections {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".graphql"))
    .sort();
  return mergeSelections(
    files.map((file) => readFileSync(path.join(dir, file), "utf8"))
  );
}

/** Adds the leaf paths of a non-entity object's selection under `prefix`. */
function objectLeaves(
  tree: SelectionTree,
  prefix: string,
  out: Set<string>
): void {
  for (const [name, field] of Object.entries(tree)) {
    const leaf = `${prefix}.${name}`;
    if (field.fields === undefined) out.add(leaf);
    else objectLeaves(field.fields, leaf, out);
  }
}

/**
 * Every field path each entity type is selected with, wherever it is
 * selected (top level or as a reference): scalars ("title"), leaves of
 * non-entity objects ("paths.screenshot", "files.fingerprints.type"),
 * relation names ("studio") and link fields ("groups.scene_index"). This is
 * what fixtures:record asks Stash for, and what shape.json's `fields` lists.
 */
export function fieldPaths(
  selections: Selections
): Record<EntityType, string[]> {
  const found: Record<EntityType, Set<string>> = {
    scene: new Set(),
    performer: new Set(),
    studio: new Set(),
    tag: new Set(),
    group: new Set(),
    gallery: new Set(),
    image: new Set(),
    clip: new Set(),
  };
  const visit = (type: EntityType, tree: SelectionTree): void => {
    for (const [name, field] of Object.entries(tree)) {
      const relation = RELATIONS[type][name];
      if (relation === undefined) {
        if (field.fields === undefined) found[type].add(name);
        else objectLeaves(field.fields, name, found[type]);
        continue;
      }
      found[type].add(name);
      const sub = field.fields ?? {};
      if (relation.via === undefined) {
        visit(relation.target, sub);
        continue;
      }
      for (const [linkName, linkField] of Object.entries(sub)) {
        if (linkName === relation.via) {
          visit(relation.target, linkField.fields ?? {});
        } else {
          found[type].add(`${name}.${linkName}`);
        }
      }
    }
  };
  for (const type of ENTITY_TYPES) {
    visit(type, selections.entities[type]);
  }
  return {
    scene: [...found.scene].sort(),
    performer: [...found.performer].sort(),
    studio: [...found.studio].sort(),
    tag: [...found.tag].sort(),
    group: [...found.group].sort(),
    gallery: [...found.gallery].sort(),
    image: [...found.image].sort(),
    clip: [...found.clip].sort(),
  };
}
