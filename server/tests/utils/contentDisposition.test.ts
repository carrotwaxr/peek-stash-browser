import http from "http";
import { describe, expect, it } from "vitest";
import {
  attachmentContentDisposition,
  fileExtension,
  safeFileName,
  uniqueFileName,
} from "../../utils/contentDisposition.js";

describe("fileExtension", () => {
  it("takes the last extension of the path, lower-cased", () => {
    expect(fileExtension("/a/b/Clip.MKV", ".mp4")).toBe(".mkv");
    expect(fileExtension("/a/x.tar.wmv", ".mp4")).toBe(".wmv");
    expect(fileExtension("C:\\v\\a.AVI", ".mp4")).toBe(".avi");
  });

  it("falls back when the path has none, is null, or the extension is not 1 to 8 letters or digits", () => {
    for (const path of [
      "/a/noext",
      null,
      "/a.b/c",
      "/a/x.mp4 ",
      "/a/x.m p4",
      "/a/x.verylongext",
    ]) {
      expect(fileExtension(path, ".jpg")).toBe(".jpg");
    }
  });
});

describe("safeFileName", () => {
  it("names a blank file download", () => {
    expect(safeFileName("")).toBe("download");
    expect(safeFileName("  ")).toBe("download");
  });

  it("replaces each character reserved on some OS with _", () => {
    expect(safeFileName('a<b>:c"/d\\e|f?g*')).toBe("a_b__c__d_e_f_g_");
  });

  it("trims surrounding whitespace", () => {
    expect(safeFileName("  Test File  ")).toBe("Test File");
  });

  it("strips control characters, CR and LF included", () => {
    expect(safeFileName("a\r\nb\tc\u0000d\u001f\u007fe\u0085f")).toBe("abcdef");
  });

  it("trims dots and spaces at both ends", () => {
    expect(safeFileName(" .hidden ")).toBe("hidden");
    expect(safeFileName("Wait for it...")).toBe("Wait for it");
    expect(safeFileName("Title. ")).toBe("Title");
    expect(safeFileName("v1.2 final")).toBe("v1.2 final");
  });

  it("names '.', '..' and a name of only dots and spaces download", () => {
    for (const name of [".", "..", "...", " . . ", "\r\n"]) {
      expect(safeFileName(name)).toBe("download");
    }
  });

  it("never leaves a path that climbs out of its folder", () => {
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFileName("..\\..\\x")).toBe("_.._x");
  });

  it("prefixes Windows device names with _, with or without an extension", () => {
    expect(safeFileName("CON")).toBe("_CON");
    expect(safeFileName("nul")).toBe("_nul");
    expect(safeFileName("Aux ")).toBe("_Aux");
    expect(safeFileName("com1")).toBe("_com1");
    expect(safeFileName("LPT9.part")).toBe("_LPT9.part");
    expect(safeFileName("PRN .x")).toBe("_PRN .x");
    expect(safeFileName("CONSOLE")).toBe("CONSOLE");
    expect(safeFileName("Con Air")).toBe("Con Air");
    expect(safeFileName("COM10")).toBe("COM10");
  });

  it("caps a name at 200 UTF-8 bytes without splitting a character", () => {
    expect(safeFileName("a".repeat(300))).toBe("a".repeat(200));
    // é is 2 bytes, 🎬 is 4 (a surrogate pair in JS)
    expect(safeFileName("é".repeat(150))).toBe("é".repeat(100));
    expect(safeFileName("a" + "🎬".repeat(60))).toBe("a" + "🎬".repeat(49));
    // A cut that ends on a space or dot is trimmed again
    expect(safeFileName("a".repeat(199) + " b")).toBe("a".repeat(199));
  });
});

describe("uniqueFileName", () => {
  it("keeps the first name and numbers later ones that match it, ignoring case", () => {
    const taken = new Set<string>();
    expect(uniqueFileName("Scene", taken)).toBe("Scene");
    expect(uniqueFileName("scene", taken)).toBe("scene (2)");
    expect(uniqueFileName("Scene", taken)).toBe("Scene (3)");
    expect(uniqueFileName("Other", taken)).toBe("Other");
  });

  it("skips a numbered name another entry already has", () => {
    const taken = new Set<string>();
    expect(uniqueFileName("Scene (2)", taken)).toBe("Scene (2)");
    expect(uniqueFileName("Scene", taken)).toBe("Scene");
    expect(uniqueFileName("Scene", taken)).toBe("Scene (3)");
  });
});

describe("attachmentContentDisposition", () => {
  it("keeps a plain ASCII name in both parameters", () => {
    expect(attachmentContentDisposition("scene.mp4")).toBe(
      "attachment; filename=\"scene.mp4\"; filename*=UTF-8''scene.mp4"
    );
  });

  it("folds accents and replaces other non-ASCII with _ in the fallback, percent-encodes UTF-8 in filename*", () => {
    expect(attachmentContentDisposition("Kate’s picks 🎬.zip")).toBe(
      "attachment; filename=\"Kate_s picks _.zip\"; filename*=UTF-8''Kate%E2%80%99s%20picks%20%F0%9F%8E%AC.zip"
    );
    expect(attachmentContentDisposition("Café.mp4")).toBe(
      "attachment; filename=\"Cafe.mp4\"; filename*=UTF-8''Caf%C3%A9.mp4"
    );
  });

  it("drops control characters and neutralises quotes and backslashes", () => {
    expect(attachmentContentDisposition('a"b\\c\r\n.mp4')).toBe(
      "attachment; filename=\"a_b_c.mp4\"; filename*=UTF-8''a%22b%5Cc.mp4"
    );
  });

  it("percent-encodes the RFC 8187 non-attr-chars ' ( ) *", () => {
    expect(attachmentContentDisposition("(it's)*.mp4")).toContain(
      "filename*=UTF-8''%28it%27s%29%2A.mp4"
    );
  });

  it("falls back to download for an empty name", () => {
    expect(attachmentContentDisposition("")).toBe(
      "attachment; filename=\"download\"; filename*=UTF-8''download"
    );
  });

  it("always produces a legal header value", () => {
    const names = [
      "scene.mp4",
      "Kate’s picks 🎬.zip",
      "Café.mp4",
      'a"b\\c\r\n.mp4',
      "(it's)*.mp4",
      "",
      "日本語.mp4",
      "🎬",
    ];
    for (const name of names) {
      const value = attachmentContentDisposition(name);
      expect(() =>
        http.validateHeaderValue("Content-Disposition", value)
      ).not.toThrow();
    }
  });
});
