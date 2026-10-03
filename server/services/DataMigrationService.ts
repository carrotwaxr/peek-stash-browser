import { presetArtifactType } from "@peek/shared-types/presetContexts.js";
import prisma from "../prisma/singleton.js";
import { dbWrite, dbWriteBatch } from "../utils/dbWrite.js";
import { carouselRulesLocked } from "../utils/listRequest.js";
import { logger } from "../utils/logger.js";
import { NO_DATE_BEFORE } from "../utils/stashDate.js";
import { entityImageCountService } from "./EntityImageCountService.js";
import { exclusionComputationService } from "./ExclusionComputationService.js";
import { imageGalleryInheritanceService } from "./ImageGalleryInheritanceService.js";
import { linkCountService } from "./LinkCountService.js";
import { sceneTagInheritanceService } from "./SceneTagInheritanceService.js";
import { stashSyncService } from "./StashSyncService.js";
import {
  type BareRefLookup,
  type CleanReport,
  bareRefLookupFor,
  cleanCarouselRules,
  cleanCarouselTree,
  cleanFilterPresets,
} from "./StoredFilterCleaner.js";
import { userStatsService } from "./UserStatsService.js";

/**
 * DataMigrationService
 *
 * Handles one-time data migrations that need to run on server startup.
 * Each migration runs once and is tracked in the DataMigration table.
 *
 * Migrations are idempotent and safe to re-run if needed.
 */

interface Migration {
  name: string;
  description: string;
  run: () => Promise<void>;
}

/**
 * The per-user tables that had no relation to User, so a user's delete
 * never cascaded to them. Migration 20260930000100 rebuilt them with a
 * foreign key (ON DELETE CASCADE) and left out rows of missing users, so
 * this entry finds nothing on a database past it; it stays as history.
 */
const UNLINKED_USER_TABLES = [
  "UserPerformerStats",
  "UserStudioStats",
  "UserTagStats",
  "UserEntityRanking",
] as const;

type UnlinkedUserTable = (typeof UNLINKED_USER_TABLES)[number];

/** Rows deleted per write unit */
const ORPHAN_CHUNK = 5000;

/**
 * Deletes the rows of users that no longer exist from the unlinked
 * per-user tables (migration 008), table by table, up to `chunkSize` rows a
 * write unit until a chunk comes back short. Each chunk finds its rows by
 * scanning the table and probing User's primary key.
 */
export async function deleteOrphanedUserRows(
  chunkSize: number = ORPHAN_CHUNK
): Promise<Record<UnlinkedUserTable, number>> {
  const deleted: Record<UnlinkedUserTable, number> = {
    UserPerformerStats: 0,
    UserStudioStats: 0,
    UserTagStats: 0,
    UserEntityRanking: 0,
  };
  for (const table of UNLINKED_USER_TABLES) {
    const sql = `
      DELETE FROM "${table}" WHERE id IN (
        SELECT t.id FROM "${table}" t
        WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t.userId)
        LIMIT ?
      )`;
    for (;;) {
      const count = await dbWrite("migration.orphanedUserRows", () =>
        prisma.$executeRawUnsafe(sql, chunkSize)
      );
      deleted[table] += count;
      if (count < chunkSize) break;
    }
  }
  return deleted;
}

/**
 * The entity date columns earlier syncs stored as Stash returned them,
 * "0001-01-01" (its answer for a collection with no date) included
 */
const DATE_COLUMNS = [
  ["StashScene", "date"],
  ["StashGroup", "date"],
  ["StashGallery", "date"],
  ["StashImage", "date"],
  ["StashPerformer", "birthdate"],
  ["StashPerformer", "deathDate"],
] as const;

type DateColumn =
  `${(typeof DATE_COLUMNS)[number][0]}.${(typeof DATE_COLUMNS)[number][1]}`;

/** Rows cleared per write unit */
const DATE_CHUNK = 5000;

/**
 * Clears the dates Stash answers for none (before year 2, `stashDate`)
 * that earlier syncs stored (migration 013), column by column, up to
 * `chunkSize` rows a write unit until a chunk comes back short. Sync stores
 * them as NULL from now on, so this runs once.
 */
