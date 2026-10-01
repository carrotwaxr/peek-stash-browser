/**
 * Renders a detail page against a stubbed server: the real `libraryApi`, the
 * real query client and the real lookup, with `fetch` answering the routes a
 * detail page asks. A case then asserts what the page renders and what it
 * sends, which stays true whichever hooks the page is built on.
 *
 * The children that are not the subject and the contexts the pages read are
 * module mocks each test file declares (`./detailPageMocks`).
 */
import type { ComponentType } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { GetUserSettingsResponse } from "@peek/shared-types";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import {
  type ApiStub,
  initializingResponse,
  jsonResponse,
  requestsTo,
  stubApi,
} from "@tests/helpers/stubApi";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { createQueryClient } from "@/api/queryClient";
import GalleryDetail from "@/components/pages/GalleryDetail";
import GroupDetail from "@/components/pages/GroupDetail";
import PerformerDetail from "@/components/pages/PerformerDetail";
import StudioDetail from "@/components/pages/StudioDetail";
import TagDetail from "@/components/pages/TagDetail";

export { requestsTo };

export type DetailType = "performer" | "studio" | "tag" | "group" | "gallery";

/** Each page: its list endpoint (the lookup's), its result key and its route param */
const PAGES: Record<
  DetailType,
  { plural: string; result: string; param: string; Page: ComponentType }
> = {
  performer: {
    plural: "performers",
    result: "findPerformers",
    param: "performerId",
    Page: PerformerDetail,
  },
  studio: {
    plural: "studios",
    result: "findStudios",
    param: "studioId",
    Page: StudioDetail,
  },
  tag: { plural: "tags", result: "findTags", param: "tagId", Page: TagDetail },
  group: {
    plural: "groups",
    result: "findGroups",
    param: "groupId",
    Page: GroupDetail,
  },
  gallery: {
    plural: "galleries",
    result: "findGalleries",
    param: "galleryId",
    Page: GalleryDetail,
  },
};

type Answer = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** An answer that never comes: the request stays in flight */
const pending: Answer = () => new Promise<Response>(() => {});

export type LookupState =
  | "found"
  | "notFound"
  | "ambiguous"
  | "error"
  | "initializing"
  | "loading";

export interface DetailPageOptions {
  /** The entity the lookup finds (default: id 5 on `inst-b`, named Thing) */
  entity?: Record<string, unknown>;
  /**
   * What the lookup answers: the entity; an empty list; a 400 listing the
   * id on two servers; a 500 "Down"; a 503 `ready: false` once, then the
   * entity; or nothing yet (default "found")
   */
  lookup?: LookupState;
  /**
   * What the tab counts answer: these counts; nothing yet ("loading"); a
   * 500 "Counts are down" ("error"); or an answer of the case's own
   * (default: no counts)
   */
  counts?: Record<string, number> | "loading" | "error" | Answer;
  /** The viewer's settings (`GET /user/settings`), over the server's defaults */
  settings?: Partial<GetUserSettingsResponse["settings"]>;
  /** The status `PUT /ratings/<type>/<id>` answers (default 200) */
  ratingAnswer?: number;
}

export const DEFAULT_ENTITY: Record<string, unknown> = {
  id: "5",
  instanceId: "inst-b",
  name: "Thing",
  title: "Thing",
};

let latestApi: ApiStub | undefined;

/** The URL's id segment: `/tag/5?x` is "5" */
function idInUrl(url: string): string {
  const segment = new URL(url, "http://peek.test").pathname.split("/")[2];
  if (segment === undefined) throw new Error(`No id in ${url}`);
  return decodeURIComponent(segment);
}

function countsAnswer(counts: DetailPageOptions["counts"]): Answer {
  if (counts === undefined) return () => jsonResponse(200, { counts: {} });
  if (counts === "loading") return pending;
  if (counts === "error") {
    return () => jsonResponse(500, { error: "Counts are down" });
  }
  if (typeof counts === "function") return counts;
  return () => jsonResponse(200, { counts });
}

