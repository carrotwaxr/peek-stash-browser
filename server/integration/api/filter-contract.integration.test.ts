/**
 * The filter contract, walked from the client (item 38, FILTERS-28).
 *
 * For every list, every filter panel option the client declares (section
 * headers aside), every modifier it offers and a sample per kind of value
 * (`helpers/clientFilterConfig.ts`): the panel state goes through the
 * client's own `build*Filter`, then the parser in reject mode, which must
 * accept it, then the list's query builder under the statement recorder.
 * The page statement must differ from the unfiltered one; a modifier's from
 * every other modifier's on the same value (INCLUDES and INCLUDES_ALL may
 * agree on one id); a sample with sub-items from the same sample without
 * them. Every sort option must parse, and its ORDER BY must differ from the
 * builder's fallback sort, which a key with no expression gets. Clips go
 * through `buildClipFilter` into the body `ClipSearch` posts
 * (`clip_filter`), the same parser and the clip builder.
 *
 * A new option or sort is walked by construction. KNOWN_GAPS names the cases
 * that fail at this commit, each with why; each must still fail, so closing
 * a gap without deleting its entry fails too, with the SQL diff. The walk
 * reads the replay library and writes nothing.
 */
import {
  DEFAULT_SORT,
  FILTER_BODY_KEYS,
  LIST_KINDS,
  type ListKind,
} from "@peek/shared-types/filters/index.js";
import { makeEntityRef } from "@peek/shared-types/instanceAwareId.js";
import { beforeAll, describe, expect, it } from "vitest";
import { ValidationError } from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { must } from "../../tests/helpers/must.js";
import { parseListRequest } from "../../utils/listRequest.js";
import { parseJsonArray } from "../../utils/sqlHelpers.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  type ClientFilterConfig,
  type ClientList,
  type ClientOption,
  type OptionSample,
  type PanelState,
  type RefPair,
  type RefPool,
  clientList,
  loadClientFilterConfig,
  optionSamples,
} from "../helpers/clientFilterConfig.js";
import { recordStatements } from "../helpers/statementRecorder.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * The cases failing at this commit: `"<list> filter <option>: <sample>"` or
 * `"<list> sort <value>"`, each with why. Empty since B12.
 */
const KNOWN_GAPS: Readonly<Record<string, string>> = {};

const PER_PAGE = 24;
/** The client sends the random sort with an 8-digit seed (`SearchControls`) */
const RANDOM_SORT = "random_12345678";
const WALK_TIMEOUT_MS = 180_000;

/**
 * The key each builder orders by when the request's key has no expression
 * (`EntitySpec.defaultSort`): a sort whose ORDER BY equals it never reached
 * the sort map.
 */
const FALLBACK_SORT: Readonly<Record<ListKind, string>> = {
  scene: sceneQueryBuilder["spec"].defaultSort,
  performer: performerQueryBuilder["spec"].defaultSort,
  studio: studioQueryBuilder["spec"].defaultSort,
  tag: tagQueryBuilder["spec"].defaultSort,
  group: groupQueryBuilder["spec"].defaultSort,
  gallery: galleryQueryBuilder["spec"].defaultSort,
  image: imageQueryBuilder["spec"].defaultSort,
  clip: clipQueryBuilder["spec"].defaultSort,
};

/**
 * The panel state a sort is offered with: the client lists Scene Number only
 * beside a collection filter (`SearchControls`), as the collection page's
 * scene list sends it (`GroupDetail`), and Playlist order only beside one
 * playlist, and Sub-collection order beside one parent collection (F23). Any playlist id reaches the sort: one the viewer cannot
 * read holds no scenes.
 */
const SORT_CONTEXT: Partial<
  Record<ListKind, Readonly<Record<string, (refs: RefPool) => PanelState>>>
> = {
  scene: {
    scene_index: (refs) => ({
      groups: { value: [refs("groups")[0]], modifier: "INCLUDES" },
    }),
    playlist_position: () => ({
      playlists: { value: [1], modifier: "INCLUDES" },
    }),
  },
  // Sub-collection order is offered only beside one parent collection
  group: {
    sub_group_order: (refs) => ({
      groupIds: { value: [refs("groups")[0]], modifier: "INCLUDES" },
    }),
  },
};

