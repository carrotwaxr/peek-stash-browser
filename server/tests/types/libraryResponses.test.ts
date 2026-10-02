/**
 * Type-level tests for the library list requests and responses and the group
 * membership responses (TT-A7). They run in `npm run typecheck:tests`; at run
 * time each case is empty.
 *
 * A list request carries its entity's filter as the contract in
 * `shared/types/filters` declares it; every list row carries the View in Stash
 * link, `null` for a user who is not an admin; and a user's groups come back
 * as typed rows, not `unknown[]`.
 */
import type {
  ImageFilterInput,
  ListRequestInput,
  SceneFilterInput,
} from "@peek/shared-types/filters/index.js";
import { describe, expectTypeOf, it } from "vitest";
import type { getUserGroups } from "../../controllers/groups.js";
import type { getUserGroupMemberships } from "../../controllers/user.js";
import type {
  ApiErrorResponse,
  FindGalleriesResponse,
  FindGroupsResponse,
  FindImagesRequest,
  FindImagesResponse,
  FindPerformersRequest,
  FindPerformersResponse,
  FindScenesRequest,
  FindScenesResponse,
  FindStudiosResponse,
  FindTagsResponse,
  GetCurrentUserGroupsResponse,
  GetUserGroupMembershipsResponse,
  UserGroupSummary,
} from "../../types/api/index.js";
import type { ResBody } from "../helpers/controllerTestUtils.js";

describe("library list requests", () => {
  it("a list request is the contract's request for its entity", () => {
    expectTypeOf<FindScenesRequest>().toEqualTypeOf<
      ListRequestInput<"scene">
    >();
    expectTypeOf<FindScenesRequest["scene_filter"]>().toEqualTypeOf<
      SceneFilterInput | undefined
    >();
    expectTypeOf<FindImagesRequest["image_filter"]>().toEqualTypeOf<
      ImageFilterInput | undefined
    >();
    expectTypeOf<FindPerformersRequest>().not.toHaveProperty("scene_filter");
  });

  it("a number criterion has a value, BETWEEN either side, IS_NULL and NOT_NULL none and only where offered", () => {
    type Comparison = {
      modifier?:
        | "EQUALS"
        | "NOT_EQUALS"
        | "GREATER_THAN"
        | "LESS_THAN"
        | "BETWEEN"
        | null;
      value: number;
      value2?: number | null;
    };
    type OpenBetween = {
      modifier: "BETWEEN";
      value?: number | null;
      value2?: number | null;
    };
    expectTypeOf<
      NonNullable<NonNullable<FindImagesRequest["image_filter"]>["o_counter"]>
    >().toEqualTypeOf<Comparison | OpenBetween>();
    expectTypeOf<
      NonNullable<NonNullable<FindImagesRequest["image_filter"]>["rating100"]>
    >().toEqualTypeOf<
      | Comparison
      | OpenBetween
      | { modifier: "IS_NULL" | "NOT_NULL"; value?: null; value2?: null }
    >();
  });
});

describe("library list responses", () => {
  it("every list row carries stashUrl as string | null", () => {
    expectTypeOf<
      FindScenesResponse["findScenes"]["scenes"][number]["stashUrl"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<
      FindPerformersResponse["findPerformers"]["performers"][number]["stashUrl"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<
      FindStudiosResponse["findStudios"]["studios"][number]["stashUrl"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<
      FindTagsResponse["findTags"]["tags"][number]["stashUrl"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<
      FindGroupsResponse["findGroups"]["groups"][number]["stashUrl"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<
      FindGalleriesResponse["findGalleries"]["galleries"][number]["stashUrl"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<
      FindImagesResponse["findImages"]["images"][number]["stashUrl"]
    >().toEqualTypeOf<string | null>();
  });
});

describe("group membership responses", () => {
  it("a user's group memberships are UserGroupSummary rows", () => {
    expectTypeOf<
      GetUserGroupMembershipsResponse["groups"][number]
    >().toEqualTypeOf<UserGroupSummary>();
    expectTypeOf<
      GetCurrentUserGroupsResponse["groups"][number]
    >().toEqualTypeOf<UserGroupSummary>();
  });

  it("the two handlers answer with those responses", () => {
    expectTypeOf<ResBody<typeof getUserGroupMemberships>>().toEqualTypeOf<
      GetUserGroupMembershipsResponse | ApiErrorResponse
    >();
    expectTypeOf<ResBody<typeof getUserGroups>>().toEqualTypeOf<
      GetCurrentUserGroupsResponse | ApiErrorResponse
    >();
  });
});
