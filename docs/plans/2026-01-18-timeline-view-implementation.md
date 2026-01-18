# Timeline View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Timeline view mode for browsing scenes, galleries, and images by date on a horizontally scrollable timeline with density bars.

**Architecture:** New view mode integrating with existing SearchControls pattern. Backend provides date distribution via SQL aggregation with exclusion filtering. Frontend renders horizontal timeline with density bars, zoom controls, and mobile bottom sheet.

**Tech Stack:** React 19, Vitest, Tailwind CSS, Prisma raw SQL, existing SearchControls/entityDisplayConfig patterns

---

## Task 1: Backend - TimelineService Date Distribution Query

**Files:**
- Create: `server/services/TimelineService.ts`
- Test: `server/tests/services/TimelineService.test.ts`

**Step 1: Write the failing test**

```typescript
// server/tests/services/TimelineService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: vi.fn().mockReturnValue({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: vi.fn().mockReturnValue([]),
    loadFromDatabase: vi.fn().mockResolvedValue(undefined),
  },
}));

import { TimelineService } from "../../services/TimelineService.js";

describe("TimelineService", () => {
  describe("getStrftimeFormat", () => {
    it("returns correct format for years granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("years")).toBe("%Y");
    });

    it("returns correct format for months granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("months")).toBe("%Y-%m");
    });

    it("returns correct format for weeks granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("weeks")).toBe("%Y-W%W");
    });

    it("returns correct format for days granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("days")).toBe("%Y-%m-%d");
    });

    it("defaults to months for invalid granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("invalid" as any)).toBe("%Y-%m");
    });
  });

  describe("buildDistributionQuery", () => {
    it("builds SQL with exclusion JOIN for scenes", () => {
      const service = new TimelineService();
      const { sql, params } = service.buildDistributionQuery("scene", 1, "months");

      expect(sql).toContain("SELECT");
      expect(sql).toContain("strftime('%Y-%m', s.date)");
      expect(sql).toContain("COUNT(*)");
      expect(sql).toContain("LEFT JOIN UserExcludedEntity");
      expect(sql).toContain("e.id IS NULL");
      expect(sql).toContain("s.date IS NOT NULL");
      expect(sql).toContain("GROUP BY period");
      expect(sql).toContain("ORDER BY period ASC");
      expect(params).toContain(1); // userId
    });

    it("builds SQL for galleries with correct table", () => {
      const service = new TimelineService();
      const { sql } = service.buildDistributionQuery("gallery", 1, "years");

      expect(sql).toContain("FROM StashGallery");
      expect(sql).toContain("strftime('%Y', g.date)");
    });

    it("builds SQL for images with correct table", () => {
      const service = new TimelineService();
      const { sql } = service.buildDistributionQuery("image", 1, "days");

      expect(sql).toContain("FROM StashImage");
      expect(sql).toContain("strftime('%Y-%m-%d', i.date)");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm test -- tests/services/TimelineService.test.ts`
Expected: FAIL with "Cannot find module '../../services/TimelineService.js'"

**Step 3: Write minimal implementation**

```typescript
// server/services/TimelineService.ts
import { prisma } from "../initializers/prisma.js";

export type Granularity = "years" | "months" | "weeks" | "days";
export type TimelineEntityType = "scene" | "gallery" | "image";

export interface DistributionItem {
  period: string;
  count: number;
}

interface QueryClause {
  sql: string;
  params: (string | number)[];
}

const ENTITY_CONFIG: Record<TimelineEntityType, { table: string; alias: string; dateField: string }> = {
  scene: { table: "StashScene", alias: "s", dateField: "s.date" },
  gallery: { table: "StashGallery", alias: "g", dateField: "g.date" },
  image: { table: "StashImage", alias: "i", dateField: "i.date" },
};

export class TimelineService {
  getStrftimeFormat(granularity: Granularity): string {
    switch (granularity) {
      case "years":
        return "%Y";
      case "months":
        return "%Y-%m";
      case "weeks":
        return "%Y-W%W";
      case "days":
        return "%Y-%m-%d";
      default:
        return "%Y-%m";
    }
  }

  buildDistributionQuery(
    entityType: TimelineEntityType,
    userId: number,
    granularity: Granularity
  ): QueryClause {
    const config = ENTITY_CONFIG[entityType];
    const format = this.getStrftimeFormat(granularity);

    const sql = `
      SELECT
        strftime('${format}', ${config.dateField}) as period,
        COUNT(*) as count
      FROM ${config.table} ${config.alias}
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ? AND e.entityType = '${entityType}' AND e.entityId = ${config.alias}.id
      WHERE ${config.alias}.deletedAt IS NULL
        AND e.id IS NULL
        AND ${config.dateField} IS NOT NULL
      GROUP BY period
      ORDER BY period ASC
    `.trim();

    return { sql, params: [userId] };
  }

  async getDistribution(
    entityType: TimelineEntityType,
    userId: number,
    granularity: Granularity
  ): Promise<DistributionItem[]> {
    const { sql, params } = this.buildDistributionQuery(entityType, userId, granularity);

    const results = await prisma.$queryRawUnsafe<Array<{ period: string; count: bigint }>>(
      sql,
      ...params
    );

    return results.map((row) => ({
      period: row.period,
      count: Number(row.count),
    }));
  }
}

export const timelineService = new TimelineService();
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm test -- tests/services/TimelineService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/TimelineService.ts server/tests/services/TimelineService.test.ts
git commit -m "feat(server): add TimelineService for date distribution queries"
```

---

## Task 2: Backend - Timeline Controller and Route

**Files:**
- Create: `server/controllers/timelineController.ts`
- Modify: `server/routes/api.ts`
- Test: `server/tests/controllers/timelineController.test.ts`

**Step 1: Write the failing test**

