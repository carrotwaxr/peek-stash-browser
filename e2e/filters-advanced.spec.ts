import {
  type APIRequestContext,
  type Locator,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import { requireData } from "./support/data";
import { addRow, pickValues, setCondition } from "./support/filterRows";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";

/**
 * E2E tests for the Advanced view (item 64, #425): rows and groups in a
 * dialog that sends nothing until Apply, with the list answering the tree.
 * The expected totals are worked out here from the library's own scenes, so
 * the list's answer is checked against the rows, not against itself.
 *
 * The URL form is the flat prefixed state: `g1=all&g1.tagIds=...&g1.2.tagIds=...`.
 */

interface TagRef {
  id: string;
  instanceId: string;
  name: string;
}

interface SceneRow {
  id: string;
  instanceId: string;
  title: string;
}

interface Leaf {
  field: string;
  criterion: { value?: string[]; modifier?: string };
}

const refOf = (tag: TagRef) => `${tag.id}:${tag.instanceId}`;

/** The scene lists' endpoint, as the page calls it */
const isSceneList = (url: string, method: string) =>
  new URL(url).pathname === "/api/library/scenes" && method === "POST";

/** The tags that hold scenes, most scenes first */
async function sceneTags(api: APIRequestContext): Promise<TagRef[]> {
  const response = await mustOk(
    await api.post("/api/library/tags", {
      data: {
        filter: { per_page: 250, sort: "scenes_count", direction: "DESC" },
      },
    }),
    "POST /api/library/tags"
  );
  const { findTags } = (await response.json()) as {
    findTags: { tags: Array<TagRef & { scene_count?: number }> };
  };
  return findTags.tags.filter((tag) => (tag.scene_count ?? 0) > 0);
}

/** A rule on one Tags leaf, as the list request carries it */
const tagLeaf = (tags: readonly TagRef[], modifier: string) => ({
  field: "tags",
  criterion: { value: tags.map(refOf), modifier },
});

/**
 * The scenes holding one tag, as the server lists them for that single rule:
 * the building block the expected totals are worked out from. (A list row
 * carries only some of its scene's tags, so the rows cannot be read for them.)
 */
async function scenesWith(
  api: APIRequestContext,
  tag: TagRef
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const response = await mustOk(
      await api.post("/api/library/scenes", {
        data: {
          filter: { per_page: 250, page, sort: "title", direction: "ASC" },
          where: { match: "all", rules: [tagLeaf([tag], "INCLUDES")] },
        },
      }),
      "POST /api/library/scenes"
    );
    const { findScenes } = (await response.json()) as {
      findScenes: { scenes: SceneRow[] };
    };
    for (const scene of findScenes.scenes) {
      ids.add(`${scene.id}:${scene.instanceId}`);
    }
    if (findScenes.scenes.length < 250) break;
  }
  return ids;
}

const intersect = (x: ReadonlySet<string>, y: ReadonlySet<string>) =>
  new Set([...x].filter((id) => y.has(id)));
const union = (x: ReadonlySet<string>, y: ReadonlySet<string>) =>
  new Set([...x, ...y]);

/** The rule leaves of a request's `where`, groups walked */
function leavesOf(body: unknown): Leaf[] {
  const walk = (node: unknown): Leaf[] => {
    if (typeof node !== "object" || node === null) return [];
    const { rules, field } = node as { rules?: unknown[]; field?: unknown };
    if (Array.isArray(rules)) return rules.flatMap(walk);
    return typeof field === "string" ? [node as Leaf] : [];
  };
  return walk((body as { where?: unknown } | null)?.where);
}

const tagLeaves = (body: unknown) =>
  leavesOf(body).filter((leaf) => leaf.field === "tags");

/** The total the list shows: "Showing 1-24 of N records", else the empty state */
async function shownTotal(page: Page, list: ListPage): Promise<number> {
  const info = page.getByText(/of [\d,]+ records/).first();
  await expect(info.or(list.emptyState)).toBeVisible({ timeout: 15_000 });
  if (await list.emptyState.isVisible()) return 0;
  const text = (await info.textContent()) ?? "";
  return Number(/of ([\d,]+) records/.exec(text)?.[1]?.replace(/,/g, ""));
}