interface Statement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

type Outcome =
  | { readonly statement: Statement; readonly error?: undefined }
  | { readonly statement?: undefined; readonly error: string };

interface Walk {
  readonly userId: number;
  readonly allowedInstanceIds: string[];
  readonly refs: RefPool;
}

/** A case's failures, and what it changed when it passes */
interface Verdict {
  readonly failures: string[];
  readonly evidence: string[];
}

function describeError(error: unknown): string {
  if (error instanceof ValidationError) {
    const issues = (error.issues ?? [])
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    return `the parser refused it (${issues})`;
  }
  return `the request failed: ${error instanceof Error ? error.message : String(error)}`;
}

/** Parses the client's request as the route does, and runs the list's builder */
async function runList(
  kind: ListKind,
  filter: Record<string, unknown>,
  sort: string | undefined,
  walk: Walk
): Promise<void> {
  const parse = { userId: walk.userId } as const;
  const scope = {
    userId: walk.userId,
    allowedInstanceIds: walk.allowedInstanceIds,
  };
  // As `SearchControls` sends it
  const body = {
    filter: {
      direction: DEFAULT_SORT[kind].direction,
      page: 1,
      per_page: PER_PAGE,
      q: "",
      ...(sort === undefined ? {} : { sort }),
    },
    [FILTER_BODY_KEYS[kind]]: filter,
  };
  switch (kind) {
    case "scene":
      await sceneQueryBuilder.execute({
        ...scope,
        request: parseListRequest("scene", body, parse),
      });
      return;
    case "performer":
      await performerQueryBuilder.execute({
        ...scope,
        request: parseListRequest("performer", body, parse),
      });
      return;
    case "studio":
      await studioQueryBuilder.execute({
        ...scope,
        request: parseListRequest("studio", body, parse),
      });
      return;
    case "tag":
      await tagQueryBuilder.execute({
        ...scope,
        request: parseListRequest("tag", body, parse),
      });
      return;
    case "group":
      await groupQueryBuilder.execute({
        ...scope,
        request: parseListRequest("group", body, parse),
      });
      return;
    case "gallery":
      await galleryQueryBuilder.execute({
        ...scope,
        request: parseListRequest("gallery", body, parse),
      });
      return;
    case "image":
      await imageQueryBuilder.execute({
        ...scope,
        request: parseListRequest("image", body, parse),
      });
      return;
    case "clip":
      await clipQueryBuilder.execute({
        ...scope,
        request: parseListRequest("clip", body, parse),
      });
      return;
  }
}

/** The page statement a panel state and sort give, or why there is none */
async function pageStatement(
  kind: ListKind,
  list: ClientList,
  state: PanelState,
  sort: string | undefined,
  walk: Walk
): Promise<Outcome> {
  const filter = list.build(state);
  const recorder = recordStatements();
  try {
    await runList(kind, filter, sort, walk);
  } catch (error) {
    return { error: describeError(error) };
  } finally {
    recorder.restore();
  }
  const page = recorder.statements.find((recorded) =>
    recorded.sql.endsWith("\nLIMIT ? OFFSET ?")
  );
  return page === undefined
    ? { error: "the builder sent no page statement" }
    : { statement: { sql: page.sql, params: page.params } };
}

