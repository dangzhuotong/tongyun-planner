import { describe, it, expect } from "vitest";
import { safeJsonParse } from "./json";

describe("safeJsonParse", () => {
  it("should return fallback when value is null, undefined, or empty string", () => {
    expect(safeJsonParse(null, { default: true })).toEqual({ default: true });
    expect(safeJsonParse(undefined, [1, 2])).toEqual([1, 2]);
    expect(safeJsonParse("", "fallback")).toBe("fallback");
  });

  it("should parse valid JSON objects and arrays", () => {
    const obj = safeJsonParse('{"key":"value","count":42}', {});
    expect(obj).toEqual({ key: "value", count: 42 });

    const arr = safeJsonParse<number[]>("[1, 2, 3]", []);
    expect(arr).toEqual([1, 2, 3]);
  });

  it("should parse valid primitive values", () => {
    expect(safeJsonParse("123", 0)).toBe(123);
    expect(safeJsonParse('"hello"', "")).toBe("hello");
    expect(safeJsonParse("true", false)).toBe(true);
  });

  it("should return fallback on malformed JSON", () => {
    expect(safeJsonParse("{invalid:json", { ok: false })).toEqual({ ok: false });
    expect(safeJsonParse("[1, 2,", [])).toEqual([]);
  });
});