/** The list settles on this total (a page change shows the old one until the answer) */
async function expectShown(page: Page, list: ListPage, total: number) {
  await expect
    .poll(() => shownTotal(page, list), { timeout: 15_000 })
    .toBe(total);
}

/** The same request the page sent, asked for again with a total */
async function totalOf(api: APIRequestContext, body: unknown) {
  const request = structuredClone(body) as {
    filter?: Record<string, unknown>;
  };
  delete request.filter?.["count"];
  const response = await mustOk(
    await api.post("/api/library/scenes", { data: request }),
    "POST /api/library/scenes"
  );
  return ((await response.json()) as { findScenes: { count: number } })
    .findScenes.count;
}

test.describe("Advanced filters", () => {
  const created: number[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of created.splice(0)) {
      await deleteUser(request, id);
    }
  });

  test("item 64: two Tags rows in one group narrow the list", async ({
    page,
  }) => {
    const tags = await sceneTags(page.request);
    const [a, b, c, d] = requireData(
      tags.length >= 4
        ? (tags.slice(0, 4) as [TagRef, TagRef, TagRef, TagRef])
        : null,
      "four tags on scenes"
    );
    const [inA, inB, inC, inD] = (await Promise.all(
      [a, b, c, d].map((tag) => scenesWith(page.request, tag))
    )) as [Set<string>, Set<string>, Set<string>, Set<string>];
    const expected = intersect(intersect(inA, inB), union(inC, inD)).size;
    expect(expected).toBeGreaterThan(0);
    // Narrower than the first row alone
    expect(expected).toBeLessThan(intersect(inA, inB).size);

    const list = new ListPage(page);
    await list.goto("/scenes");
    await list.waitForResults("Scene");
    const dialog = await list.openAdvanced();

    // Group 1 (Match all): Tags has ALL of A and B, Tags has ANY of C and D
    await dialog.getByRole("button", { name: "Add group" }).click();
    await expect(dialog.getByRole("group", { name: "Group 1" })).toBeVisible();
    const first = await addRow(dialog, "Group 1", "Tags");
    await expect(first.condition).toHaveValue("INCLUDES_ALL");
    await pickValues(page, dialog, first, [a.name, b.name]);
    const second = await addRow(dialog, "Group 1", "Tags");
    await setCondition(second, "Has ANY of these");
    await pickValues(page, dialog, second, [c.name, d.name]);

    // Nothing was sent while editing; Apply sends both rows
    const sent = page.waitForRequest(
      (request) =>
        isSceneList(request.url(), request.method()) &&
        tagLeaves(request.postDataJSON()).length === 2
    );
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(list.advancedDialog).toHaveCount(0);
    const body = (await sent).postDataJSON() as unknown;

    const leaves = tagLeaves(body);
    expect(leaves[0]?.criterion.modifier).toBe("INCLUDES_ALL");
    expect(leaves[0]?.criterion.value).toEqual([refOf(a), refOf(b)]);
    expect(leaves[1]?.criterion.modifier).toBe("INCLUDES");
    expect(leaves[1]?.criterion.value).toEqual([refOf(c), refOf(d)]);

    // The URL holds the group, the second row as the group's 2nd Tags row
    const params = new URL(page.url()).searchParams;
    expect(params.get("g1")).toBe("all");
    expect(params.get("g1.tagIds")).toBe(`${refOf(a)},${refOf(b)}`);
    expect(params.get("g1.2.tagIds")).toBe(`${refOf(c)},${refOf(d)}`);
    expect(params.get("g1.2.tagIdsModifier")).toBe("INCLUDES");

    // The shown total is the rows' own: the same request asked directly, and
    // the scenes that hold A and B and (C or D)
    await expectShown(page, list, expected);
    expect(await totalOf(page.request, body)).toBe(expected);

    // A reload shows the same chip and the same two rows
    await page.reload();
    await expect(
      page.getByRole("button", { name: /^Edit filter group/ })
    ).toHaveCount(1);
    await expectShown(page, list, expected);
    const again = await list.openAdvanced();
    await expect(again.locator('select[id$="-field"]')).toHaveCount(2);
    await expect(again.getByRole("button", { name: /^Tags: / })).toHaveCount(2);
    for (const tag of [a, b, c, d]) {
      await expect(
        again.getByRole("button", { name: `Remove ${tag.name}` })
      ).toHaveCount(1);
    }
  });

  test("a value box's clear button stays on the chip's line, narrow or wide", async ({
    page,
  }) => {
    const tag = requireData((await sceneTags(page.request))[0], "a tag");
    // The middle of a button's box, which the page lays out
    const middleOf = async (button: Locator) => {
      const box = await button.boundingBox();
      if (!box) throw new Error("the button has no box");
      return box.y + box.height / 2;
    };
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 720 });
      const list = new ListPage(page);
      await list.goto("/scenes");
      await list.waitForResults("Scene");
      const dialog = await list.openAdvanced();
      const row = await addRow(dialog, "top level", "Tags");
      await pickValues(page, dialog, row, [tag.name]);

      const chip = dialog.getByRole("button", { name: `Remove ${tag.name}` });
      const clear = dialog.getByRole("button", {
        name: "Clear all selections",
      });

      // One line: the two buttons' middles are within a few pixels
      expect(
        Math.abs((await middleOf(clear)) - (await middleOf(chip))),
        `at ${width}px`
      ).toBeLessThan(8);
    }
  });

  test("a Match any group widens within the AND", async ({ page }) => {
    const tags = await sceneTags(page.request);
    const [every, a, b] = requireData(
      tags.length >= 3 ? (tags.slice(0, 3) as [TagRef, TagRef, TagRef]) : null,
      "three tags on scenes"
    );
    const [inEvery, inA, inB] = (await Promise.all(
      [every, a, b].map((tag) => scenesWith(page.request, tag))
    )) as [Set<string>, Set<string>, Set<string>];
    const expected = intersect(inEvery, union(inA, inB)).size;
    expect(expected).toBeGreaterThan(0);
    // Wider than either arm alone
    expect(expected).toBeGreaterThan(intersect(inEvery, inA).size);

    const list = new ListPage(page);
    await list.goto("/scenes");
    await list.waitForResults("Scene");
    const dialog = await list.openAdvanced();

    // Top level: Tags has ALL of E. Group 1 (Match any): Tags A, Tags B
    const root = await addRow(dialog, "top level", "Tags");
    await pickValues(page, dialog, root, [every.name]);
    await dialog.getByRole("button", { name: "Add group" }).click();
    await dialog.getByLabel("Match for Group 1").selectOption("any");
    for (const tag of [a, b]) {
      const row = await addRow(dialog, "Group 1", "Tags");
      await setCondition(row, "Has ANY of these");
      await pickValues(page, dialog, row, [tag.name]);
    }

    // The two rows read as one
    await expect(
      dialog.getByText(
        `These Tags rows combine into one: any of ${a.name}, ${b.name}`
      )
    ).toBeVisible();

    const sent = page.waitForRequest(
      (request) =>
        isSceneList(request.url(), request.method()) &&
        tagLeaves(request.postDataJSON()).length === 2
    );
    await dialog.getByRole("button", { name: "Apply" }).click();
    const body = (await sent).postDataJSON() as unknown;

    // One Tags row in the group, with both ids, beside the top level's
    const leaves = tagLeaves(body);
    expect(leaves[0]?.criterion.value).toEqual([refOf(every)]);
    expect(leaves[1]?.criterion.modifier).toBe("INCLUDES");
    expect(leaves[1]?.criterion.value).toEqual([refOf(a), refOf(b)]);
    const params = new URL(page.url()).searchParams;
    expect(params.get("g1")).toBe("any");
    expect(params.get("g1.tagIds")).toBe(`${refOf(a)},${refOf(b)}`);
    expect(params.get("g1.2.tagIds")).toBeNull();

    // E AND (A OR B): wider than A alone, within E
    await expectShown(page, list, expected);
    expect(await totalOf(page.request, body)).toBe(expected);
  });

  test("closing with changes asks; Discard leaves the list as it was", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto("/scenes");
    await list.waitForResults("Scene");
    const before = await shownTotal(page, list);
    const urlBefore = page.url();
    const dialog = await list.openAdvanced();

    // Closed untouched, it just closes
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(list.advancedDialog).toHaveCount(0);

    // A change, then Cancel: the question; Keep editing stays
    const reopened = await list.openAdvanced();
    const row = await addRow(reopened, "top level", "Title Search");
    await row.value.fill("zzz-never-applied");
    await reopened.getByRole("button", { name: "Cancel" }).click();
    const ask = page.getByRole("dialog", { name: "Discard changes?" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Keep editing" }).click();
    await expect(ask).toHaveCount(0);
    await expect(row.value).toHaveValue("zzz-never-applied");

    // Escape asks too, and Discard closes with the list untouched
    await page.keyboard.press("Escape");
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Discard" }).click();
    await expect(list.advancedDialog).toHaveCount(0);
    expect(page.url()).toBe(urlBefore);
    await expectShown(page, list, before);
  });

  test("the limits: 20 rows, then the limit text, and Apply still works", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto("/scenes");
    await list.waitForResults("Scene");
    const dialog = await list.openAdvanced();

    for (let n = 1; n <= 20; n++) {
      const row = await addRow(dialog, "top level", "Title Search");
      await row.value.fill(`${n}`);
    }

    // The waiting row is replaced by the limit text
    await expect(
      dialog.getByText("20 of 20 rules. Remove one to add another.")
    ).toBeVisible();
    await expect(dialog.getByLabel("Add a filter to top level")).toHaveCount(0);
    await expect(dialog.getByLabel("Add a filter to Group 1")).toHaveCount(0);

    // At the limit Apply goes through: all 20 rows are sent and answered
    const sent = page.waitForRequest(
      (request) =>
        isSceneList(request.url(), request.method()) &&
        leavesOf(request.postDataJSON()).length === 20
    );
    const answered = page.waitForResponse(
      (response) =>
        isSceneList(response.url(), response.request().method()) &&
        leavesOf(response.request().postDataJSON()).length === 20
    );
    await dialog.getByRole("button", { name: "Apply" }).click();
    await sent;
    expect((await answered).status()).toBe(200);
    await expect(list.advancedDialog).toHaveCount(0);
    const params = new URL(page.url()).searchParams;
    expect(params.get("title")).toBe("1");
    expect(params.get("20.title")).toBe("20");
  });

  test("a hidden scene never appears through a Match any group", async ({
    browser,
    baseURL,
    request,
  }) => {
    // Hiding is per-user state: a throwaway user of its own
    const user = await createUser(request, "adv-hidden");
    created.push(user.id);
    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      // The three tags with the fewest scenes, so one page holds the group
      const fewest = (await sceneTags(context.request)).slice(-3);
      requireData(fewest.length === 3 ? fewest : null, "three tags on scenes");
      const [a, b, c] = fewest as [TagRef, TagRef, TagRef];

      // group(any){ Tags ANY [A]; Tags ALL [B, C] }: the arms do not merge
      const arm = (value: string[], modifier: string) => ({
        field: "tags",
        criterion: { value, modifier },
      });
      const where = {
        match: "all",
        rules: [
          {
            match: "any",
            rules: [
              arm([refOf(a)], "INCLUDES"),
              arm([refOf(b), refOf(c)], "INCLUDES_ALL"),
            ],
          },
        ],
      };
      const ask = async (rules: unknown) =>
        (await (
          await mustOk(
            await context.request.post("/api/library/scenes", {
              data: {
                filter: { per_page: 250, sort: "title", direction: "ASC" },
                where: rules,
              },
            }),
            "POST /api/library/scenes"
          )
        ).json()) as { findScenes: { count: number; scenes: SceneRow[] } };

      // A scene the first arm matches, and the group's total before the hide
      const matchedByA = requireData(
        (await ask({ match: "all", rules: [arm([refOf(a)], "INCLUDES")] }))
          .findScenes.scenes[0],
        "a scene with the first tag"
      );
      const before = (await ask(where)).findScenes;
      expect(before.scenes.map((scene) => scene.id)).toContain(matchedByA.id);

      await mustOk(
        await context.request.post("/api/user/hidden-entities", {
          data: {
            entityType: "scene",
            entityId: matchedByA.id,
            instanceId: matchedByA.instanceId,
          },
        }),
        "Hiding a scene"
      );

      // The same group, built in the Advanced view and applied
      const page = await context.newPage();
      const list = new ListPage(page);
      await list.goto("/scenes?per_page=200");
      await list.waitForResults("Scene");
      const dialog = await list.openAdvanced();
      await dialog.getByRole("button", { name: "Add group" }).click();
      await dialog.getByLabel("Match for Group 1").selectOption("any");
      const first = await addRow(dialog, "Group 1", "Tags");
      await setCondition(first, "Has ANY of these");
      await pickValues(page, dialog, first, [a.name]);
      const second = await addRow(dialog, "Group 1", "Tags");
      await pickValues(page, dialog, second, [b.name, c.name]);

      const answered = page.waitForResponse(
        (response) =>
          isSceneList(response.url(), response.request().method()) &&
          tagLeaves(response.request().postDataJSON()).length === 2
      );
      await dialog.getByRole("button", { name: "Apply" }).click();
      const answer = (await (await answered).json()) as {
        findScenes: { count: number; scenes: SceneRow[] };
      };

      // One fewer than before the hide, and the hidden scene is nowhere
      expect(answer.findScenes.count).toBe(before.count - 1);
      expect(answer.findScenes.scenes.map((scene) => scene.id)).not.toContain(
        matchedByA.id
      );
      await expectShown(page, list, before.count - 1);
      await expect(list.cards("Scene")).toHaveCount(before.count - 1);
      await expect(
        page.locator(`a[href="/scene/${matchedByA.id}"]`)
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("on Clips, a Match any group of two clip tags lists their union", async ({
    page,
  }) => {
    // The replay's clips share one tag (their primary tag): the second tag
    // holds none. Match any lists the first tag's clips; Match all, the
    // clips holding both, none.
    const clips = await mustOk(
      await page.request.post("/api/library/clips", {
        data: { filter: { per_page: 250 } },
      }),
      "POST /api/library/clips"
    );
    const { clips: rows, total } = (await clips.json()) as {
      clips: Array<{ primaryTag: TagRef | null }>;
      total: number;
    };
    const first = requireData(rows[0]?.primaryTag, "a clip with a primary tag");
    const held = rows.filter((row) => row.primaryTag?.id === first.id).length;
    const second = requireData(
      (await sceneTags(page.request)).find((tag) => tag.id !== first.id),
      "a second tag"
    );
    expect(total).toBeGreaterThanOrEqual(held);

    const list = new ListPage(page);
    await list.goto("/clips");
    await expect(list.advancedButton).toBeVisible({ timeout: 15_000 });
    const dialog = await list.openAdvanced();
    await dialog.getByRole("button", { name: "Add group" }).click();
    await dialog.getByLabel("Match for Group 1").selectOption("any");
    for (const tag of [first, second]) {
      const row = await addRow(dialog, "Group 1", "Clip Tags");
      await pickValues(page, dialog, row, [tag.name]);
    }
    await expect(
      dialog.getByText(
        `These Clip Tags rows combine into one: any of ${first.name}, ${second.name}`
      )
    ).toBeVisible();

    const isWhere = (request: {
      url(): string;
      method(): string;
      postDataJSON(): unknown;
    }) =>
      new URL(request.url()).pathname === "/api/library/clips" &&
      request.method() === "POST" &&
      JSON.stringify(request.postDataJSON()).includes('"where"');
    const anyAnswer = page.waitForResponse((response) =>
      isWhere(response.request())
    );
    await dialog.getByRole("button", { name: "Apply" }).click();
    expect(((await (await anyAnswer).json()) as { total: number }).total).toBe(
      held
    );
    expect(new URL(page.url()).searchParams.get("g1")).toBe("any");

    // One Clip Tags row with both tags (the merge), as the URL holds it
    const params = new URL(page.url()).searchParams;
    expect(params.get("g1.tagIds")?.split(",")).toHaveLength(2);
    expect(params.get("g1.2.tagIds")).toBeNull();

    // The same two rows under Match all hold no clip: the union is Match any's
    const leaf = (tag: TagRef) => ({
      field: "tags",
      criterion: { value: [refOf(tag)], modifier: "INCLUDES" },
    });
    const both = await mustOk(
      await page.request.post("/api/library/clips", {
        data: {
          filter: { per_page: 1 },
          where: { match: "all", rules: [leaf(first), leaf(second)] },
        },
      }),
      "POST /api/library/clips"
    );
    expect(((await both.json()) as { total: number }).total).toBe(0);
  });
});