export async function clearYearOneDates(
  chunkSize: number = DATE_CHUNK
): Promise<Partial<Record<DateColumn, number>>> {
  const cleared: Partial<Record<DateColumn, number>> = {};
  for (const [table, column] of DATE_COLUMNS) {
    const sql = `
      UPDATE "${table}" SET "${column}" = NULL WHERE rowid IN (
        SELECT rowid FROM "${table}" WHERE "${column}" < ? LIMIT ?
      )`;
    let total = 0;
    for (;;) {
      const count = await dbWrite("migration.yearOneDates", () =>
        prisma.$executeRawUnsafe(sql, NO_DATE_BEFORE, chunkSize)
      );
      total += count;
      if (count < chunkSize) break;
    }
    cleared[`${table}.${column}`] = total;
  }
  return cleared;
}

/** A user's saved presets, as stored (and their defaults, for migration 012) */
interface StoredPresetsRow {
  userId: number;
  presets: string | null;
  /** `defaultFilterPresets`: read by migration 012 only */
  defaults?: string | null;
}

/** A custom carousel's stored query */
interface StoredCarouselRow {
  id: string;
  userId: number;
  rules: string;
  sort: string;
  direction: string;
}

/** What migration 009 changed: counts and key names, no values */
export interface StoredFilterCleanup {
  /** Users with a preset or carousel written */
  users: number;
  presets: number;
  carousels: number;
  /** Dropped keys by `<list>.<key>` (`carousel.<key>` for rules) */
  droppedKeys: Record<string, number>;
  refsRewritten: number;
  /** Bare ids no single live entity has, left bare (also in rows left unchanged) */
  refsLeftBare: number;
  /** Rows left as stored: unreadable JSON, or saved again since they were read */
  skipped: number;
}

const MIGRATION_009 = "[Migration 009]";

/** The report's fields for a log line: key names and counts, no values */
function reportFields(report: CleanReport) {
  return {
    droppedKeys: report.droppedKeys,
    sortReset: report.sortReset,
    directionFixed: report.directionFixed,
    perPageCapped: report.perPageCapped,
    refsRewritten: report.refsRewritten,
    refsLeftBare: report.refsLeftBare,
  };
}

/** Parsed stored JSON; undefined, with a warning, when it does not parse */
function parseStored(
  text: string,
  what: Record<string, unknown>,
  tag: string = MIGRATION_009
): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    logger.warn(`${tag} Left a stored value it cannot read`, what);
    return undefined;
  }
}

/**
 * Every stored preset list and carousel of the users in scope, by user.
 * With `withDefaults` (migration 012) the users are those holding presets
 * or defaults, and the defaults are read too.
 */
async function readStoredFilters(
  userIds: readonly number[] | undefined,
  withDefaults = false
) {
  const inScope = (column: string) =>
    userIds === undefined
      ? { sql: "", params: [] }
      : {
          sql: `AND ${column} IN (SELECT value FROM json_each(?))`,
          params: [JSON.stringify(userIds)],
        };
  const byUser = inScope("id");
  const presetRows = await prisma.$queryRawUnsafe<StoredPresetsRow[]>(
    withDefaults
      ? `SELECT id AS userId, CAST(filterPresets AS TEXT) AS presets,
                CAST(defaultFilterPresets AS TEXT) AS defaults
         FROM "User"
         WHERE ("filterPresets" IS NOT NULL OR "defaultFilterPresets" IS NOT NULL)
           ${byUser.sql}
         ORDER BY id`
      : `SELECT id AS userId, CAST(filterPresets AS TEXT) AS presets FROM "User"
         WHERE filterPresets IS NOT NULL ${byUser.sql}
         ORDER BY id`,
    ...byUser.params
  );
  const byOwner = inScope("userId");
  const carouselRows = await prisma.$queryRawUnsafe<StoredCarouselRow[]>(
    `SELECT id, userId, CAST(rules AS TEXT) AS rules, sort, direction
     FROM "UserCarousel"
     WHERE 1 = 1 ${byOwner.sql}
     ORDER BY userId, createdAt, id`,
    ...byOwner.params
  );

  const presetsByUser = new Map(presetRows.map((row) => [row.userId, row]));
  const carouselsByUser = new Map<number, StoredCarouselRow[]>();
  for (const row of carouselRows) {
    const rows = carouselsByUser.get(row.userId) ?? [];
    rows.push(row);
    carouselsByUser.set(row.userId, rows);
  }
  const users = [
    ...new Set([...presetsByUser.keys(), ...carouselsByUser.keys()]),
  ].sort((a, b) => a - b);
  return { users, presetsByUser, carouselsByUser };
}