function paramsText(params: readonly unknown[]): string {
  return JSON.stringify(params, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

function sameStatement(a: Statement, b: Statement): boolean {
  return a.sql === b.sql && paramsText(a.params) === paramsText(b.params);
}

/**
 * A statement from FROM on, for reading: one join a line, and the WHERE one
 * condition a line (split at each AND, nested ones too)
 */
function statementLines(statement: Statement): string[] {
  const from = statement.sql.indexOf("\nFROM ");
  return statement.sql
    .slice(from + 1)
    .split("\n")
    .flatMap((line) =>
      line.startsWith("WHERE ")
        ? line.split(" AND ").map((term, i) => (i === 0 ? term : `AND ${term}`))
        : [line]
    );
}

/** A statement's WHERE and parameters, which show what a filter added */
function showWhere(statement: Statement): string {
  const where = statementLines(statement).filter(
    (line) => line.startsWith("WHERE ") || line.startsWith("AND ")
  );
  return [
    ...where.map((line) => `    ${line}`),
    `    params ${paramsText(statement.params)}`,
  ].join("\n");
}

/** What `actual` changes against `expected`: lines gone (-) and added (+), and the parameters */
function statementDiff(expected: Statement, actual: Statement): string {
  const before = statementLines(expected);
  const after = statementLines(actual);
  const lines = [
    ...before
      .filter((line) => !after.includes(line))
      .map((line) => `    - ${line}`),
    ...after
      .filter((line) => !before.includes(line))
      .map((line) => `    + ${line}`),
  ];
  const paramsBefore = paramsText(expected.params);
  const paramsAfter = paramsText(actual.params);
  if (paramsBefore !== paramsAfter) {
    lines.push(`    params ${paramsBefore} -> ${paramsAfter}`);
  }
  return lines.length > 0 ? lines.join("\n") : "    (the same text)";
}

function orderBy(statement: Statement): string {
  const { sql } = statement;
  const start = sql.lastIndexOf("\nORDER BY ") + "\nORDER BY ".length;
  return sql.slice(start, sql.lastIndexOf("\nLIMIT "));
}

/**
 * An ORDER BY's first term: the sort's own expression. The terms after it
 * (the builder's tiebreak and the primary key) are not the sort's.
 */
function leadingTerm(order: string): string {
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < order.length; i++) {
    const char = order[i];
    if (char === "'") quoted = !quoted;
    else if (!quoted && char === "(") depth++;
    else if (!quoted && char === ")") depth--;
    else if (!quoted && depth === 0 && char === ",") return order.slice(0, i);
  }
  return order;
}

/** Holds the case against KNOWN_GAPS: a problem when it fails unlisted, or passes listed */
function reconcile(id: string, verdict: Verdict): string | undefined {
  const known = Object.prototype.hasOwnProperty.call(KNOWN_GAPS, id)
    ? KNOWN_GAPS[id]
    : undefined;
  const indented = (lines: readonly string[]) =>
    lines.flatMap((line) => line.split("\n")).map((line) => `  ${line}`);
  if (verdict.failures.length > 0 && known === undefined) {
    return [id, ...indented(verdict.failures)].join("\n");
  }
  if (verdict.failures.length === 0 && known !== undefined) {
    return [
      id,
      `  reaches SQL now, but KNOWN_GAPS lists it ("${known}"): delete its entry`,
      ...indented(verdict.evidence),
    ].join("\n");
  }
  return undefined;
}

/** KNOWN_GAPS entries under a prefix that name no case the walk ran */
function staleEntries(prefix: string, ran: ReadonlySet<string>): string[] {
  return Object.keys(KNOWN_GAPS)
    .filter((id) => id.startsWith(prefix) && !ran.has(id))
    .map(
      (id) =>
        `${id}\n  KNOWN_GAPS lists it, but the walk ran no such case: delete its entry`
    );
}

/** Whether two modifiers may give one statement: has any and has all of one id */
function mayAgree(a: string, b: string, ids: number | undefined): boolean {
  return (
    ids === 1 && [a, b].includes("INCLUDES") && [a, b].includes("INCLUDES_ALL")
  );
}

/** One sample's verdict, beside the option's other samples */
function judge(
  option: ClientOption,
  sample: OptionSample,
  samples: readonly OptionSample[],
  outcomes: ReadonlyMap<string, Outcome>,
  unfiltered: Statement
): Verdict {
  const failures: string[] = [];
  const evidence: string[] = [];
  const { statement, error } = must(outcomes.get(sample.label), sample.label);
  if (statement === undefined) {
    return { failures: [error], evidence };
  }

  const compare = (label: string, other: Statement, why: string) => {
    if (sameStatement(statement, other)) {
      failures.push(`${why}: the page statement equals ${label}'s`);
      failures.push(showWhere(statement));
    } else {
      evidence.push(`against ${label}:`);
      evidence.push(statementDiff(other, statement));
    }
  };

  compare("the unfiltered request", unfiltered, "does not reach SQL");
  // Equal to the unfiltered statement, it equals every sample that is too
  if (failures.length > 0) return { failures, evidence };

  // The modifier: not the option's default one, which the unfiltered
  // comparison covers
  if (
    sample.modifier !== undefined &&
    sample.modifier !== option.defaultModifier
  ) {
    for (const other of samples) {
      if (
        other.variant !== sample.variant ||
        other.modifier === undefined ||
        other.modifier === sample.modifier ||
        mayAgree(sample.modifier, other.modifier, sample.ids)
      ) {
        continue;
      }
      const otherStatement = outcomes.get(other.label)?.statement;
      if (otherStatement === undefined) continue;
      compare(
        other.label,
        otherStatement,
        `the modifier ${sample.modifier} does not reach SQL`
      );
    }
  }

  // Sub-items: the same sample without them
  if (sample.withoutSubItems !== undefined) {
    const without = samples.find(
      (other) =>
        other.modifier === sample.modifier &&
        other.variant === sample.withoutSubItems
    );
    const withoutStatement =
      without === undefined
        ? undefined
        : outcomes.get(without.label)?.statement;
    if (without !== undefined && withoutStatement !== undefined) {
      compare(without.label, withoutStatement, "sub-items do not reach SQL");
    }
  }

  return { failures, evidence };
}

/** Every filter option of one list, walked; the problems found */
async function walkFilters(kind: ListKind, walk: Walk, list: ClientList) {
  const problems: string[] = [];
  const ran = new Set<string>();
  const unfiltered = await pageStatement(kind, list, {}, undefined, walk);
  if (unfiltered.statement === undefined) {
    return [`${kind}: the unfiltered request failed: ${unfiltered.error}`];
  }

  for (const option of list.options) {
    if (option.type === "section-header") continue;
    let samples: OptionSample[];
    try {
      samples = optionSamples(option, walk.refs);
    } catch (error) {
      problems.push(
        `${kind} filter ${option.key}: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }
    const outcomes = new Map<string, Outcome>();
    for (const sample of samples) {
      outcomes.set(
        sample.label,
        await pageStatement(kind, list, sample.state, undefined, walk)
      );
    }
    for (const sample of samples) {
      const id = `${kind} filter ${option.key}: ${sample.label}`;
      ran.add(id);
      const problem = reconcile(
        id,
        judge(option, sample, samples, outcomes, unfiltered.statement)
      );
      if (problem !== undefined) problems.push(problem);
    }
  }
  return [...problems, ...staleEntries(`${kind} filter `, ran)];
}

/** Every sort option of one list, walked; the problems found */
async function walkSorts(kind: ListKind, walk: Walk, list: ClientList) {
  const problems: string[] = [];
  const ran = new Set<string>();
  const fallback = FALLBACK_SORT[kind];

  for (const sort of list.sorts) {
    const id = `${kind} sort ${sort.value}`;
    ran.add(id);
    const state = SORT_CONTEXT[kind]?.[sort.value]?.(walk.refs) ?? {};
    const sent = sort.value === "random" ? RANDOM_SORT : sort.value;
    const outcome = await pageStatement(kind, list, state, sent, walk);
    const failures: string[] = [];
    const evidence: string[] = [];
    if (outcome.statement === undefined) {
      failures.push(outcome.error);
    } else if (sort.value !== fallback) {
      const base = await pageStatement(kind, list, state, fallback, walk);
      if (base.statement === undefined) {
        failures.push(`the fallback sort ${fallback} failed: ${base.error}`);
      } else {
        const ordered = orderBy(outcome.statement);
        const fallbackOrder = orderBy(base.statement);
        if (leadingTerm(ordered) === leadingTerm(fallbackOrder)) {
          failures.push(
            `does not reach ORDER BY: it orders by the fallback ${fallback}'s ${leadingTerm(fallbackOrder)} (ORDER BY ${ordered})`
          );
        } else {
          evidence.push(`ORDER BY ${fallbackOrder}`);
          evidence.push(`  -> ORDER BY ${ordered}`);
        }
      }
    }
    const problem = reconcile(id, { failures, evidence });
    if (problem !== undefined) problems.push(problem);
  }
  return [...problems, ...staleEntries(`${kind} sort `, ran)];
}

