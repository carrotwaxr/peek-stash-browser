import { createElement } from "react";
import type * as routerModule from "react-router-dom";
import type { NormalizedGroup } from "@peek/shared-types";
import { render } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GroupCard from "../../../src/components/cards/GroupCard";
import type { BaseCardProps } from "../../../src/components/ui/BaseCard";

const { navigate, baseCardProps, config } = vi.hoisted(() => ({
  navigate: vi.fn(),
  baseCardProps: vi.fn<(props: BaseCardProps) => void>(),
  config: { hasMultipleInstances: true },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof routerModule>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => config,
}));
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({ showRelationshipIndicators: true }),
  }),
}));
// Captures the indicators GroupCard hands to BaseCard
vi.mock("../../../src/components/ui/BaseCard", () => ({
  BaseCard: (props: BaseCardProps) => {
    baseCardProps(props);
    return null;
  },
}));

/** GroupCard renders from these fields; the rest are left out */
const partialGroup = (fields: Partial<NormalizedGroup>) =>
  fields as NormalizedGroup;

describe("GroupCard", () => {
  const mockGroup = {
    id: "1",
    name: "Test Collection",
    front_image_path: "/front.jpg",
    scene_count: 15,
    sub_group_count: 3,
    performer_count: 5,
    studio: { name: "Test Studio" },
    date: "2024-01-15",
    tags: [{ id: "1", name: "Tag 1" }],
    rating100: 85,
    favorite: true,
  };

  it("is a React forwardRef component", () => {
    expect(typeof GroupCard).toBe("object");
    expect(GroupCard.displayName).toBe("GroupCard");
  });

  it("accepts expected props", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
      fromPageTitle: "Collections",
      tabIndex: 0,
    } as any);

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
    } as any);

    expect(element.props.group).toBe(mockGroup);
  });

  it("passes correct link path", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
    } as any);

    expect(element.props.group.id).toBe("1");
  });

  it("passes group with all data", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
    } as any);

    const group = element.props.group;
    expect(group.name).toBe("Test Collection");
    expect(group.scene_count).toBe(15);
    expect(group.sub_group_count).toBe(3);
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
      fromPageTitle: "Collections",
    } as any);

    expect(element.props.fromPageTitle).toBe("Collections");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
      tabIndex: 5,
    } as any);

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(GroupCard, {
      group: mockGroup,
      onHideSuccess,
    } as any);

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});

describe("GroupCard collections indicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const indicator = (type: string) => {
    const props = must(baseCardProps.mock.lastCall, "BaseCard's props")[0];
    return must(
      props.indicators?.find((each) => each.type === type),
      `the ${type} indicator`
    );
  };

  it("the collections indicator links to /collections?groupId=<id> with the instance", () => {
    render(
      <GroupCard
        group={partialGroup({
          id: "7",
          instanceId: "inst-a",
          name: "Box set",
          scene_count: 0,
          sub_group_count: 2,
          tags: [],
        })}
      />
    );

    const groups = indicator("GROUPS");
    expect(groups.count).toBe(2);
    must(groups.onClick, "the indicator's click")();

    // urlParamsToFilters turns groupId and instance into "7:inst-a"
    expect(navigate).toHaveBeenCalledWith(
      "/collections?groupId=7&instance=inst-a"
    );
  });

  it("a collection with no sub-collections has no link", () => {
    render(
      <GroupCard
        group={partialGroup({
          id: "8",
          instanceId: "inst-a",
          name: "Part 2",
          scene_count: 0,
          sub_group_count: 0,
          tags: [],
        })}
      />
    );

    expect(indicator("GROUPS").onClick).toBeUndefined();
  });
});