/**
 * One user's presets and carousels: cleaned, then written in one unit when
 * anything changed, each write naming the value it read. Adds to `summary`.
 */
async function cleanUserStoredFilters(
  userId: number,
  presetRow: StoredPresetsRow | undefined,
  carouselRows: readonly StoredCarouselRow[],
  summary: StoredFilterCleanup
): Promise<void> {
  const presets =
    presetRow?.presets != null
      ? parseStored(presetRow.presets, { userId, column: "filterPresets" })
      : undefined;
  if (presetRow?.presets != null && !presets) summary.skipped++;
  const carousels = carouselRows.flatMap((row) => {
    const rules = parseStored(row.rules, { userId, carouselId: row.id });
    if (!rules) summary.skipped++;
    return rules ? [{ row, rules: rules.value }] : [];
  });

  const clean = (lookup: BareRefLookup) => ({
    presets: presets ? cleanFilterPresets(presets.value, lookup) : undefined,
    carousels: carousels.map(({ row, rules }) => ({
      row,
      cleaned: cleanCarouselRules(rules, row.sort, row.direction, lookup),
    })),
  });
  const cleaned = clean(await bareRefLookupFor(clean));
  for (const { report } of [
    ...(cleaned.presets?.results ?? []),
    ...cleaned.carousels.map((carousel) => carousel.cleaned),
  ]) {
    summary.refsLeftBare += report.refsLeftBare;
  }

  const presetWrite =
    presetRow && cleaned.presets?.changed
      ? { row: presetRow, presets: cleaned.presets }
      : undefined;
  const carouselWrites = cleaned.carousels.filter(
    (carousel) => carousel.cleaned.changed
  );
  const ops = [
    ...(presetWrite
      ? [
          prisma.$executeRawUnsafe(
            `UPDATE "User" SET "filterPresets" = ?
             WHERE "id" = ? AND "filterPresets" = ?`,
            JSON.stringify(presetWrite.presets.value),
            userId,
            presetWrite.row.presets
          ),
        ]
      : []),
    ...carouselWrites.map(({ row, cleaned: carousel }) =>
      prisma.$executeRawUnsafe(
        `UPDATE "UserCarousel" SET "rules" = ?, "sort" = ?, "direction" = ?
         WHERE "id" = ? AND "rules" = ? AND "sort" = ? AND "direction" = ?`,
        JSON.stringify(carousel.value.rules),
        carousel.value.sort,
        carousel.value.direction,
        row.id,
        row.rules,
        row.sort,
        row.direction
      )
    ),
  ];
  if (ops.length === 0) return;

  // In the order of `ops`: the presets first, then each carousel
  const written = (await dbWriteBatch("migration.cleanStoredFilters", ops)).map(
    (count) => count > 0
  );
  const countDropped = (prefix: string, keys: readonly string[]) => {
    for (const key of keys) {
      const name = `${prefix}.${key}`;
      summary.droppedKeys[name] = (summary.droppedKeys[name] ?? 0) + 1;
    }
  };

  if (presetWrite && written.shift()) {
    for (const result of presetWrite.presets.results) {
      if (!result.changed) continue;
      summary.presets++;
      summary.refsRewritten += result.report.refsRewritten;
      countDropped(result.entity, result.report.droppedKeys);
      logger.info(`${MIGRATION_009} Cleaned a saved filter preset`, {
        userId,
        entity: result.entity,
        presetId: result.presetId,
        ...reportFields(result.report),
      });
    }
  } else if (presetWrite) {
    summary.skipped++;
    logger.info(
      `${MIGRATION_009} Left saved filter presets changed since they were read`,
      { userId }
    );
  }
  for (const { row, cleaned: carousel } of carouselWrites) {
    if (written.shift()) {
      summary.carousels++;
      summary.refsRewritten += carousel.report.refsRewritten;
      countDropped("carousel", carousel.report.droppedKeys);
      logger.info(`${MIGRATION_009} Cleaned a carousel's rules`, {
        userId,
        carouselId: row.id,
        ...reportFields(carousel.report),
      });
    } else {
      summary.skipped++;
      logger.info(
        `${MIGRATION_009} Left a carousel changed since it was read`,
        { userId, carouselId: row.id }
      );
    }
  }
}

