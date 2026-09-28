/**
 * The logger writes one line per call and never throws: an Error in the
 * context keeps its name, message, stack, cause and database code, a BigInt
 * from a raw SQL row logs as a number (or a string past 2^53), a cycle logs
 * [Circular] while an object met twice without one logs twice, and a context
 * that cannot be serialised at all still logs the message.
 */
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogLevel, logger } from "../../utils/logger.js";
import { must } from "../helpers/must.js";

describe("logger", () => {
  const initialLevel = logger.getLevel();
  let lines: string[];

  beforeEach(() => {
    lines = [];
    const capture = (line: unknown) => {
      lines.push(String(line));
    };
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "log").mockImplementation(capture);
    logger.setLevel(LogLevel.DEBUG);
  });

  afterEach(() => {
    logger.setLevel(initialLevel);
    vi.restoreAllMocks();
  });

  const onlyLine = () => {
    expect(lines).toHaveLength(1);
    return must(lines[0]);
  };

  it("an Error in the context logs its name, message and stack", () => {
    logger.error("x", { error: new Error("boom") });

    const line = onlyLine();
    expect(line).toContain('"name":"Error","message":"boom"');
    expect(line).toContain('"stack":"Error: boom');
  });

  it("an error's cause and a Prisma error's code and meta are kept", () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`id`)",
      { code: "P2002", clientVersion: "test", meta: { target: ["id"] } }
    );
    logger.error("x", {
      error: Object.assign(new Error("save failed"), { cause: prismaError }),
    });

    const line = onlyLine();
    expect(line).toContain('"message":"save failed"');
    expect(line).toContain(
      '"cause":{"name":"PrismaClientKnownRequestError","message":"Unique constraint failed'
    );
    expect(line).toContain('"code":"P2002"');
    expect(line).toContain('"meta":{"target":["id"]}');
  });

  it("a BigInt logs as a number, and one past 2^53 as a string, without throwing", () => {
    expect(() => {
      logger.info("row", { count: 42n, big: 2n ** 60n, negative: -7n });
    }).not.toThrow();

    const line = onlyLine();
    expect(line).toContain('"count":42');
    expect(line).toContain('"big":"1152921504606846976"');
    expect(line).toContain('"negative":-7');
  });

  it("a circular context logs [Circular] without throwing", () => {
    const context: Record<string, unknown> = { id: 1 };
    context.self = context;
    const error: Error & { cause?: unknown } = new Error("loop");
    error.cause = error;

    expect(() => {
      logger.warn("x", { context, error });
    }).not.toThrow();

    const line = onlyLine();
    expect(line).toContain('"self":"[Circular]"');
    expect(line).toContain('"message":"loop"');
    expect(line).toContain('"cause":"[Circular]"');
  });

  it("the same object under two keys logs twice", () => {
    const shared = { id: 7, error: new Error("shared") };

    logger.info("x", { a: shared, b: shared, list: [shared, shared] });

    const line = onlyLine();
    expect(line).not.toContain("[Circular]");
    const once = `{"id":7,"error":{"name":"Error","message":"shared"`;
    expect(line.split(once)).toHaveLength(5);
    expect(line).toContain(`"a":${once}`);
    expect(line).toContain(`"b":${once}`);
    expect(line).toContain(`"list":[${once}`);
  });

  it("a context that cannot be serialised still logs the message", () => {
    const hostile = {
      get value(): never {
        throw new Error("getter failed");
      },
    };

    expect(() => {
      logger.error("the message", { hostile });
    }).not.toThrow();

    const line = onlyLine();
    expect(line).toContain("[ERROR] the message [unserialisable context]");
  });

  it("keeps the one-line format for a plain context", () => {
    logger.debug("hello", { a: 1, b: "two", c: null, d: [1, 2] });

    expect(onlyLine()).toMatch(
      /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[DEBUG\] hello \{"a":1,"b":"two","c":null,"d":\[1,2\]\}$/
    );
  });
});
