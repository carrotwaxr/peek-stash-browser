import { describe, expect, it } from "vitest";
import { getConfigDir } from "../../utils/configDir.js";

describe("getConfigDir", () => {
  it("is the image's data volume when CONFIG_DIR is unset or empty", () => {
    expect(getConfigDir({})).toBe("/app/data");
    expect(getConfigDir({ CONFIG_DIR: "" })).toBe("/app/data");
  });

  it("is CONFIG_DIR when set", () => {
    expect(getConfigDir({ CONFIG_DIR: "/x" })).toBe("/x");
  });
});