```typescript
// server/tests/controllers/timelineController.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: vi.fn().mockReturnValue({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: vi.fn().mockReturnValue([]),
    loadFromDatabase: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/TimelineService.js", () => ({
  timelineService: {
    getDistribution: vi.fn(),
  },
}));

import { getDateDistribution } from "../../controllers/timelineController.js";
import { timelineService } from "../../services/TimelineService.js";

describe("timelineController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDateDistribution", () => {
    it("returns distribution for valid entity type and granularity", async () => {
      const mockDistribution = [
        { period: "2024-01", count: 47 },
        { period: "2024-02", count: 12 },
      ];
      vi.mocked(timelineService.getDistribution).mockResolvedValue(mockDistribution);

      const req = {
        params: { entityType: "scene" },
        query: { granularity: "months" },
        user: { id: 1 },
      } as any;

      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as any;

      await getDateDistribution(req, res);

      expect(timelineService.getDistribution).toHaveBeenCalledWith("scene", 1, "months");
      expect(res.json).toHaveBeenCalledWith({ distribution: mockDistribution });
    });

    it("defaults granularity to months if not provided", async () => {
      vi.mocked(timelineService.getDistribution).mockResolvedValue([]);

      const req = {
        params: { entityType: "scene" },
        query: {},
        user: { id: 1 },
      } as any;

      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as any;

      await getDateDistribution(req, res);

      expect(timelineService.getDistribution).toHaveBeenCalledWith("scene", 1, "months");
    });

    it("returns 400 for invalid entity type", async () => {
      const req = {
        params: { entityType: "invalid" },
        query: { granularity: "months" },
        user: { id: 1 },
      } as any;

      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as any;

      await getDateDistribution(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid entity type" });
    });

    it("returns 400 for invalid granularity", async () => {
      const req = {
        params: { entityType: "scene" },
        query: { granularity: "invalid" },
        user: { id: 1 },
      } as any;

      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as any;

      await getDateDistribution(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid granularity" });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm test -- tests/controllers/timelineController.test.ts`
Expected: FAIL with "Cannot find module '../../controllers/timelineController.js'"

**Step 3: Write minimal implementation**

```typescript
// server/controllers/timelineController.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { timelineService, type Granularity, type TimelineEntityType } from "../services/TimelineService.js";

const VALID_ENTITY_TYPES: TimelineEntityType[] = ["scene", "gallery", "image"];
const VALID_GRANULARITIES: Granularity[] = ["years", "months", "weeks", "days"];

export async function getDateDistribution(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const { entityType } = req.params;
  const granularity = (req.query.granularity as string) || "months";
  const userId = req.user!.id;

  if (!VALID_ENTITY_TYPES.includes(entityType as TimelineEntityType)) {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }

  if (!VALID_GRANULARITIES.includes(granularity as Granularity)) {
    res.status(400).json({ error: "Invalid granularity" });
    return;
  }

  try {
    const distribution = await timelineService.getDistribution(
      entityType as TimelineEntityType,
      userId,
      granularity as Granularity
    );
    res.json({ distribution });
  } catch (error) {
    console.error("Error fetching date distribution:", error);
    res.status(500).json({ error: "Failed to fetch date distribution" });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm test -- tests/controllers/timelineController.test.ts`
Expected: PASS

**Step 5: Add route to api.ts**

Locate the routes section in `server/routes/api.ts` and add:

```typescript
// In imports section:
import { getDateDistribution } from "../controllers/timelineController.js";

// In routes section (near other library routes):
router.get("/timeline/:entityType/distribution", authenticated(getDateDistribution));
```

**Step 6: Run all server tests**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add server/controllers/timelineController.ts server/tests/controllers/timelineController.test.ts server/routes/api.ts
git commit -m "feat(server): add timeline distribution endpoint"
```

---

## Task 3: Frontend - useTimelineState Hook

**Files:**
- Create: `client/src/components/timeline/useTimelineState.js`
- Test: `client/tests/hooks/useTimelineState.test.jsx`

**Step 1: Write the failing test**

```javascript
// client/tests/hooks/useTimelineState.test.jsx
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTimelineState } from "../../src/components/timeline/useTimelineState.js";

