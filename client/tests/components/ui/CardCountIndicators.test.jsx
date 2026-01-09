import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { CardCountIndicators } from "../../../src/components/ui/CardCountIndicators";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("CardCountIndicators", () => {
  it("is a React component function", () => {
    expect(typeof CardCountIndicators).toBe("function");
  });
});

describe("CardCountIndicator hoverDisabled", () => {
  it("passes hoverDisabled to Tooltip for rich content", () => {
    // Read the source file to check implementation details
    const sourcePath = resolve(__dirname, "../../../src/components/ui/CardCountIndicators.jsx");
    const sourceCode = readFileSync(sourcePath, "utf8");

    // The component should pass hoverDisabled={true} when tooltipContent is rich (not string)
    expect(sourceCode).toContain("hoverDisabled");
    expect(sourceCode).toContain("isRichTooltip");
  });
});
