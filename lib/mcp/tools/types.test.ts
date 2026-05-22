import { describe, expect, it } from "vitest";

import { errorResult, textResult } from "./types";

describe("textResult", () => {
  it("wraps a plain string into the MCP content block shape", () => {
    const r = textResult("hello");
    expect(r.content).toEqual([{ type: "text", text: "hello" }]);
    expect(r.isError).toBeUndefined();
  });

  it("includes structuredContent when provided", () => {
    const r = textResult("hello", { foo: 1 });
    expect(r.structuredContent).toEqual({ foo: 1 });
  });
});

describe("errorResult", () => {
  it("sets isError true and keeps the content block", () => {
    const r = errorResult("bad thing");
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe("bad thing");
  });
});
