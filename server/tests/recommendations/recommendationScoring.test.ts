// server/tests/recommendations/recommendationScoring.test.ts
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  type RecommendationPreferences,
} from "@peek/shared-types/recommendationPreferences.js";
import { describe, expect, it } from "vitest";
import {
  type AffinityInput,
  type EntityAffinity,
  LEAD_WEIGHT,
  PARTNER_MULT_MAX,
  PARTNER_MULT_MIN,
  PARTNER_STRENGTH,
  type RatingRow,
  STUDIO_WEIGHT,
  type SceneScoringContext,
  type ScoringScene,
  TAG_WEIGHT,
  buildEntityAffinity,
  countUserCriteria,
  hasAnyCriteria,
  sceneTopLead,
  scoreScene,
  tagIdf,
  watchMultiplier,
} from "../../services/RecommendationScoringService.js";
import { entityKey } from "../../utils/entityRef.js";

const A = "inst-a";
const B = "inst-b";
const k = (id: string, instanceId: string = A) => entityKey(id, instanceId);

const rating = (
  id: string,
  value: number | null,
  favorite = false,
  instanceId: string = A
): RatingRow => ({ id, instanceId, rating: value, favorite });

const scene = (
  id: string,
  extra: Partial<ScoringScene> = {}
): ScoringScene => ({
  id,
  instanceId: A,
  studioId: null,
  performerIds: [],
  tagIds: [],
  inheritedTagIds: [],
  oCount: 0,
  kept: false,
  hasHistory: false,
  lastPlayedAt: null,
  rating: null,
  favorite: false,
  ...extra,
});

const affinityInput = (extra: Partial<AffinityInput> = {}): AffinityInput => ({
  performerRatings: [],
  studioRatings: [],
  tagRatings: [],
  ratedScenes: [],
  rankings: [],
  tagParents: new Map(),
  studioParents: new Map(),
  ignoredTags: new Set(),
  ...extra,
});

const context = (
  affinity: EntityAffinity,
  extra: Partial<Omit<SceneScoringContext, "affinity">> = {},
  prefs: Partial<RecommendationPreferences> = {}
): SceneScoringContext => ({
  affinity,
  prefs: { ...DEFAULT_RECOMMENDATION_PREFERENCES, ...prefs },
  genders: new Map(),
  tagDf: new Map(),
  sceneCount: 0,
  ignoredTags: new Set(),
  ...extra,
});

/** Leads FEMALE, partners MALE, and these performers' genders */
const femaleLeads = (
  genders: Record<string, string>,
  noPartnerScenes: RecommendationPreferences["noPartnerScenes"] = "normal"
) => ({
  extra: {
    genders: new Map(Object.entries(genders).map(([id, g]) => [k(id), g])),
  },
  prefs: {
    leadGenders: ["FEMALE" as const],
    partnerGenders: ["MALE" as const],
    noPartnerScenes,
  },
});