function lookupAnswer(
  type: DetailType,
  state: LookupState,
  entity: Record<string, unknown>
): Answer {
  const { plural, result } = PAGES[type];
  const list = (rows: Record<string, unknown>[]) =>
    jsonResponse(200, { [result]: { [plural]: rows, count: rows.length } });
  switch (state) {
    case "found":
      return () => list([entity]);
    case "notFound":
      return () => list([]);
    case "ambiguous":
      return () =>
        jsonResponse(400, {
          error: "This id is on more than one server",
          matches: [
            { id: entity.id, instanceId: "inst-a", name: "Thing on A" },
            { id: entity.id, instanceId: "inst-b", name: "Thing on B" },
          ],
        });
    case "error":
      return () => jsonResponse(500, { error: "Down" });
    case "initializing": {
      let calls = 0;
      return () => (calls++ === 0 ? initializingResponse() : list([entity]));
    }
    case "loading":
      return pending;
  }
}

/**
 * Renders the `type` detail page at `url` (`/tag/5?tab=images`) with fetch
 * stubbed: the lookup (`POST /library/<entities>`), the tab counts
 * (`GET /library/<entities>/<id>/counts`), the rating and favorite write
 * (`PUT /ratings/<type>/<id>`), the library's readiness, the images list
 * (`POST /library/images`, empty), the filter presets and the settings.
 * Any other request rejects, naming it. Undo with `vi.unstubAllGlobals()`.
 */
export function renderDetailPage(
  type: DetailType,
  url: string,
  options: DetailPageOptions = {}
): ReturnType<typeof render> & { api: ApiStub; queryClient: QueryClient } {
  const { plural, param, Page } = PAGES[type];
  const entity = options.entity ?? DEFAULT_ENTITY;
  const id = idInUrl(url);
  const entityId = typeof entity.id === "string" ? entity.id : id;

  const api = stubApi({
    [`/library/${plural}`]: lookupAnswer(
      type,
      options.lookup ?? "found",
      entity
    ),
    [`/library/${plural}/${encodeURIComponent(id)}/counts`]: countsAnswer(
      options.counts
    ),
    [`/ratings/${type}/${entityId}`]: () =>
      jsonResponse(options.ratingAnswer ?? 200, { success: true }),
    "/library/ready": () => jsonResponse(200, { ready: true }),
    "/library/images": () =>
      jsonResponse(200, { findImages: { images: [], count: 0 } }),
    "/user/filter-presets": () => jsonResponse(200, { presets: {} }),
    "/user/default-presets": () => jsonResponse(200, { defaults: {} }),
    "/user/settings": () =>
      jsonResponse(200, userSettingsResponse(options.settings)),
  });
  latestApi = api;

  const queryClient = createQueryClient();
  // The URL's query, for `currentSearch()`
  const CurrentSearch = () => (
    <output data-testid="search">{useLocation().search}</output>
  );
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={`/${type}/:${param}`} element={<Page />} />
        </Routes>
        <CurrentSearch />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...result, api, queryClient };
}

/** The current URL's query, as an object */
export function currentSearch(): Record<string, string> {
  return Object.fromEntries(
    new URLSearchParams(screen.getByTestId("search").textContent ?? "")
  );
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

/** The JSON body of each request to `path` (after `/api`), in order */
export function bodiesTo(
  path: string,
  api: ApiStub | undefined = latestApi
): Record<string, unknown>[] {
  if (!api) throw new Error("No page rendered: call renderDetailPage first");
  return api.mock.calls
    .filter(([url]) => url.replace(/^\/api/, "").split("?")[0] === path)
    .map(([url, init]) => {
      if (typeof init?.body !== "string") {
        throw new Error(`The request to ${url} has no JSON body`);
      }
      const body: unknown = JSON.parse(init.body);
      return asRecord(body, `The body sent to ${url}`);
    });
}

/** The JSON body of the last request to `path` (after `/api`) */
export function lastBody(
  path: string,
  api: ApiStub | undefined = latestApi
): Record<string, unknown> {
  const body = bodiesTo(path, api).at(-1);
  if (!body) throw new Error(`No request to ${path}`);
  return body;
}