/**
 * Two composite ids per entity type the client's searchable selects name,
 * on the test instance: the test entity and another. For tags and studios a
 * tag or studio with a sub-item comes first, so including sub-items changes
 * the refs.
 */
async function refPool(instanceId: string): Promise<RefPool> {
  const live = { stashInstanceId: instanceId, deletedAt: null };
  const ids = { select: { id: true }, orderBy: { id: "asc" as const } };
  const pair = (
    what: string,
    first: string,
    rows: readonly { id: string }[]
  ): RefPair => {
    const second = must(
      rows.find((row) => row.id !== first),
      `a second ${what} on the test instance`
    ).id;
    return [
      makeEntityRef(first, instanceId),
      makeEntityRef(second, instanceId),
    ];
  };

  const tags = await prisma.stashTag.findMany({
    where: live,
    select: { id: true, parentIds: true },
    orderBy: { id: "asc" },
  });
  const parentTag = must(
    tags
      .flatMap((tag) => parseJsonArray(tag.parentIds))
      .find((id) => tags.some((tag) => tag.id === id)),
    "a tag with a sub-tag"
  );
  const studios = await prisma.stashStudio.findMany({
    where: live,
    select: { id: true, parentId: true },
    orderBy: { id: "asc" },
  });
  const parentStudio = must(
    studios
      .map((studio) => studio.parentId)
      .find((id) => studios.some((studio) => studio.id === id)),
    "a studio with a sub-studio"
  );

  const pool = new Map<string, RefPair>([
    [
      "tags",
      pair("tag", parentTag, [{ id: TEST_ENTITIES.tagWithEntities }, ...tags]),
    ],
    [
      "studios",
      pair("studio", parentStudio, [
        { id: TEST_ENTITIES.studioWithScenes },
        ...studios,
      ]),
    ],
    [
      "performers",
      pair(
        "performer",
        TEST_ENTITIES.performerWithScenes,
        await prisma.stashPerformer.findMany({ where: live, ...ids })
      ),
    ],
    [
      "groups",
      pair(
        "group",
        TEST_ENTITIES.groupWithScenes,
        await prisma.stashGroup.findMany({ where: live, ...ids })
      ),
    ],
    [
      "galleries",
      pair(
        "gallery",
        TEST_ENTITIES.galleryWithImages,
        await prisma.stashGallery.findMany({ where: live, ...ids })
      ),
    ],
    [
      "scenes",
      pair(
        "scene",
        TEST_ENTITIES.sceneWithRelations,
        await prisma.stashScene.findMany({ where: live, ...ids })
      ),
    ],
  ]);
  return (entityType) =>
    must(pool.get(entityType), `test ids for entity type ${entityType}`);
}