describe("RecommendationScoringService", () => {
  describe("buildEntityAffinity", () => {
    it("a favorite plus rated scenes and rankings clamps at 1", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          performerRatings: [rating("p1", null, true)],
          ratedScenes: [scene("s1", { performerIds: ["p1"], rating: 100 })],
          rankings: [
            {
              entityType: "performer",
              entityId: "p1",
              instanceId: A,
              affinity: 0.5,
            },
          ],
        })
      );

      expect(affinity.performer.get(k("p1"))).toBe(1);
      expect(affinity.favoritePerformers).toEqual(new Set([k("p1")]));
    });

    it("a rating of 20 alone gives -0.6", () => {
      const affinity = buildEntityAffinity(
        affinityInput({ performerRatings: [rating("p1", 20)] })
      );

      expect(affinity.performer.get(k("p1"))).toBeCloseTo(-0.6, 10);
      expect(affinity.favoritePerformers.size).toBe(0);
    });

    it("one scene rated 100 alone gives its performer, studio and tags S = 0.25, so A = 0.15", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          ratedScenes: [
            scene("s1", {
              performerIds: ["p1", "p2"],
              studioId: "st1",
              tagIds: ["t1"],
              rating: 100,
            }),
          ],
        })
      );

      expect(affinity.performer.get(k("p1"))).toBeCloseTo(0.15, 10);
      expect(affinity.performer.get(k("p2"))).toBeCloseTo(0.15, 10);
      expect(affinity.studio.get(k("st1"))).toBeCloseTo(0.15, 10);
      expect(affinity.tag.get(k("t1"))).toBeCloseTo(0.15, 10);
    });

    it("a favorite scene counts at least 0.7, rated or not, and rated scenes shrink toward 0", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          ratedScenes: [
            scene("s1", { performerIds: ["p1"], favorite: true }),
            scene("s2", { performerIds: ["p2"], favorite: true, rating: 60 }),
            scene("s3", { performerIds: ["p3"], rating: 0 }),
            scene("s4", { performerIds: ["p3"], rating: 0 }),
          ],
        })
      );

      // 0.6 * 0.7 / (1 + 3)
      expect(affinity.performer.get(k("p1"))).toBeCloseTo(0.105, 10);
      expect(affinity.performer.get(k("p2"))).toBeCloseTo(0.105, 10);
      // 0.6 * -2 / (2 + 3)
      expect(affinity.performer.get(k("p3"))).toBeCloseTo(-0.24, 10);
    });

    it("a ranking's affinity alone counts 0.6", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          rankings: [
            { entityType: "tag", entityId: "t1", instanceId: A, affinity: 0.5 },
            {
              entityType: "studio",
              entityId: "st1",
              instanceId: A,
              affinity: -0.5,
            },
          ],
        })
      );

      expect(affinity.tag.get(k("t1"))).toBeCloseTo(0.3, 10);
      expect(affinity.studio.get(k("st1"))).toBeCloseTo(-0.3, 10);
    });

    it("ignored tags are absent: ratings, rated scenes, rankings and the hierarchy", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          tagRatings: [rating("ignored", 100, true), rating("parent", 100)],
          ratedScenes: [
            scene("s1", { tagIds: ["ignored", "kept"], rating: 100 }),
          ],
          rankings: [
            {
              entityType: "tag",
              entityId: "ignored",
              instanceId: A,
              affinity: 1,
            },
          ],
          tagParents: new Map([[k("ignored"), [k("parent")]]]),
          ignoredTags: new Set([k("ignored")]),
        })
      );

      expect(affinity.tag.has(k("ignored"))).toBe(false);
      expect(affinity.tag.get(k("kept"))).toBeCloseTo(0.15, 10);
    });

    it("tags without an entry take 0.8 per step of their nearest rated ancestor, never over their own entry", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          tagRatings: [rating("root", 100), rating("own", 50)],
          tagParents: new Map([
            [k("child"), [k("root")]],
            [k("grandchild"), [k("child")]],
            [k("own"), [k("root")]],
            [k("underOwn"), [k("own")]],
            // A cycle with no entry anywhere: no value, and it ends
            [k("loopA"), [k("loopB")]],
            [k("loopB"), [k("loopA")]],
            // A cycle through a rated tag
            [k("cycleChild"), [k("cycleParent")]],
            [k("cycleParent"), [k("cycleChild"), k("root")]],
          ]),
        })
      );

      expect(affinity.tag.get(k("root"))).toBe(1);
      expect(affinity.tag.get(k("child"))).toBeCloseTo(0.8, 10);
      expect(affinity.tag.get(k("grandchild"))).toBeCloseTo(0.64, 10);
      // Rated 50: its own entry, 0, stays
      expect(affinity.tag.get(k("own"))).toBe(0);
      // Its nearest ancestor with an entry is "own" (0)
      expect(affinity.tag.get(k("underOwn"))).toBe(0);
      expect(affinity.tag.has(k("loopA"))).toBe(false);
      expect(affinity.tag.has(k("loopB"))).toBe(false);
      expect(affinity.tag.get(k("cycleParent"))).toBeCloseTo(0.8, 10);
      expect(affinity.tag.get(k("cycleChild"))).toBeCloseTo(0.64, 10);
    });

    it("studios without an entry take 0.8 per step of their nearest ancestor, never over their own entry", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          studioRatings: [
            rating("network", null, true),
            rating("disliked", 20),
          ],
          studioParents: new Map([
            [k("label"), k("network")],
            [k("sublabel"), k("label")],
            [k("disliked"), k("network")],
            [k("loopA"), k("loopB")],
            [k("loopB"), k("loopA")],
          ]),
        })
      );

      expect(affinity.studio.get(k("label"))).toBeCloseTo(0.8, 10);
      expect(affinity.studio.get(k("sublabel"))).toBeCloseTo(0.64, 10);
      expect(affinity.studio.get(k("disliked"))).toBeCloseTo(-0.6, 10);
      expect(affinity.studio.has(k("loopA"))).toBe(false);
    });

    it("keeps keys per instance: the same id on two instances is independent", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          performerRatings: [
            rating("12", null, true, A),
            rating("12", 20, false, B),
          ],
          ratedScenes: [
            scene("s1", { studioId: "st1", tagIds: ["t1"], rating: 100 }),
          ],
          tagParents: new Map([[k("child", B), [k("t1", B)]]]),
        })
      );

      expect(affinity.performer.get(k("12", A))).toBe(1);
      expect(affinity.performer.get(k("12", B))).toBeCloseTo(-0.6, 10);
      expect(affinity.studio.get(k("st1", A))).toBeCloseTo(0.15, 10);
      expect(affinity.studio.has(k("st1", B))).toBe(false);
      expect(affinity.tag.has(k("t1", B))).toBe(false);
      expect(affinity.tag.has(k("child", B))).toBe(false);
      expect(affinity.favoritePerformers).toEqual(new Set([k("12", A)]));
    });
  });

  describe("scoreScene", () => {
    const favoriteF = rating("f1", null, true);

    it("a liked partner raises a favorite lead's scene and a disliked one lowers it, by the partners' mean, within 0.4 and 1.6", () => {
      const liked = ["liked", "liked2", "liked3", "liked4", "liked5", "liked6"];
      const affinity = buildEntityAffinity(
        affinityInput({
          performerRatings: [
            favoriteF,
            ...liked.map((id) => rating(id, 75)),
            rating("loved", 100),
            rating("disliked", 25),
            rating("hated", 0),
            rating("hated2", 0),
          ],
        })
      );
      const { extra, prefs } = femaleLeads({
        f1: "FEMALE",
        ...Object.fromEntries(liked.map((id) => [id, "MALE"])),
        loved: "MALE",
        neutral: "MALE",
        disliked: "MALE",
        hated: "MALE",
        hated2: "MALE",
      });
      const ctx = context(affinity, extra, prefs);
      const score = (partners: string[]) =>
        scoreScene(scene("s", { performerIds: ["f1", ...partners] }), ctx);

      expect(PARTNER_STRENGTH).toBe(0.6);
      // A partner with no affinity is not in the mean
      expect(score(["neutral"])).toBeCloseTo(LEAD_WEIGHT, 10);
      expect(score(["liked", "neutral"])).toBeCloseTo(
        LEAD_WEIGHT * (1 + 0.6 * 0.5),
        10
      );
      expect(score(["disliked"])).toBeCloseTo(
        LEAD_WEIGHT * (1 - 0.6 * 0.5),
        10
      );
      // Five more partners liked as much change nothing
      expect(score(liked)).toBeCloseTo(score(["liked"]), 10);
      // A liked and a disliked partner average out
      expect(score(["liked", "disliked"])).toBeCloseTo(LEAD_WEIGHT, 10);
      // The bounds: a loved partner, and hated ones however many
      expect(score(["loved"])).toBeCloseTo(LEAD_WEIGHT * PARTNER_MULT_MAX, 10);
      expect(score(["hated", "hated2"])).toBeCloseTo(
        LEAD_WEIGHT * PARTNER_MULT_MIN,
        10
      );
      expect(score(["loved", ...liked])).toBeLessThanOrEqual(
        LEAD_WEIGHT * PARTNER_MULT_MAX + 1e-9
      );
    });

    it('a scene without a partner gets 0.35 under "less" unless every lead is a favorite', () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          performerRatings: [
            favoriteF,
            rating("f2", 100),
            rating("f3", null, true),
          ],
        })
      );
      const genders = { f1: "FEMALE", f2: "FEMALE", f3: "FEMALE" };
      const less = femaleLeads(genders, "less");
      const normal = femaleLeads(genders, "normal");
      const lessCtx = context(affinity, less.extra, less.prefs);
      const normalCtx = context(affinity, normal.extra, normal.prefs);
      const girlGirl = scene("s", { performerIds: ["f1", "f2"] });
      const favorites = scene("s", { performerIds: ["f1", "f3"] });

      // Leads 1 and 1, weighted 1 and 0.5
      expect(scoreScene(girlGirl, normalCtx)).toBeCloseTo(
        LEAD_WEIGHT * 1.5,
        10
      );
      expect(scoreScene(girlGirl, lessCtx)).toBeCloseTo(
        LEAD_WEIGHT * 1.5 * 0.35,
        10
      );
      expect(scoreScene(favorites, lessCtx)).toBeCloseTo(LEAD_WEIGHT * 1.5, 10);
      // A performer of unknown gender is a lead
      expect(
        scoreScene(scene("s", { performerIds: ["f1", "unknown"] }), lessCtx)
      ).toBeCloseTo(LEAD_WEIGHT * 0.35, 10);
    });

    it("with no lead genders a male performer is a lead; with FEMALE leads and no MALE partners he counts half", () => {
      const affinity = buildEntityAffinity(
        affinityInput({ performerRatings: [rating("m1", null, true)] })
      );
      const genders = new Map([[k("m1"), "MALE"]]);
      const s = scene("s", { performerIds: ["m1"] });

      expect(scoreScene(s, context(affinity, { genders }))).toBeCloseTo(
        LEAD_WEIGHT,
        10
      );
      expect(
        scoreScene(
          s,
          context(affinity, { genders }, { leadGenders: ["FEMALE"] })
        )
      ).toBeCloseTo(LEAD_WEIGHT * 0.5, 10);
    });

    it("a disliked lead lowers the score at full weight, a liked second lead adds half", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          performerRatings: [favoriteF, rating("bad", 30), rating("good", 70)],
        })
      );
      const ctx = context(affinity);

      expect(
        scoreScene(scene("s", { performerIds: ["f1", "bad"] }), ctx)
      ).toBeCloseTo(LEAD_WEIGHT * (1 - 0.4), 10);
      expect(
        scoreScene(scene("s", { performerIds: ["f1", "good"] }), ctx)
      ).toBeCloseTo(LEAD_WEIGHT * (1 + 0.5 * 0.4), 10);
    });

    it("a liked tag on 45 % of the library gains less than one on 5 %", () => {
      const affinity = buildEntityAffinity(
        affinityInput({
          tagRatings: [rating("common", 100), rating("rare", 100)],
        })
      );
      const ctx = context(affinity, {
        sceneCount: 100,
        tagDf: new Map([
          [k("common"), 45],
          [k("rare"), 5],
        ]),
      });
      const common = scoreScene(scene("s", { tagIds: ["common"] }), ctx);
      const rare = scoreScene(scene("s", { tagIds: ["rare"] }), ctx);

      expect(common).toBeLessThan(rare);
      expect(common).toBeCloseTo(
        TAG_WEIGHT * (Math.log(100 / 45) / Math.log(100)),
        10
      );
      expect(rare).toBeCloseTo(TAG_WEIGHT * (Math.log(20) / Math.log(100)), 10);
    });

    it("tagIdf: clamped to [0.05, 1], 1 for a tiny library or a missing df", () => {
      expect(tagIdf(45, 100)).toBeCloseTo(
        Math.log(100 / 45) / Math.log(100),
        10
      );
      expect(tagIdf(100, 100)).toBe(0.05);
      expect(tagIdf(0, 100)).toBe(1);
      expect(tagIdf(1, 100)).toBe(1);
      expect(tagIdf(1, 1)).toBe(1);
      expect(tagIdf(5, 0)).toBe(1);
    });

    it("an inherited-only tag counts 0.6; one also direct counts in full", () => {
      const affinity = buildEntityAffinity(
        affinityInput({ tagRatings: [rating("t1", 100)] })
      );
      const ctx = context(affinity);

      expect(
        scoreScene(scene("s", { inheritedTagIds: ["t1"] }), ctx)
      ).toBeCloseTo(TAG_WEIGHT * 0.6, 10);
      expect(
        scoreScene(scene("s", { tagIds: ["t1"], inheritedTagIds: ["t1"] }), ctx)
      ).toBeCloseTo(TAG_WEIGHT, 10);
    });

    it("only the top five positive tag contributions count; every negative one does", () => {
      const liked = ["t1", "t2", "t3", "t4", "t5", "t6", "t7"];
      const affinity = buildEntityAffinity(
        affinityInput({
          tagRatings: [
            ...liked.map((id) => rating(id, 100)),
            rating("half", 75),
            rating("bad1", 0),
            rating("bad2", 25),
          ],
        })
      );
      const ctx = context(affinity);

      expect(
        scoreScene(scene("s", { tagIds: [...liked, "half"] }), ctx)
      ).toBeCloseTo(TAG_WEIGHT * 5, 10);
      expect(
        scoreScene(scene("s", { tagIds: [...liked, "bad1", "bad2"] }), ctx)
      ).toBeCloseTo(TAG_WEIGHT * (5 - 1 - 0.5), 10);
    });

    it("ignored tags in the context never count", () => {
      const affinity = buildEntityAffinity(
        affinityInput({ tagRatings: [rating("t1", 100)] })
      );
      const ctx = context(affinity, { ignoredTags: new Set([k("t1")]) });

      expect(
        scoreScene(scene("s", { tagIds: ["t1"], inheritedTagIds: ["t1"] }), ctx)
      ).toBe(0);
    });

    it("adds the studio and the scene's own rating", () => {
      const affinity = buildEntityAffinity(
        affinityInput({ studioRatings: [rating("st1", null, true)] })
      );
      const ctx = context(affinity);

      expect(scoreScene(scene("s", { studioId: "st1" }), ctx)).toBeCloseTo(
        STUDIO_WEIGHT,
        10
      );
      expect(scoreScene(scene("s", { rating: 100 }), ctx)).toBeCloseTo(2, 10);
      expect(scoreScene(scene("s", { favorite: true }), ctx)).toBeCloseTo(
        1.4,
        10
      );
      expect(
        scoreScene(scene("s", { favorite: true, rating: 90 }), ctx)
      ).toBeCloseTo(1.6, 10);
      expect(scoreScene(scene("s", { rating: 25 }), ctx)).toBeCloseTo(-1, 10);
    });

    it("scores an entity only on its own instance", () => {
      const affinity = buildEntityAffinity(
        affinityInput({ performerRatings: [rating("12", null, true, A)] })
      );
      const ctx = context(affinity);

      expect(
        scoreScene(scene("s", { performerIds: ["12"], instanceId: A }), ctx)
      ).toBeCloseTo(LEAD_WEIGHT, 10);
      expect(
        scoreScene(scene("s", { performerIds: ["12"], instanceId: B }), ctx)
      ).toBe(0);
    });
  });

  describe("sceneTopLead", () => {
    const affinity = buildEntityAffinity(
      affinityInput({
        performerRatings: [rating("m1", null, true), rating("f2", 100)],
        ratedScenes: [scene("x", { performerIds: ["f1"], rating: 100 })],
      })
    );
    const { extra, prefs } = femaleLeads({
      m1: "MALE",
      f1: "FEMALE",
      f2: "FEMALE",
      f3: "FEMALE",
      f4: "FEMALE",
    });
    const ctx = context(affinity, extra, prefs);

    it("is the lead with the highest affinity, never a partner", () => {
      expect(
        sceneTopLead(scene("s", { performerIds: ["m1", "f1", "f2"] }), ctx)
      ).toBe(k("f2"));
    });

    it("is the first lead by id when no lead has affinity", () => {
      expect(
        sceneTopLead(scene("s", { performerIds: ["m1", "f4", "f3"] }), ctx)
      ).toBe(k("f3"));
    });

    it("is null without a lead", () => {
      expect(
        sceneTopLead(scene("s", { performerIds: ["m1"] }), ctx)
      ).toBeNull();
      expect(sceneTopLead(scene("s"), ctx)).toBeNull();
    });
  });

  describe("watchMultiplier", () => {
    const NOW = Date.parse("2026-10-13T12:00:00Z");
    const DAY = 24 * 60 * 60 * 1000;
    const ago = (ms: number) => new Date(NOW - ms);
    const kept = (lastPlayedAt: Date | null, oCount = 0) => ({
      hasHistory: true,
      kept: true,
      lastPlayedAt,
      oCount,
    });

    it.each([
      [
        "no history row",
        { hasHistory: false, kept: false, lastPlayedAt: null, oCount: 0 },
        [1, 1, 0.8],
      ],
      [
        "opened and abandoned",
        {
          hasHistory: true,
          kept: false,
          lastPlayedAt: ago(2 * DAY),
          oCount: 0,
        },
        [0.6, 0.5, 0.4],
      ],
      ["kept, an hour ago", kept(ago(60 * 60 * 1000)), [0, 0, 0]],
      ["kept, exactly a day ago", kept(ago(DAY)), [0.075, 0.15, 0.21]],
      ["kept, 5 days ago", kept(ago(5 * DAY)), [0.075, 0.15, 0.21]],
      ["kept, exactly 14 days ago", kept(ago(14 * DAY)), [0.2, 0.4, 0.56]],
      ["kept, 30 days ago", kept(ago(30 * DAY)), [0.2, 0.4, 0.56]],
      ["kept, exactly 60 days ago", kept(ago(60 * DAY)), [0.375, 0.75, 1.05]],
      ["kept, 200 days ago", kept(ago(200 * DAY)), [0.375, 0.75, 1.05]],
      ["kept, no date", kept(null), [0.375, 0.75, 1.05]],
    ] as const)("%s", (_state, state, [fresh, balanced, rewatch]) => {
      expect(watchMultiplier(state, "new", NOW)).toBeCloseTo(fresh, 10);
      expect(watchMultiplier(state, "balanced", NOW)).toBeCloseTo(balanced, 10);
      expect(watchMultiplier(state, "rewatch", NOW)).toBeCloseTo(rewatch, 10);
    });

    it("boosts kept scenes by their O count, up to 10", () => {
      const old = ago(90 * DAY);

      expect(watchMultiplier(kept(old, 3), "balanced", NOW)).toBeCloseTo(
        0.75 * 1.12,
        10
      );
      expect(watchMultiplier(kept(old, 10), "new", NOW)).toBeCloseTo(
        0.375 * 1.4,
        10
      );
      expect(watchMultiplier(kept(old, 20), "rewatch", NOW)).toBeCloseTo(
        1.05 * 1.8,
        10
      );
      expect(
        watchMultiplier(kept(ago(60 * 60 * 1000), 5), "rewatch", NOW)
      ).toBe(0);
    });
  });

  describe("countUserCriteria", () => {
    it("counts favorited and rated entities correctly", () => {
      const performerRatings = [
        { favorite: true, rating: null },
        { favorite: false, rating: 85 },
        { favorite: false, rating: 70 }, // Below 80, not counted as rated
      ];
      const studioRatings = [{ favorite: true, rating: 90 }];
      const tagRatings = [
        { favorite: false, rating: 80 },
        { favorite: false, rating: 80 },
      ];
      const sceneRatings = [
        { favorite: true, rating: null },
        { favorite: false, rating: 50 },
        { favorite: false, rating: 30 }, // Below 40, not counted
      ];

      const counts = countUserCriteria(
        performerRatings,
        studioRatings,
        tagRatings,
        sceneRatings,
        4
      );

      expect(counts.rankedEntities).toBe(4);
      expect(counts.favoritedPerformers).toBe(1);
      expect(counts.ratedPerformers).toBe(1);
      expect(counts.favoritedStudios).toBe(1);
      expect(counts.ratedStudios).toBe(1);
      expect(counts.favoritedTags).toBe(0);
      expect(counts.ratedTags).toBe(2);
      expect(counts.favoritedScenes).toBe(1);
      expect(counts.ratedScenes).toBe(1); // Only rating >= 40 counts
    });
  });

  describe("hasAnyCriteria", () => {
    const none = {
      favoritedPerformers: 0,
      ratedPerformers: 0,
      favoritedStudios: 0,
      ratedStudios: 0,
      favoritedTags: 0,
      ratedTags: 0,
      favoritedScenes: 0,
      ratedScenes: 0,
      rankedEntities: 0,
    };

    it("returns false when all counts are zero", () => {
      expect(hasAnyCriteria(none)).toBe(false);
    });

    it("returns true when only scene favorites exist", () => {
      expect(hasAnyCriteria({ ...none, favoritedScenes: 1 })).toBe(true);
    });

    it("returns true when only scene ratings exist", () => {
      expect(hasAnyCriteria({ ...none, ratedScenes: 3 })).toBe(true);
    });

    it("returns true when only ranked entities exist (watching, no ratings)", () => {
      expect(hasAnyCriteria({ ...none, rankedEntities: 2 })).toBe(true);
    });
  });
});
