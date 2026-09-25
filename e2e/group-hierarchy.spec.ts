import { expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";

/**
 * The collection hierarchy (item 58).
 *
 * A collection's page lists the collections it is part of and its
 * sub-collections, with Stash's description of each link; its card counts the
 * sub-collections, and that count opens the Collections list filtered to
 * them. The replay library has one such collection (G): in P, described "Box
 * set", and containing C, described "Part 2" (stash-replay/extend.ts). The
 * subjects come from the API, so a dev-stack library without a hierarchy
 * skips.
 */

interface GroupRelationRef {
  group: { id: string; name: string; instanceId: string };
  description: string | null;
}

interface GroupRow {
  id: string;
  instanceId: string;
  name: string;
  sub_group_count?: number;
  containing_groups?: GroupRelationRef[];
  sub_groups?: GroupRelationRef[];
}

interface FindGroupsBody {
  findGroups: { groups: GroupRow[] };
}

test("G's page shows Part Of with P and Sub-Collections with C; G's card shows 1 sub-collection and opening it lists only C", async ({
  page,
}) => {
  const listed = await page.request.post("/api/library/groups", {
    data: { filter: { per_page: 500, sort: "name", direction: "ASC" } },
  });
  expect(listed.ok(), await listed.text()).toBeTruthy();
  const rows = ((await listed.json()) as FindGroupsBody).findGroups.groups;

  // G: a collection inside another, with exactly one sub-collection
  let subject:
    | { group: GroupRow; parent: GroupRelationRef; child: GroupRelationRef }
    | undefined;
  for (const row of rows.filter((each) => each.sub_group_count === 1)) {
    const found = await page.request.post("/api/library/groups", {
      data: { ids: [row.id], group_filter: { instance_id: row.instanceId } },
    });
    expect(found.ok(), await found.text()).toBeTruthy();
    const [group] = ((await found.json()) as FindGroupsBody).findGroups.groups;
    const parent = group?.containing_groups?.[0];
    const child = group?.sub_groups?.[0];
    if (group && parent && child) {
      subject = { group, parent, child };
      break;
    }
  }
  const { group, parent, child } = requireData(
    subject,
    "a collection inside another, with one sub-collection"
  );

  await page.goto(
    `/collection/${group.id}?instance=${encodeURIComponent(group.instanceId)}`
  );
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(
    group.name,
    { timeout: 10_000 }
  );

  // Each section is the card its heading titles
  const section = (title: string) =>
    page
      .locator("div", {
        has: page.getByRole("heading", { name: title, exact: true }),
      })
      .last();
  for (const [title, link] of [
    ["Part Of", parent],
    ["Sub-Collections", child],
  ] as const) {
    const links = section(title).getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links).toContainText(link.group.name);
    await expect(links).toContainText(link.description ?? "");
    await expect(links).toHaveAttribute(
      "href",
      new RegExp(`^/collection/${link.group.id}(\\?|$)`)
    );
  }

  const list = new ListPage(page);
  await list.goto("/collections");
  await list.waitForResults("Group");
  const card = list.cards("Group").filter({
    has: page.locator(".card-title").getByText(group.name, { exact: true }),
  });
  await expect(card).toHaveCount(1);
  // The sub-collection count: the collections icon and the number beside it
  const subCollections = card.locator(
    ".card-indicator-icon:has(svg.lucide-film) + .card-indicator-text"
  );
  await expect(subCollections).toHaveText("1");

  await subCollections.click();
  await expect(page).toHaveURL(new RegExp(`[?&]groupId=${group.id}(&|$)`));
  await expect(list.cards("Group")).toHaveCount(1, { timeout: 10_000 });
  await expect(list.cards("Group").locator(".card-title")).toHaveText(
    child.group.name
  );
});
