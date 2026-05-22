import { describe, expect, it } from "vitest";

import { JRPC_ERR, err, isNotification, isValidRequest, ok } from "./jsonrpc";

describe("isValidRequest", () => {
  it("accepts a well-formed JSON-RPC request", () => {
    expect(isValidRequest({ jsonrpc: "2.0", id: 1, method: "initialize" })).toBe(true);
  });
  it("accepts a notification (no id)", () => {
    expect(isValidRequest({ jsonrpc: "2.0", method: "notifications/initialized" })).toBe(true);
  });
  it("rejects wrong jsonrpc version / missing method / non-objects", () => {
    expect(isValidRequest({ jsonrpc: "1.0", method: "x" })).toBe(false);
    expect(isValidRequest({ jsonrpc: "2.0" })).toBe(false);
    expect(isValidRequest("hello")).toBe(false);
    expect(isValidRequest(null)).toBe(false);
  });
});

describe("isNotification", () => {
  it("treats absent id as notification", () => {
    expect(isNotification({ jsonrpc: "2.0", method: "x" })).toBe(true);
  });
  it("treats explicit null id as a normal request (per JSON-RPC 2.0 wording)", () => {
    expect(isNotification({ jsonrpc: "2.0", id: null, method: "x" })).toBe(false);
  });
});

describe("envelope helpers", () => {
  it("ok produces a success envelope with the same id", () => {
    expect(ok(42, { a: 1 })).toEqual({ jsonrpc: "2.0", id: 42, result: { a: 1 } });
  });
  it("err produces an error envelope", () => {
    expect(err("abc", JRPC_ERR.methodNotFound, "no")).toEqual({
      jsonrpc: "2.0",
      id: "abc",
      error: { code: -32601, message: "no" },
    });
  });
  it("err with data includes it", () => {
    const e = err(1, JRPC_ERR.invalidParams, "bad", { field: "x" });
    expect(e.error.data).toEqual({ field: "x" });
  });
});