describeWithDb(
  "filter contract: every client filter and sort reaches SQL",
  () => {
    let walk: Walk;
    let client: ClientFilterConfig;

    beforeAll(async () => {
      client = await loadClientFilterConfig();
      const admin = await prisma.user.findUniqueOrThrow({
        where: { username: TEST_ADMIN.username },
        select: { id: true },
      });
      await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
      const instanceId = await findTestInstanceId();
      walk = {
        userId: admin.id,
        allowedInstanceIds: [instanceId],
        refs: await refPool(instanceId),
      };
    });

    it.each(LIST_KINDS)(
      "every %s filter option parses and reaches SQL",
      async (kind) => {
        const problems = await walkFilters(
          kind,
          walk,
          clientList(client, kind)
        );
        expect(problems.join("\n\n")).toBe("");
      },
      WALK_TIMEOUT_MS
    );

    it.each(LIST_KINDS)(
      "every %s sort option parses and reaches ORDER BY",
      async (kind) => {
        const problems = await walkSorts(kind, walk, clientList(client, kind));
        expect(problems.join("\n\n")).toBe("");
      },
      WALK_TIMEOUT_MS
    );

    it("Rating's presence choices are walked: IS_NULL and NOT_NULL samples reach SQL", () => {
      const rating = must(
        clientList(client, "scene").options.find(
          (option) => option.key === "rating"
        ),
        "the scene Rating option"
      );
      const samples = optionSamples(rating, walk.refs);

      expect(rating.modifierKey).toBe("ratingModifier");
      expect(new Set(samples.map((sample) => sample.modifier))).toEqual(
        new Set(["BETWEEN", "IS_NULL", "NOT_NULL"])
      );
      for (const presence of ["IS_NULL", "NOT_NULL"]) {
        expect(
          samples.some(
            (sample) =>
              sample.modifier === presence &&
              sample.state.ratingModifier === presence
          )
        ).toBe(true);
      }
    });

    /**
     * A gallery's or image's tag count is its junction rows on its own
     * instance (an image's include its galleries' tags): for each count, 0
     * (the folder view's Untagged) first, the rows the list gives and the
     * rows with that many
     */
    async function tagCountLists(kind: "gallery" | "image") {
      const [table, junction, idCol, instanceCol] =
        kind === "gallery"
          ? ["StashGallery", "GalleryTag", "galleryId", "galleryInstanceId"]
          : ["StashImage", "ImageTag", "imageId", "imageInstanceId"];
      const rows = await prisma.$queryRawUnsafe<{ id: string; n: bigint }[]>(
        `SELECT x.id, (SELECT COUNT(*) FROM ${junction} j WHERE j.${idCol} = x.id AND j.${instanceCol} = x.stashInstanceId) AS n
         FROM ${table} x WHERE x.stashInstanceId = ? AND x.deletedAt IS NULL`,
        must(walk.allowedInstanceIds[0])
      );
      const counts = [...new Set([0, ...rows.map((row) => Number(row.n))])];
      const listed = [];
      const expected = [];
      for (const n of counts) {
        const body = {
          filter: { page: 1, per_page: 250, q: "" },
          [FILTER_BODY_KEYS[kind]]: {
            tag_count: { value: n, modifier: "EQUALS" },
          },
        };
        const options = {
          userId: walk.userId,
          allowedInstanceIds: walk.allowedInstanceIds,
          applyExclusions: false,
        };
        const parse = { userId: walk.userId } as const;
        const result =
          kind === "gallery"
            ? await galleryQueryBuilder.execute({
                ...options,
                request: parseListRequest("gallery", body, parse),
              })
            : await imageQueryBuilder.execute({
                ...options,
                request: parseListRequest("image", body, parse),
              });
        const ids = result.items.map((item) => item.id).sort();
        listed.push({ n, ids, total: result.total });
        const matching = rows
          .filter((row) => Number(row.n) === n)
          .map((row) => row.id)
          .sort();
        expected.push({ n, ids: matching, total: matching.length });
      }
      return { listed, expected, tagged: rows.some((row) => row.n > 0n) };
    }

    it("gallery tag_count EQUALS 0 lists only untagged galleries", async () => {
      const { listed, expected, tagged } = await tagCountLists("gallery");
      expect(tagged).toBe(true);
      expect(listed).toEqual(expected);
    });

    it("image tag_count EQUALS 0 lists only untagged images", async () => {
      const { listed, expected, tagged } = await tagCountLists("image");
      expect(tagged).toBe(true);
      expect(listed).toEqual(expected);
    });

    it("names only lists the walk knows in KNOWN_GAPS", () => {
      const unknown = Object.keys(KNOWN_GAPS).filter(
        (id) =>
          !LIST_KINDS.some(
            (kind) =>
              id.startsWith(`${kind} filter `) || id.startsWith(`${kind} sort `)
          )
      );
      expect(unknown).toEqual([]);
    });
  }
);