/**
 * Cleans every user's saved filter presets and custom carousels against the
 * filter contract (migration 009; `StoredFilterCleaner`), or only those of
 * `userIds`. One write unit per user with anything to change. Each write
 * names the value it read, so a preset list or carousel saved again since
 * then is left as its user saved it. Idempotent: a second run writes
 * nothing.
 */
export async function cleanStoredFilters(
  userIds?: readonly number[]
): Promise<StoredFilterCleanup> {
  const { users, presetsByUser, carouselsByUser } =
    await readStoredFilters(userIds);
  const summary: StoredFilterCleanup = {
    users: 0,
    presets: 0,
    carousels: 0,
    droppedKeys: {},
    refsRewritten: 0,
    refsLeftBare: 0,
    skipped: 0,
  };
  for (const userId of users) {
    const before = summary.presets + summary.carousels;
    await cleanUserStoredFilters(
      userId,
      presetsByUser.get(userId),
      carouselsByUser.get(userId) ?? [],
      summary
    );
    if (summary.presets + summary.carousels > before) summary.users++;
  }
  return summary;
}

const MIGRATION_012 = "[Migration 012]";

/** What migration 012 changed: counts and key names, no values */
export interface StoredFilterTreeMigration extends StoredFilterCleanup {
  /** Saved Views read (changed or not) */
  presetsExamined: number;
  /** A multi row's lone value made a one-element list */
  valuesListed: number;
  /** Flat carousels naming `ids` or an instance, which a tree cannot hold */
  carouselsLeftFlat: number;
  /** Defaults that named a View its list no longer holds */
  defaultsDropped: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The defaults that still name a View their list holds: a default of a
 * context names a View of `presetArtifactType(context)`.
 */
function heldDefaults(
  defaults: Record<string, unknown>,
  views: Record<string, unknown>
): [string, unknown][] {
  return Object.entries(defaults).filter(([context, id]) => {
    const list = views[presetArtifactType(context)];
    return (
      typeof id === "string" &&
      Array.isArray(list) &&
      list.some((view) => isObject(view) && view.id === id)
    );
  });
}

/**
 * One user's Views, defaults and carousels in the canonical form, written in
 * one unit when anything changed, each write naming the text it read.
 * Adds to `summary`.
 */
async function migrateUserStoredFilters(
  userId: number,
  userRow: StoredPresetsRow | undefined,
  carouselRows: readonly StoredCarouselRow[],
  summary: StoredFilterTreeMigration
): Promise<void> {
  const presets =
    userRow?.presets != null
      ? parseStored(
          userRow.presets,
          { userId, column: "filterPresets" },
          MIGRATION_012
        )
      : undefined;
  if (userRow?.presets != null && !presets) summary.skipped++;
  const defaults =
    userRow?.defaults != null
      ? parseStored(
          userRow.defaults,
          { userId, column: "defaultFilterPresets" },
          MIGRATION_012
        )
      : undefined;
  if (userRow?.defaults != null && !defaults) summary.skipped++;

  const carousels = carouselRows.flatMap((row) => {
    const rules = parseStored(
      row.rules,
      { userId, carouselId: row.id },
      MIGRATION_012
    );
    if (!rules) summary.skipped++;
    if (rules && carouselRulesLocked(rules.value)) {
      summary.carouselsLeftFlat++;
      return [];
    }
    return rules ? [{ row, rules: rules.value }] : [];
  });

  const clean = (lookup: BareRefLookup) => ({
    presets: presets ? cleanFilterPresets(presets.value, lookup) : undefined,
    carousels: carousels.map(({ row, rules }) => ({
      row,
      cleaned: cleanCarouselTree(rules, row.sort, row.direction, lookup),
    })),
  });
  const cleaned = clean(await bareRefLookupFor(clean));
  for (const { report } of [
    ...(cleaned.presets?.results ?? []),
    ...cleaned.carousels.map((carousel) => carousel.cleaned),
  ]) {
    summary.refsLeftBare += report.refsLeftBare;
  }
  summary.presetsExamined += cleaned.presets?.results.length ?? 0;

  // The Views the defaults are held against: none when the column is NULL;
  // unreadable or not a map of lists, nothing can be said of them
  const views = userRow?.presets == null ? {} : cleaned.presets?.value;
  const keptDefaults =
    isObject(defaults?.value) && isObject(views)
      ? heldDefaults(defaults.value, views)
      : undefined;
  const defaultsDropped =
    isObject(defaults?.value) && keptDefaults
      ? Object.keys(defaults.value).length - keptDefaults.length
      : 0;

  const userChanged = Boolean(cleaned.presets?.changed) || defaultsDropped > 0;
  const carouselWrites = cleaned.carousels.filter(
    (carousel) => carousel.cleaned.changed
  );
  const ops = [
    ...(userRow && userChanged
      ? [
          prisma.$executeRawUnsafe(
            `UPDATE "User" SET "filterPresets" = ?, "defaultFilterPresets" = ?, "updatedAt" = ?
             WHERE "id" = ? AND CAST("filterPresets" AS TEXT) IS ?
               AND CAST("defaultFilterPresets" AS TEXT) IS ?`,
            cleaned.presets?.changed
              ? JSON.stringify(cleaned.presets.value)
              : userRow.presets,
            defaultsDropped > 0 && keptDefaults
              ? // fromEntries defines own properties, so a stored `__proto__` stays data
                JSON.stringify(Object.fromEntries(keptDefaults))
              : (userRow.defaults ?? null),
            Date.now(),
            userId,
            userRow.presets,
            userRow.defaults ?? null
          ),
        ]
      : []),
    ...carouselWrites.map(({ row, cleaned: carousel }) =>
      prisma.$executeRawUnsafe(
        `UPDATE "UserCarousel" SET "rules" = ?, "sort" = ?, "direction" = ?
         WHERE "id" = ? AND CAST("rules" AS TEXT) IS ? AND "sort" = ? AND "direction" = ?`,
        JSON.stringify(carousel.value.rules),
        carousel.value.sort,
        carousel.value.direction,
        row.id,
        row.rules,
        row.sort,
        row.direction
      )
    ),
  ];
  if (ops.length === 0) return;

  // In the order of `ops`: the user first, then each carousel
  const written = (
    await dbWriteBatch("migration.viewsAndCarouselTrees", ops)
  ).map((count) => count > 0);
  const countDropped = (prefix: string, keys: readonly string[]) => {
    for (const key of keys) {
      const name = `${prefix}.${key}`;
      summary.droppedKeys[name] = (summary.droppedKeys[name] ?? 0) + 1;
    }
  };

  if (userRow && userChanged && written.shift()) {
    summary.defaultsDropped += defaultsDropped;
    if (defaultsDropped > 0) {
      logger.info(`${MIGRATION_012} Dropped defaults naming a missing View`, {
        userId,
        defaultsDropped,
      });
    }
    for (const result of cleaned.presets?.results ?? []) {
      if (!result.changed) continue;
      summary.presets++;
      summary.refsRewritten += result.report.refsRewritten;
      summary.valuesListed += result.report.valuesListed;
      countDropped(result.entity, result.report.droppedKeys);
      logger.info(`${MIGRATION_012} Cleaned a saved View`, {
        userId,
        entity: result.entity,
        presetId: result.presetId,
        ...reportFields(result.report),
        valuesListed: result.report.valuesListed,
      });
    }
  } else if (userRow && userChanged) {
    summary.skipped++;
    logger.info(
      `${MIGRATION_012} Left saved Views changed since they were read`,
      { userId }
    );
  }
  for (const { row, cleaned: carousel } of carouselWrites) {
    if (written.shift()) {
      summary.carousels++;
      summary.refsRewritten += carousel.report.refsRewritten;
      countDropped("carousel", carousel.report.droppedKeys);
      logger.info(`${MIGRATION_012} Stored a carousel's rules as a tree`, {
        userId,
        carouselId: row.id,
        ...reportFields(carousel.report),
      });
    } else {
      summary.skipped++;
      logger.info(
        `${MIGRATION_012} Left a carousel changed since it was read`,
        { userId, carouselId: row.id }
      );
    }
  }
}

/**
 * Moves every user's saved Views, defaults and custom carousels to the form
 * the Views menu and the carousel builder store (migration 012), or only
 * those of `userIds`: each carousel's rules as a tree of rows and groups
 * (`cleanCarouselTree`; a flat carousel naming `ids` or an instance stays
 * flat, since a tree cannot hold them), the Views through the preset cleaner
 * (a multi row's lone value as a list, bare ids tied), and the defaults
 * without any naming a View their list no longer holds. One write unit per
 * user with anything to change. Each write names the text it read, so a
 * save in between stands. Idempotent: a second run writes nothing.
 */
export async function migrateStoredFiltersToTrees(
  userIds?: readonly number[]
): Promise<StoredFilterTreeMigration> {
  const { users, presetsByUser, carouselsByUser } = await readStoredFilters(
    userIds,
    true
  );
  const summary: StoredFilterTreeMigration = {
    users: 0,
    presets: 0,
    carousels: 0,
    droppedKeys: {},
    refsRewritten: 0,
    refsLeftBare: 0,
    skipped: 0,
    presetsExamined: 0,
    valuesListed: 0,
    carouselsLeftFlat: 0,
    defaultsDropped: 0,
  };
  for (const userId of users) {
    const before =
      summary.presets + summary.carousels + summary.defaultsDropped;
    await migrateUserStoredFilters(
      userId,
      presetsByUser.get(userId),
      carouselsByUser.get(userId) ?? [],
      summary
    );
    if (
      summary.presets + summary.carousels + summary.defaultsDropped >
      before
    ) {
      summary.users++;
    }
  }
  return summary;
}

/**
 * A migration that recomputes every user's exclusions once, after a change to
 * what the computation reads. A failure leaves it pending for the next start.
 */
function recomputeExclusionsMigration(
  name: string,
  description: string,
  after: string
): Migration {
  const label = `[Migration ${name.slice(0, 3)}]`;
  return {
    name,
    description,
    run: async () => {
      const startTime = Date.now();
      logger.info(
        `${label} Recomputing exclusions for all users after ${after}`
      );

      try {
        const result = await exclusionComputationService.recomputeAllUsers();
        logger.info(`${label} Exclusion recompute completed`, {
          durationMs: Date.now() - startTime,
          success: result.success,
          failed: result.failed,
        });
      } catch (error) {
        logger.error(
          `${label} Exclusion recompute failed - will retry on next startup`,
          {
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        );
        throw error;
      }
    },
  };
}

// Define all migrations here
const migrations: Migration[] = [
  {
    name: "001_rebuild_user_stats",
    description:
      "Rebuild all user stats from watch history (backfill for v1.4.x)",
    run: async () => {
      logger.info("[Migration 001] Starting user stats rebuild for all users");

      // Get all users
      const users = await prisma.user.findMany({
        select: { id: true, username: true },
      });

      logger.info("[Migration 001] Found users to migrate", {
        count: users.length,
      });

      // Rebuild stats for each user
      for (const user of users) {
        try {
          logger.info("[Migration 001] Rebuilding stats", {
            userId: user.id,
            username: user.username,
          });

          await userStatsService.rebuildAllStatsForUser(user.id);

          logger.info("[Migration 001] Successfully rebuilt stats", {
            userId: user.id,
            username: user.username,
          });
        } catch (error) {
          logger.error("[Migration 001] Failed to rebuild stats for user", {
            userId: user.id,
            username: user.username,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          // Continue with other users even if one fails
        }
      }

      logger.info("[Migration 001] Completed user stats rebuild for all users");
    },
  },
  {
    name: "002_rebuild_stats_multi_instance",
    description:
      "Rebuild all stats after multi-instance instanceId migration to correctly separate per-instance stats",
    run: async () => {
      const startTime = Date.now();
      logger.info(
        "[Migration 002] Starting full stats rebuild after multi-instance stats migration"
      );

      try {
        await userStatsService.rebuildAllStats();
        const duration = Date.now() - startTime;
        logger.info("[Migration 002] Stats rebuild completed successfully", {
          durationMs: duration,
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(
          "[Migration 002] Stats rebuild failed - will retry on next startup",
          {
            durationMs: duration,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          }
        );
        throw error;
      }
    },
  },
  recomputeExclusionsMigration(
    "003_recompute_exclusions_restriction_semantics",
    "Recompute every user's exclusions after the INCLUDE/restrictEmpty/hierarchy/admin semantics change (item 13)",
    "the restriction semantics change"
  ),
  recomputeExclusionsMigration(
    "004_recompute_exclusions_reason_precedence",
    "Recompute every user's exclusions so a hidden item never masks a content restriction (the Hidden Items list reads the stored reason)",
    "the reason precedence change"
  ),
  // The database migration 20260925000400 corrects the stored studio
  // instances; this applies the corrected cascade without waiting for a sync
  recomputeExclusionsMigration(
    "005_recompute_exclusions_studio_instance",
    "Recompute every user's exclusions once galleries and images record their studio's instance, so a studio restriction covers them on every instance",
    "galleries and images recorded their studio's instance"
  ),
  // Sync now recomputes these only for what a sync changed, and a
  // soft-deleted performer, studio, group or tag no longer passes anything
  // on: what was computed under the old rules is rebuilt once, whole
  // library, instead of whenever each entity is next rescoped
  {
    name: "006_rebuild_derived_after_sync_semantics",
    description:
      "Rebuild scene tag inheritance, gallery inheritance, inherited image counts and tag scene counts for the whole library, then every user's exclusions, under the sync's new rules (soft-deleted performers, studios, groups and tags pass nothing on)",
    run: async () => {
      const label = "[Migration 006]";
      const startTime = Date.now();
      logger.info(
        `${label} Rebuilding inherited tags, gallery inheritance, image counts and tag scene counts, then every user's exclusions`
      );
      try {
        // In the post-sync steps' order: the counts count what the
        // inheritance hands down, and the recompute reads all of it
        await sceneTagInheritanceService.computeInheritedTags("all");
        await imageGalleryInheritanceService.applyGalleryInheritance("all");
        await entityImageCountService.rebuildAllImageCounts("all");
        await stashSyncService.computeTagSceneCountsViaPerformers();
        const result = await exclusionComputationService.recomputeAllUsers();
        logger.info(`${label} Rebuild completed`, {
          durationMs: Date.now() - startTime,
          success: result.success,
          failed: result.failed,
        });
      } catch (error) {
        logger.error(`${label} Rebuild failed - will retry on next startup`, {
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    },
  },
  // The stats page ranks its top scenes from the watch history when it
  // loads, so the scene rankings RankingComputeService used to store are
  // read by nothing. One unit per user: each is bounded by the scenes that
  // user watched (17k rows delete in about 30 ms at 200k scenes).
  {
    name: "007_drop_scene_rankings",
    description:
      "Delete the stored scene rankings: the stats page ranks top scenes from the watch history",
    run: async () => {
      const users = await prisma.$queryRaw<Array<{ userId: number }>>`
        SELECT DISTINCT userId FROM UserEntityRanking WHERE entityType = 'scene'
      `;
      let rows = 0;
      for (const { userId } of users) {
        const { count } = await dbWrite("rankings.dropScenes", () =>
          prisma.userEntityRanking.deleteMany({
            where: { userId, entityType: "scene" },
          })
        );
        rows += count;
      }
      logger.info("[Migration 007] Dropped the stored scene rankings", {
        users: users.length,
        rows,
      });
    },
  },
  // Deleting a user left their rows in the four per-user tables with no
  // relation to User; deleteUser now deletes them with the user
  {
    name: "008_delete_orphaned_user_rows",
    description:
      "Delete the stats and rankings of users that no longer exist (UserPerformerStats, UserStudioStats, UserTagStats, UserEntityRanking)",
    run: async () => {
      const deleted = await deleteOrphanedUserRows();
      logger.info(
        "[Migration 008] Deleted the stats and rankings of deleted users",
        deleted
      );
    },
  },
  // Filter input the contract does not know is dropped for one release and
  // refused from the next (item 38), so what users saved is tidied once
  // while it is still only ignored
  {
    name: "009_clean_stored_filters",
    description:
      "Clean saved filter presets and custom carousel rules against the filter contract: unknown keys and invalid modifiers removed, unknown sorts reset, per page held to 250, ids saved before multi-instance support tied to their one server",
    run: async () => {
      const summary = await cleanStoredFilters();
      logger.info(
        `${MIGRATION_009} Cleaned saved filter presets and carousel rules`,
        { ...summary }
      );
    },
  },
  // The card counts become Peek's live link counts (item 36): sync stopped
  // overwriting them with Stash's numbers, whose entity counts lag the
  // junction rows, and StashTag.sceneCountAll (migration 20260930000200)
  // holds the old card number until counted. After the startup sync, like
  // every entry, so the counts are of the synced library
  {
    name: "010_rebuild_link_counts",
    description:
      "Count every performer's, studio's, tag's, collection's and gallery's links from the synced library, so each card shows what the page behind it lists",
    run: async () => {
      const startTime = Date.now();
      // Compare-and-set: a sync that commits between this rebuild's reads
      // and its writes has stored a newer count, which stands
      const written = await linkCountService.rebuildLinkCounts("all", {
        onlyIfUnchanged: true,
      });
      logger.info("[Migration 010] Rebuilt the link counts", {
        durationMs: Date.now() - startTime,
        written,
      });
    },
  },
  // Each user's recompute now stores their excluded links per entity
  // (UserExcludedContentCount, migration 20260930000300), which the cards
  // subtract from the link counts: every user is recomputed once so the
  // table exists for all of them. The same pass rewrites, per instance,
  // any exclusion rows still stored for every instance ('') from before
  // the per-instance compute.
  recomputeExclusionsMigration(
    "011_recompute_exclusions_content_counts",
    "Recompute every user's exclusions so each card's count leaves out what the user cannot see (UserExcludedContentCount), and rewrite any exclusion rows still stored for every instance per instance",
    "the per-user card counts"
  ),
  // Saved presets are Views now and custom carousels store a tree of rows and
  // groups (PR 9b). Readers keep both shapes, so this tidies what is stored
  // once; it runs after the server listens, like every entry
  {
    name: "012_views_and_carousel_trees",
    description:
      "Store custom carousel rules as a tree, saved filter presets as canonical Views (a multi row's value as a list, ids tied to their server), and drop default presets naming a View that no longer exists",
    run: async () => {
      const summary = await migrateStoredFiltersToTrees();
      logger.info(
        `${MIGRATION_012} Moved saved Views and carousels to their canonical form`,
        { ...summary }
      );
    },
  },
  // Stash answers a collection with no date as "0001-01-01", which sync
  // stored and the cards showed; sync now stores it as NULL, and this
  // clears what earlier syncs stored
  {
    name: "013_clear_year_one_dates",
    description:
      "Clear the year-1 dates (0001-01-01) Stash answers for an entity with no date, so collections without a date show, sort and filter as undated",
    run: async () => {
      const cleared = await clearYearOneDates();
      logger.info("[Migration 013] Cleared the year-1 dates", cleared);
    },
  },
];

class DataMigrationService {
  /**
   * Run all pending migrations
   * Called once on server startup
   */
  async runPendingMigrations(): Promise<void> {
    try {
      logger.info("[DataMigration] Checking for pending migrations");

      // Get list of already-applied migrations
      const appliedMigrations = await prisma.dataMigration.findMany({
        select: { name: true },
      });
      const appliedMigrationNames = new Set(
        appliedMigrations.map((m) => m.name)
      );

      // Filter to only pending migrations
      const pendingMigrations = migrations.filter(
        (m) => !appliedMigrationNames.has(m.name)
      );

      if (pendingMigrations.length === 0) {
        logger.info("[DataMigration] No pending migrations");
        return;
      }

      logger.info("[DataMigration] Found pending migrations", {
        count: pendingMigrations.length,
        migrations: pendingMigrations.map((m) => m.name),
      });

      // Run each pending migration
      for (const migration of pendingMigrations) {
        logger.info("[DataMigration] Running migration", {
          name: migration.name,
          description: migration.description,
        });

        const startTime = Date.now();

        try {
          await migration.run();

          // Mark migration as applied
          await prisma.dataMigration.create({
            data: { name: migration.name },
          });

          const duration = Date.now() - startTime;
          logger.info("[DataMigration] Migration completed", {
            name: migration.name,
            durationMs: duration,
          });
        } catch (error) {
          logger.error("[DataMigration] Migration failed", {
            name: migration.name,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          // Don't mark as applied if it failed
          // Will retry on next server start
          throw error; // Propagate error to prevent server startup
        }
      }

      logger.info("[DataMigration] All pending migrations completed");
    } catch (error) {
      logger.error("[DataMigration] Fatal error running migrations", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Get list of applied migrations (for admin UI)
   */
  async getAppliedMigrations() {
    return await prisma.dataMigration.findMany({
      orderBy: { appliedAt: "asc" },
    });
  }
}

export const dataMigrationService = new DataMigrationService();
export default dataMigrationService;
