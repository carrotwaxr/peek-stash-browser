/**
 * Unit tests for the entity key and ref helpers (item 77).
 *
 * One entity id has three spellings; in memory it is `${id}\0${instanceId}`,
 * built only here, so two Stash servers' same ids never share a key.
 */
import { describe, expect, it } from "vitest";
import {
  type EntityRef,
  KEY_SEP,
  compositeKey,
  distinctRefs,
  entityKey,
  pairsJson,
} from "../../utils/entityRef.js";

const ref = (id: string, instanceId: string): EntityRef => ({
  id,
  instanceId,
});

describe("entityRef", () => {
  it("entityKey keeps the instance", () => {
    expect(entityKey("5", "A")).toBe("5\0A");
    expect(entityKey("5", "A")).not.toBe(entityKey("5", "B"));
  });

  it("compositeKey joins with KEY_SEP", () => {
    expect(KEY_SEP).toBe("\0");
    expect(compositeKey("tag", "5", "A")).toBe("tag\u00005\u0000A");
    expect(compositeKey("5", "A")).toBe(entityKey("5", "A"));
    // A separator no id holds keeps "1"+"23" apart from "12"+"3"
    expect(compositeKey("1", "23")).not.toBe(compositeKey("12", "3"));
  });

  it("distinctRefs drops only (id, instance) duplicates, first-seen order", () => {
    expect(distinctRefs([ref("5", "A"), ref("5", "B"), ref("5", "A")])).toEqual(
      [ref("5", "A"), ref("5", "B")]
    );
    expect(distinctRefs([ref("2", "A"), ref("1", "A"), ref("2", "A")])).toEqual(
      [ref("2", "A"), ref("1", "A")]
    );
  });

  it("pairsJson binds [id, instanceId] pairs", () => {
    expect(pairsJson([ref("1", "A"), ref("1", "B")])).toBe(
      '[["1","A"],["1","B"]]'
    );
    expect(pairsJson([])).toBe("[]");
  });
});