vi.mock("../../src/services/api.js", () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from "../../src/services/api.js";

describe("useTimelineState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("initializes with default zoom level of months", () => {
      apiGet.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      expect(result.current.zoomLevel).toBe("months");
    });

    it("initializes with no selected period", () => {
      apiGet.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      expect(result.current.selectedPeriod).toBeNull();
    });

    it("fetches distribution on mount", async () => {
      const mockDistribution = [
        { period: "2024-01", count: 47 },
        { period: "2024-02", count: 12 },
      ];
      apiGet.mockResolvedValue({ distribution: mockDistribution });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.distribution).toEqual(mockDistribution);
      });

      expect(apiGet).toHaveBeenCalledWith("/timeline/scene/distribution?granularity=months");
    });
  });

  describe("zoom level changes", () => {
    it("updates zoom level and refetches distribution", async () => {
      apiGet.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setZoomLevel("years");
      });

      expect(result.current.zoomLevel).toBe("years");

      await waitFor(() => {
        expect(apiGet).toHaveBeenCalledWith("/timeline/scene/distribution?granularity=years");
      });
    });
  });

  describe("period selection", () => {
    it("selects a period and calculates date range", async () => {
      apiGet.mockResolvedValue({ distribution: [{ period: "2024-03", count: 47 }] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.selectPeriod("2024-03");
      });

      expect(result.current.selectedPeriod).toEqual({
        period: "2024-03",
        start: "2024-03-01",
        end: "2024-03-31",
        label: "March 2024",
      });
    });

    it("clears selection when selecting same period", async () => {
      apiGet.mockResolvedValue({ distribution: [{ period: "2024-03", count: 47 }] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.selectPeriod("2024-03");
      });

      act(() => {
        result.current.selectPeriod("2024-03");
      });

      expect(result.current.selectedPeriod).toBeNull();
    });
  });

  describe("auto-select most recent", () => {
    it("auto-selects most recent period when autoSelectRecent is true", async () => {
      const mockDistribution = [
        { period: "2024-01", count: 10 },
        { period: "2024-03", count: 47 },
      ];
      apiGet.mockResolvedValue({ distribution: mockDistribution });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene", autoSelectRecent: true })
      );

      await waitFor(() => {
        expect(result.current.selectedPeriod).not.toBeNull();
      });

      expect(result.current.selectedPeriod?.period).toBe("2024-03");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/hooks/useTimelineState.test.jsx`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```javascript
// client/src/components/timeline/useTimelineState.js
import { useState, useEffect, useCallback, useMemo } from "react";
import { apiGet } from "../../services/api.js";
import {
  startOfYear,
  endOfYear,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  format,
  parse,
} from "date-fns";

const ZOOM_LEVELS = ["years", "months", "weeks", "days"];

function parsePeriodToDateRange(period, zoomLevel) {
  let start, end, label;

  switch (zoomLevel) {
    case "years": {
      const date = parse(period, "yyyy", new Date());
      start = format(startOfYear(date), "yyyy-MM-dd");
      end = format(endOfYear(date), "yyyy-MM-dd");
      label = period;
      break;
    }
    case "months": {
      const date = parse(period, "yyyy-MM", new Date());
      start = format(startOfMonth(date), "yyyy-MM-dd");
      end = format(endOfMonth(date), "yyyy-MM-dd");
      label = format(date, "MMMM yyyy");
      break;
    }
    case "weeks": {
      // Format: "2024-W12"
      const [year, weekStr] = period.split("-W");
      const date = parse(`${year}-W${weekStr}-1`, "RRRR-'W'II-i", new Date());
      start = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      end = format(endOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      label = `Week ${weekStr}, ${year}`;
      break;
    }
    case "days": {
      const date = parse(period, "yyyy-MM-dd", new Date());
      start = format(startOfDay(date), "yyyy-MM-dd");
      end = format(endOfDay(date), "yyyy-MM-dd");
      label = format(date, "MMMM d, yyyy");
      break;
    }
    default:
      return null;
  }

  return { period, start, end, label };
}

export function useTimelineState({ entityType, autoSelectRecent = false }) {
  const [zoomLevel, setZoomLevel] = useState("months");
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [distribution, setDistribution] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch distribution when entityType or zoomLevel changes
  useEffect(() => {
    let cancelled = false;

    async function fetchDistribution() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiGet(
          `/timeline/${entityType}/distribution?granularity=${zoomLevel}`
        );

        if (!cancelled) {
          setDistribution(response.distribution || []);

          // Auto-select most recent period if enabled and no selection
          if (autoSelectRecent && response.distribution?.length > 0) {
            const mostRecent = response.distribution[response.distribution.length - 1];
            setSelectedPeriod(parsePeriodToDateRange(mostRecent.period, zoomLevel));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to fetch distribution");
          setDistribution([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchDistribution();

    return () => {
      cancelled = true;
    };
  }, [entityType, zoomLevel, autoSelectRecent]);

  const selectPeriod = useCallback(
    (period) => {
      if (selectedPeriod?.period === period) {
        setSelectedPeriod(null);
      } else {
        setSelectedPeriod(parsePeriodToDateRange(period, zoomLevel));
      }
    },
    [selectedPeriod, zoomLevel]
  );

  const clearSelection = useCallback(() => {
    setSelectedPeriod(null);
  }, []);

  // Calculate max count for bar height scaling
  const maxCount = useMemo(() => {
    if (distribution.length === 0) return 0;
    return Math.max(...distribution.map((d) => d.count));
  }, [distribution]);

  return {
    zoomLevel,
    setZoomLevel,
    selectedPeriod,
    selectPeriod,
    clearSelection,
    distribution,
    maxCount,
    isLoading,
    error,
    ZOOM_LEVELS,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/hooks/useTimelineState.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/timeline/useTimelineState.js client/tests/hooks/useTimelineState.test.jsx
git commit -m "feat(client): add useTimelineState hook for timeline state management"
```

---

## Task 4: Frontend - TimelineControls Component

**Files:**
- Create: `client/src/components/timeline/TimelineControls.jsx`
- Test: `client/tests/components/timeline/TimelineControls.test.jsx`

**Step 1: Write the failing test**

```javascript
// client/tests/components/timeline/TimelineControls.test.jsx
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import TimelineControls from "../../../src/components/timeline/TimelineControls.jsx";

describe("TimelineControls", () => {
  const defaultProps = {
    zoomLevel: "months",
    onZoomLevelChange: vi.fn(),
    zoomLevels: ["years", "months", "weeks", "days"],
  };

  it("renders all zoom level buttons", () => {
    const element = createElement(TimelineControls, defaultProps);

    expect(element).toBeDefined();
    expect(element.props.zoomLevel).toBe("months");
    expect(element.props.zoomLevels).toHaveLength(4);
  });

  it("accepts onZoomLevelChange callback", () => {
    const onZoomLevelChange = vi.fn();
    const element = createElement(TimelineControls, {
      ...defaultProps,
      onZoomLevelChange,
    });

    expect(element.props.onZoomLevelChange).toBe(onZoomLevelChange);
  });

  it("accepts custom className", () => {
    const element = createElement(TimelineControls, {
      ...defaultProps,
      className: "custom-class",
    });

    expect(element.props.className).toBe("custom-class");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineControls.test.jsx`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```javascript
// client/src/components/timeline/TimelineControls.jsx
import { memo } from "react";

const ZOOM_LABELS = {
  years: "Years",
  months: "Months",
  weeks: "Weeks",
  days: "Days",
};

function TimelineControls({
  zoomLevel,
  onZoomLevelChange,
  zoomLevels = ["years", "months", "weeks", "days"],
  className = "",
}) {
  return (
    <div
      className={`inline-flex rounded-md bg-bg-secondary ${className}`}
      role="group"
      aria-label="Timeline zoom level"
    >
      {zoomLevels.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onZoomLevelChange(level)}
          className={`
            px-3 py-1.5 text-sm font-medium transition-colors
            first:rounded-l-md last:rounded-r-md
            focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-inset
            ${
              zoomLevel === level
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
            }
          `}
          aria-pressed={zoomLevel === level}
        >
          {ZOOM_LABELS[level] || level}
        </button>
      ))}
    </div>
  );
}

export default memo(TimelineControls);
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineControls.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/timeline/TimelineControls.jsx client/tests/components/timeline/TimelineControls.test.jsx
git commit -m "feat(client): add TimelineControls zoom level toggle component"
```

---

## Task 5: Frontend - TimelineBar Component

**Files:**
- Create: `client/src/components/timeline/TimelineBar.jsx`
- Test: `client/tests/components/timeline/TimelineBar.test.jsx`

**Step 1: Write the failing test**

```javascript
// client/tests/components/timeline/TimelineBar.test.jsx
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import TimelineBar from "../../../src/components/timeline/TimelineBar.jsx";

describe("TimelineBar", () => {
  const defaultProps = {
    period: "2024-03",
    count: 47,
    maxCount: 100,
    isSelected: false,
    isFocused: false,
    onClick: vi.fn(),
    label: "March 2024",
  };

  it("renders with correct period and count", () => {
    const element = createElement(TimelineBar, defaultProps);

    expect(element).toBeDefined();
    expect(element.props.period).toBe("2024-03");
    expect(element.props.count).toBe(47);
  });

  it("calculates height percentage from count and maxCount", () => {
    const element = createElement(TimelineBar, {
      ...defaultProps,
      count: 50,
      maxCount: 100,
    });

    // Height should be 50% of max
    expect(element.props.count / element.props.maxCount).toBe(0.5);
  });

  it("accepts isSelected prop for highlight styling", () => {
    const element = createElement(TimelineBar, {
      ...defaultProps,
      isSelected: true,
    });

    expect(element.props.isSelected).toBe(true);
  });

  it("accepts isFocused prop for keyboard navigation", () => {
    const element = createElement(TimelineBar, {
      ...defaultProps,
      isFocused: true,
    });

    expect(element.props.isFocused).toBe(true);
  });

  it("accepts onClick callback", () => {
    const onClick = vi.fn();
    const element = createElement(TimelineBar, {
      ...defaultProps,
      onClick,
    });

    expect(element.props.onClick).toBe(onClick);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineBar.test.jsx`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```javascript
// client/src/components/timeline/TimelineBar.jsx
import { memo, useState } from "react";

const MIN_BAR_HEIGHT = 4; // Minimum visible height in pixels
const MAX_BAR_HEIGHT = 60; // Maximum bar height in pixels

function TimelineBar({
  period,
  count,
  maxCount,
  isSelected,
  isFocused,
  onClick,
  label,
  onKeyDown,
  tabIndex = -1,
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate bar height as percentage of max, with minimum visibility
  const heightPercent = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const barHeight = Math.max(
    MIN_BAR_HEIGHT,
    (heightPercent / 100) * MAX_BAR_HEIGHT
  );

  return (
    <div
      className="relative flex flex-col items-center cursor-pointer group"
      onClick={() => onClick(period)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role="option"
      aria-selected={isSelected}
      aria-label={`${label}: ${count} items`}
      tabIndex={tabIndex}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute bottom-full mb-2 px-2 py-1 text-xs font-medium
            bg-bg-primary text-text-primary rounded shadow-lg border border-border-primary
            whitespace-nowrap z-10 pointer-events-none"
        >
          {count} {count === 1 ? "item" : "items"}
        </div>
      )}

      {/* Bar */}
      <div
        className={`
          w-3 rounded-t transition-all duration-150
          ${isSelected ? "bg-accent-primary" : "bg-accent-secondary group-hover:bg-accent-primary/70"}
          ${isFocused ? "ring-2 ring-accent-primary ring-offset-1 ring-offset-bg-primary" : ""}
        `}
        style={{ height: `${barHeight}px` }}
      />

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -bottom-1 w-0 h-0 border-l-4 border-r-4 border-t-4
          border-l-transparent border-r-transparent border-t-accent-primary" />
      )}
    </div>
  );
}

export default memo(TimelineBar);
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineBar.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/timeline/TimelineBar.jsx client/tests/components/timeline/TimelineBar.test.jsx
git commit -m "feat(client): add TimelineBar density bar component"
```

---

## Task 6: Frontend - TimelineStrip Component

**Files:**
- Create: `client/src/components/timeline/TimelineStrip.jsx`
- Test: `client/tests/components/timeline/TimelineStrip.test.jsx`

**Step 1: Write the failing test**

```javascript
// client/tests/components/timeline/TimelineStrip.test.jsx
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import TimelineStrip from "../../../src/components/timeline/TimelineStrip.jsx";

describe("TimelineStrip", () => {
  const mockDistribution = [
    { period: "2024-01", count: 47 },
    { period: "2024-02", count: 12 },
    { period: "2024-03", count: 85 },
  ];

  const defaultProps = {
    distribution: mockDistribution,
    maxCount: 85,
    zoomLevel: "months",
    selectedPeriod: null,
    onSelectPeriod: vi.fn(),
  };

  it("renders distribution data as TimelineBar components", () => {
    const element = createElement(TimelineStrip, defaultProps);

    expect(element).toBeDefined();
    expect(element.props.distribution).toHaveLength(3);
  });

  it("passes maxCount to calculate bar heights", () => {
    const element = createElement(TimelineStrip, defaultProps);

    expect(element.props.maxCount).toBe(85);
  });

  it("highlights selected period", () => {
    const element = createElement(TimelineStrip, {
      ...defaultProps,
      selectedPeriod: { period: "2024-02", start: "2024-02-01", end: "2024-02-29", label: "February 2024" },
    });

    expect(element.props.selectedPeriod.period).toBe("2024-02");
  });

  it("accepts onSelectPeriod callback", () => {
    const onSelectPeriod = vi.fn();
    const element = createElement(TimelineStrip, {
      ...defaultProps,
      onSelectPeriod,
    });

    expect(element.props.onSelectPeriod).toBe(onSelectPeriod);
  });

  it("renders empty state when no distribution", () => {
    const element = createElement(TimelineStrip, {
      ...defaultProps,
      distribution: [],
      maxCount: 0,
    });

    expect(element.props.distribution).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineStrip.test.jsx`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```javascript
// client/src/components/timeline/TimelineStrip.jsx
import { memo, useRef, useState, useCallback, useEffect } from "react";
import TimelineBar from "./TimelineBar.jsx";
import { format, parse } from "date-fns";

const PERIOD_LABELS = {
  years: (period) => period,
  months: (period) => {
    const date = parse(period, "yyyy-MM", new Date());
    return format(date, "MMM yyyy");
  },
  weeks: (period) => {
    const [year, week] = period.split("-W");
    return `W${week}`;
  },
  days: (period) => {
    const date = parse(period, "yyyy-MM-dd", new Date());
    return format(date, "MMM d");
  },
};

function TimelineStrip({
  distribution,
  maxCount,
  zoomLevel,
  selectedPeriod,
  onSelectPeriod,
  onKeyboardNavigate,
  className = "",
}) {
  const containerRef = useRef(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const getLabel = useCallback(
    (period) => {
      const labelFn = PERIOD_LABELS[zoomLevel] || PERIOD_LABELS.months;
      return labelFn(period);
    },
    [zoomLevel]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (distribution.length === 0) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev <= 0 ? distribution.length - 1 : prev - 1
          );
          break;
        case "ArrowRight":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev >= distribution.length - 1 ? 0 : prev + 1
          );
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(distribution.length - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < distribution.length) {
            onSelectPeriod(distribution[focusedIndex].period);
          }
          break;
        default:
          if (onKeyboardNavigate) {
            onKeyboardNavigate(e);
          }
      }
    },
    [distribution, focusedIndex, onSelectPeriod, onKeyboardNavigate]
  );

  // Scroll focused bar into view
  useEffect(() => {
    if (focusedIndex >= 0 && containerRef.current) {
      const bars = containerRef.current.querySelectorAll('[role="option"]');
      if (bars[focusedIndex]) {
        bars[focusedIndex].scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [focusedIndex]);

  if (distribution.length === 0) {
    return (
      <div className={`flex items-center justify-center h-20 text-text-secondary ${className}`}>
        No dated content available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`
        relative flex items-end gap-1 overflow-x-auto pb-6 pt-2 px-4
        scrollbar-thin scrollbar-thumb-border-primary scrollbar-track-transparent
        ${className}
      `}
      role="listbox"
      aria-label="Timeline"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        if (focusedIndex === -1 && distribution.length > 0) {
          // Focus on selected period or last (most recent)
          const selectedIndex = distribution.findIndex(
            (d) => d.period === selectedPeriod?.period
          );
          setFocusedIndex(selectedIndex >= 0 ? selectedIndex : distribution.length - 1);
        }
      }}
    >
      {/* Baseline */}
      <div className="absolute bottom-6 left-4 right-4 h-px bg-border-primary" />

      {distribution.map((item, index) => (
        <div key={item.period} className="flex flex-col items-center min-w-[40px]">
          <TimelineBar
            period={item.period}
            count={item.count}
            maxCount={maxCount}
            isSelected={selectedPeriod?.period === item.period}
            isFocused={focusedIndex === index}
            onClick={onSelectPeriod}
            label={getLabel(item.period)}
            tabIndex={-1}
          />
          {/* Period label */}
          <span
            className={`
              mt-1 text-xs whitespace-nowrap
              ${selectedPeriod?.period === item.period ? "text-accent-primary font-medium" : "text-text-secondary"}
            `}
          >
            {getLabel(item.period)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default memo(TimelineStrip);
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineStrip.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/timeline/TimelineStrip.jsx client/tests/components/timeline/TimelineStrip.test.jsx
git commit -m "feat(client): add TimelineStrip scrollable timeline component"
```

---

## Task 7: Frontend - TimelineView Main Component

**Files:**
- Create: `client/src/components/timeline/TimelineView.jsx`
- Test: `client/tests/components/timeline/TimelineView.test.jsx`

**Step 1: Write the failing test**

```javascript
// client/tests/components/timeline/TimelineView.test.jsx
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import TimelineView from "../../../src/components/timeline/TimelineView.jsx";

vi.mock("../../../src/services/api.js", () => ({
  apiGet: vi.fn().mockResolvedValue({ distribution: [] }),
}));

describe("TimelineView", () => {
  const defaultProps = {
    entityType: "scene",
    items: [],
    renderItem: vi.fn(),
    onItemClick: vi.fn(),
  };

  it("renders with entityType prop", () => {
    const element = createElement(TimelineView, defaultProps);

    expect(element).toBeDefined();
    expect(element.props.entityType).toBe("scene");
  });

  it("accepts items array for results grid", () => {
    const items = [{ id: "1" }, { id: "2" }];
    const element = createElement(TimelineView, {
      ...defaultProps,
      items,
    });

    expect(element.props.items).toHaveLength(2);
  });

  it("accepts renderItem function for custom card rendering", () => {
    const renderItem = vi.fn();
    const element = createElement(TimelineView, {
      ...defaultProps,
      renderItem,
    });

    expect(element.props.renderItem).toBe(renderItem);
  });

  it("accepts loading state prop", () => {
    const element = createElement(TimelineView, {
      ...defaultProps,
      loading: true,
    });

    expect(element.props.loading).toBe(true);
  });

  it("accepts emptyMessage prop", () => {
    const element = createElement(TimelineView, {
      ...defaultProps,
      emptyMessage: "No scenes found",
    });

    expect(element.props.emptyMessage).toBe("No scenes found");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineView.test.jsx`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```javascript
// client/src/components/timeline/TimelineView.jsx
import { memo, useMemo } from "react";
import TimelineControls from "./TimelineControls.jsx";
import TimelineStrip from "./TimelineStrip.jsx";
import { useTimelineState } from "./useTimelineState.js";
import { getGridClasses } from "../../constants/grids.js";
import Spinner from "../ui/Spinner.jsx";

function TimelineView({
  entityType,
  items = [],
  renderItem,
  onItemClick,
  loading = false,
  emptyMessage = "No items found",
  gridDensity = "medium",
  className = "",
}) {
  const {
    zoomLevel,
    setZoomLevel,
    selectedPeriod,
    selectPeriod,
    distribution,
    maxCount,
    isLoading: distributionLoading,
    ZOOM_LEVELS,
  } = useTimelineState({ entityType, autoSelectRecent: true });

  // Build date filter from selected period
  const dateFilter = useMemo(() => {
    if (!selectedPeriod) return null;
    return {
      date: {
        value: selectedPeriod.start,
        value2: selectedPeriod.end,
        modifier: "BETWEEN",
      },
    };
  }, [selectedPeriod]);

  const gridClasses = getGridClasses("standard", gridDensity);

  const isLoading = loading || distributionLoading;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Timeline Header - Fixed */}
      <div className="flex-shrink-0 border-b border-border-primary bg-bg-primary sticky top-0 z-10">
        {/* Controls Row */}
        <div className="flex items-center justify-between px-4 py-2">
          <TimelineControls
            zoomLevel={zoomLevel}
            onZoomLevelChange={setZoomLevel}
            zoomLevels={ZOOM_LEVELS}
          />
          {selectedPeriod && (
            <div className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{selectedPeriod.label}</span>
              {items.length > 0 && (
                <span className="ml-2">({items.length} items)</span>
              )}
            </div>
          )}
        </div>

        {/* Timeline Strip */}
        <TimelineStrip
          distribution={distribution}
          maxCount={maxCount}
          zoomLevel={zoomLevel}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={selectPeriod}
        />
      </div>

      {/* Results Grid - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Spinner className="text-accent-primary" />
          </div>
        ) : !selectedPeriod ? (
          <div className="flex items-center justify-center h-32 text-text-secondary">
            Select a time period on the timeline above
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-secondary">
            {emptyMessage}
          </div>
        ) : (
          <div className={gridClasses}>
            {items.map((item, index) =>
              renderItem(item, index, { onItemClick, dateFilter })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TimelineView);

// Export dateFilter for parent components to use
export { TimelineView };
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineView.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/timeline/TimelineView.jsx client/tests/components/timeline/TimelineView.test.jsx
git commit -m "feat(client): add TimelineView main container component"
```

---

## Task 8: Frontend - Add Timeline to Entity Display Config

**Files:**
- Modify: `client/src/config/entityDisplayConfig.js`
- Test: `client/tests/config/entityDisplayConfig.test.js` (create if doesn't exist)

**Step 1: Write the failing test**

```javascript
// client/tests/config/entityDisplayConfig.test.js
import { describe, it, expect } from "vitest";
import { ENTITY_DISPLAY_CONFIG, getViewModes } from "../../src/config/entityDisplayConfig.js";

describe("entityDisplayConfig", () => {
  describe("timeline view mode", () => {
    it("scene entity includes timeline view mode", () => {
      const sceneModes = getViewModes("scene");
      const timelineMode = sceneModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode.label).toBe("Timeline");
    });

    it("gallery entity includes timeline view mode", () => {
      const galleryModes = getViewModes("gallery");
      const timelineMode = galleryModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode.label).toBe("Timeline");
    });

    it("image entity includes timeline view mode", () => {
      const imageModes = getViewModes("image");
      const timelineMode = imageModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode.label).toBe("Timeline");
    });

    it("performer entity does NOT include timeline view mode", () => {
      const performerModes = getViewModes("performer");
      const timelineMode = performerModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeUndefined();
    });

    it("tag entity does NOT include timeline view mode", () => {
      const tagModes = getViewModes("tag");
      const timelineMode = tagModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeUndefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/config/entityDisplayConfig.test.js`
Expected: FAIL with timeline mode not found

**Step 3: Modify entityDisplayConfig.js**

Read the file first, then add timeline to scene, gallery, and image viewModes arrays:

```javascript
// In scene config viewModes array, add:
{ id: "timeline", label: "Timeline" },

// In gallery config viewModes array, add:
{ id: "timeline", label: "Timeline" },

// In image config viewModes array, add:
{ id: "timeline", label: "Timeline" },
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/config/entityDisplayConfig.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/config/entityDisplayConfig.js client/tests/config/entityDisplayConfig.test.js
git commit -m "feat(client): add timeline view mode to scene, gallery, image entities"
```

---

## Task 9: Frontend - Add Timeline Icon to ViewModeToggle

**Files:**
- Modify: `client/src/components/ui/ViewModeToggle.jsx`

**Step 1: Read current ViewModeToggle implementation**

Read `client/src/components/ui/ViewModeToggle.jsx` to understand MODE_ICONS structure.

**Step 2: Add timeline icon**

Add to MODE_ICONS object:

```javascript
import { Calendar as LucideCalendar } from "lucide-react";

// In MODE_ICONS:
timeline: LucideCalendar,
```

**Step 3: Run existing ViewModeToggle tests**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/ui/ViewModeToggle.test.jsx`
Expected: PASS (no breaking changes)

**Step 4: Commit**

```bash
git add client/src/components/ui/ViewModeToggle.jsx
git commit -m "feat(client): add timeline icon to ViewModeToggle"
```

---

## Task 10: Frontend - Integrate Timeline into SceneSearch

**Files:**
- Modify: `client/src/components/scene-search/SceneSearch.jsx`

**Step 1: Read current SceneSearch implementation**

Read `client/src/components/scene-search/SceneSearch.jsx` to understand view mode switching pattern.

**Step 2: Add TimelineView import and rendering**

```javascript
// Add import at top:
import TimelineView from "../timeline/TimelineView.jsx";

// In VIEW_MODES array, add:
{ id: "timeline", label: "Timeline view" },

// In the render function children, add timeline case:
viewMode === "timeline" ? (
  <TimelineView
    entityType="scene"
    items={currentScenes}
    renderItem={(scene, index, { onItemClick }) => (
      <SceneCard
        key={scene.id}
        scene={scene}
        onClick={() => onItemClick?.(scene)}
        tabIndex={0}
      />
    )}
    onItemClick={handleSceneClick}
    loading={isLoading}
    emptyMessage="No scenes found for this time period"
    gridDensity={gridDensity}
  />
) : viewMode === "table" ? (
  // existing table code...
)
```

**Step 3: Run all client tests**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add client/src/components/scene-search/SceneSearch.jsx
git commit -m "feat(client): integrate TimelineView into SceneSearch"
```

---

## Task 11: Frontend - Integrate Timeline into GallerySearch

**Files:**
- Modify: `client/src/components/gallery-search/GallerySearch.jsx`

**Step 1: Read current GallerySearch implementation**

Read `client/src/components/gallery-search/GallerySearch.jsx`.

**Step 2: Add TimelineView import and rendering**

Follow same pattern as SceneSearch:

```javascript
// Add import:
import TimelineView from "../timeline/TimelineView.jsx";

// Add to VIEW_MODES if not using entityDisplayConfig
// Add timeline case in render function
```

**Step 3: Run all client tests**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add client/src/components/gallery-search/GallerySearch.jsx
git commit -m "feat(client): integrate TimelineView into GallerySearch"
```

---

## Task 12: Frontend - Integrate Timeline into ImageSearch

**Files:**
- Modify: `client/src/components/image-search/ImageSearch.jsx`

**Step 1: Read current ImageSearch implementation**

Read `client/src/components/image-search/ImageSearch.jsx`.

**Step 2: Add TimelineView import and rendering**

Follow same pattern as SceneSearch.

**Step 3: Run all client tests**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add client/src/components/image-search/ImageSearch.jsx
git commit -m "feat(client): integrate TimelineView into ImageSearch"
```

---

## Task 13: Frontend - Mobile Bottom Sheet Component

**Files:**
- Create: `client/src/components/timeline/TimelineMobileSheet.jsx`
- Test: `client/tests/components/timeline/TimelineMobileSheet.test.jsx`

**Step 1: Install bottom sheet package**

```bash
cd /home/carrot/code/peek-stash-browser/client && npm install react-spring-bottom-sheet
```

**Step 2: Write the failing test**

```javascript
// client/tests/components/timeline/TimelineMobileSheet.test.jsx
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import TimelineMobileSheet from "../../../src/components/timeline/TimelineMobileSheet.jsx";

describe("TimelineMobileSheet", () => {
  const defaultProps = {
    isOpen: true,
    onDismiss: vi.fn(),
    selectedPeriod: { period: "2024-03", label: "March 2024" },
    itemCount: 47,
    children: null,
  };

  it("renders with isOpen prop", () => {
    const element = createElement(TimelineMobileSheet, defaultProps);

    expect(element).toBeDefined();
    expect(element.props.isOpen).toBe(true);
  });

  it("shows selected period label in minimized state", () => {
    const element = createElement(TimelineMobileSheet, defaultProps);

    expect(element.props.selectedPeriod.label).toBe("March 2024");
  });

  it("shows item count in minimized state", () => {
    const element = createElement(TimelineMobileSheet, defaultProps);

    expect(element.props.itemCount).toBe(47);
  });

  it("accepts children for expanded content", () => {
    const children = createElement("div", null, "Timeline content");
    const element = createElement(TimelineMobileSheet, {
      ...defaultProps,
      children,
    });

    expect(element.props.children).toBeDefined();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineMobileSheet.test.jsx`
Expected: FAIL with "Cannot find module"

**Step 4: Write minimal implementation**

```javascript
// client/src/components/timeline/TimelineMobileSheet.jsx
import { memo, useState, useCallback } from "react";
import { BottomSheet } from "react-spring-bottom-sheet";
import "react-spring-bottom-sheet/dist/style.css";
import { ChevronUp } from "lucide-react";

const SNAP_POINTS = {
  minimized: 48,
  expanded: 200,
};

function TimelineMobileSheet({
  isOpen,
  onDismiss,
  selectedPeriod,
  itemCount,
  children,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSnap = useCallback((snapIndex) => {
    setIsExpanded(snapIndex === 1);
  }, []);

  const snapPoints = useCallback(
    ({ maxHeight }) => [SNAP_POINTS.minimized, Math.min(SNAP_POINTS.expanded, maxHeight * 0.4)],
    []
  );

  return (
    <BottomSheet
      open={isOpen}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      defaultSnap={({ snapPoints }) => snapPoints[0]}
      onSpringEnd={handleSnap}
      blocking={false}
      className="timeline-bottom-sheet"
    >
      {/* Minimized Header - Always visible */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {/* Drag handle */}
          <div className="w-8 h-1 bg-border-primary rounded-full" />

          {selectedPeriod ? (
            <span className="text-sm font-medium text-text-primary">
              {selectedPeriod.label}
              {itemCount > 0 && (
                <span className="ml-2 text-text-secondary">
                  · {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm text-text-secondary">
              Select a time period
            </span>
          )}
        </div>

        <ChevronUp
          size={20}
          className={`text-text-secondary transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </div>

      {/* Expanded Content */}
      <div className={`overflow-hidden transition-all ${isExpanded ? "max-h-[200px]" : "max-h-0"}`}>
        {children}
      </div>
    </BottomSheet>
  );
}

export default memo(TimelineMobileSheet);
```

**Step 5: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- tests/components/timeline/TimelineMobileSheet.test.jsx`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/timeline/TimelineMobileSheet.jsx client/tests/components/timeline/TimelineMobileSheet.test.jsx package.json package-lock.json
git commit -m "feat(client): add TimelineMobileSheet bottom sheet component"
```

---

## Task 14: Frontend - Add Mobile Detection and Sheet Integration

**Files:**
- Modify: `client/src/components/timeline/TimelineView.jsx`

**Step 1: Read useMediaQuery or similar hook**

Check for existing mobile detection hooks in the codebase.

**Step 2: Integrate mobile bottom sheet**

```javascript
// Add imports:
import TimelineMobileSheet from "./TimelineMobileSheet.jsx";
import { useMediaQuery } from "../../hooks/useMediaQuery.js"; // or create if needed

// In component:
const isMobile = useMediaQuery("(max-width: 768px)");

// Conditional rendering:
{isMobile ? (
  <TimelineMobileSheet
    isOpen={true}
    selectedPeriod={selectedPeriod}
    itemCount={items.length}
  >
    <TimelineControls ... />
    <TimelineStrip ... />
  </TimelineMobileSheet>
) : (
  // Desktop layout (existing)
)}
```

**Step 3: Run all client tests**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add client/src/components/timeline/TimelineView.jsx
git commit -m "feat(client): add mobile bottom sheet layout to TimelineView"
```

---

## Task 15: Integration Test - Timeline API Endpoint

**Files:**
- Create: `server/integration/api/timeline.integration.test.ts`

**Step 1: Write integration test**

```typescript
// server/integration/api/timeline.integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

interface DistributionResponse {
  distribution: Array<{
    period: string;
    count: number;
  }>;
}

describe("Timeline API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("GET /api/timeline/:entityType/distribution", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.get("/api/timeline/scene/distribution");

      expect(response.status).toBe(401);
    });

    it("returns distribution for scenes with default granularity", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/scene/distribution"
      );

      expect(response.ok).toBe(true);
      expect(response.data.distribution).toBeDefined();
      expect(Array.isArray(response.data.distribution)).toBe(true);
    });

    it("returns distribution for galleries", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/gallery/distribution?granularity=years"
      );

      expect(response.ok).toBe(true);
      expect(response.data.distribution).toBeDefined();
    });

    it("returns distribution for images", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/image/distribution?granularity=days"
      );

      expect(response.ok).toBe(true);
      expect(response.data.distribution).toBeDefined();
    });

    it("returns 400 for invalid entity type", async () => {
      const response = await adminClient.get("/api/timeline/invalid/distribution");

      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid granularity", async () => {
      const response = await adminClient.get(
        "/api/timeline/scene/distribution?granularity=invalid"
      );

      expect(response.status).toBe(400);
    });

    it("distribution items have period and count", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/scene/distribution?granularity=months"
      );

      expect(response.ok).toBe(true);

      if (response.data.distribution.length > 0) {
        const item = response.data.distribution[0];
        expect(item.period).toBeDefined();
        expect(typeof item.period).toBe("string");
        expect(item.count).toBeDefined();
        expect(typeof item.count).toBe("number");
      }
    });
  });
});
```

**Step 2: Run integration test**

Run: `cd /home/carrot/code/peek-stash-browser/server && npm run test:integration -- timeline.integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add server/integration/api/timeline.integration.test.ts
git commit -m "test(server): add timeline API integration tests"
```

---

## Task 16: Manual Testing & Polish

**Step 1: Start dev servers**

```bash
# Terminal 1 - Server
cd /home/carrot/code/peek-stash-browser/server && npm run dev

# Terminal 2 - Client
cd /home/carrot/code/peek-stash-browser/client && npm run dev
```

**Step 2: Manual test checklist**

- [ ] Navigate to Scenes page
- [ ] Switch to Timeline view mode
- [ ] Verify timeline strip renders with bars
- [ ] Click zoom level buttons (Years/Months/Weeks/Days)
- [ ] Click a bar to select time period
- [ ] Verify results grid updates with filtered scenes
- [ ] Test keyboard navigation (arrow keys, Enter)
- [ ] Test on mobile viewport (resize browser or use DevTools)
- [ ] Verify bottom sheet expands/collapses
- [ ] Repeat for Galleries and Images pages

**Step 3: Fix any visual issues found**

Address any styling or UX issues discovered during manual testing.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: polish timeline view styling and interactions"
```

---

## Task 17: Run Full Test Suite & Final Commit

**Step 1: Run all tests**

```bash
# Server unit tests
cd /home/carrot/code/peek-stash-browser/server && npm test

# Server integration tests
cd /home/carrot/code/peek-stash-browser/server && npm run test:integration

# Client tests
cd /home/carrot/code/peek-stash-browser/client && npm test
```

**Step 2: Verify all pass**

Expected: All tests PASS

**Step 3: Create index export file**

```javascript
// client/src/components/timeline/index.js
export { default as TimelineView } from "./TimelineView.jsx";
export { default as TimelineStrip } from "./TimelineStrip.jsx";
export { default as TimelineControls } from "./TimelineControls.jsx";
export { default as TimelineBar } from "./TimelineBar.jsx";
export { default as TimelineMobileSheet } from "./TimelineMobileSheet.jsx";
export { useTimelineState } from "./useTimelineState.js";
```

**Step 4: Final commit**

```bash
git add client/src/components/timeline/index.js
git commit -m "feat: complete timeline view implementation"
```

---

## Summary

This plan implements the Timeline View feature in 17 tasks:

| Task | Component | Type |
|------|-----------|------|
| 1 | TimelineService | Backend |
| 2 | Timeline Controller + Route | Backend |
| 3 | useTimelineState hook | Frontend |
| 4 | TimelineControls | Frontend |
| 5 | TimelineBar | Frontend |
| 6 | TimelineStrip | Frontend |
| 7 | TimelineView | Frontend |
| 8 | entityDisplayConfig | Frontend |
| 9 | ViewModeToggle icon | Frontend |
| 10 | SceneSearch integration | Frontend |
| 11 | GallerySearch integration | Frontend |
| 12 | ImageSearch integration | Frontend |
| 13 | TimelineMobileSheet | Frontend |
| 14 | Mobile detection integration | Frontend |
| 15 | Integration tests | Testing |
| 16 | Manual testing | QA |
| 17 | Final test suite | QA |

Each task follows TDD with explicit test → fail → implement → pass → commit steps.
