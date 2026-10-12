import { describe, expect, it } from "vitest";
import { parseTolerantJson, pruneToSchema } from "../src/providers/tolerant-json";

describe("容错解析（部署端事件 5）", () => {
  it("删除字符串之外、紧随 ] 或 } 的多余逗号，并报告修复", () => {
    const parsed = parseTolerantJson('{"a":[1,2,],"b":{"c":1,},}');
    expect(parsed.value).toEqual({ a: [1, 2], b: { c: 1 } });
    expect(parsed.repaired).toBe(true);
  });
  it("字符串内部的 ,} 与转义引号原样保留", () => {
    const parsed = parseTolerantJson('{"a":"x,}y \\" ,]","b":1}');
    expect(parsed.value).toEqual({ a: 'x,}y " ,]', b: 1 });
    expect(parsed.repaired).toBe(false);
  });
  it("合法 JSON 不报告修复；真正损坏的仍然失败", () => {
    expect(parseTolerantJson('{"a":1}').repaired).toBe(false);
    expect(() => parseTolerantJson('{"a":,,}')).toThrow();
  });
});

describe("按 Schema 丢弃未知字段（部署端事件 6）", () => {
  const schema = {
    $ref: "#/definitions/Root",
    definitions: {
      Root: { type: "object", additionalProperties: false, properties: {
        name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        child: { anyOf: [{ $ref: "#/definitions/Child" }, { type: "null" }] },
        list: { type: "array", items: { $ref: "#/definitions/Child" } },
      } },
      Child: { type: "object", additionalProperties: false, properties: { id: { type: "string" } } },
    },
  };
  it("递归丢弃白名单外的键，已知键内容不变，并返回被丢弃的键名", () => {
    const input = { name: "n", extra: 1, tags: ["a"], child: { id: "1", note: "x" }, list: [{ id: "2", z: 1 }] };
    const out = pruneToSchema(input, schema);
    expect(out.value).toEqual({ name: "n", tags: ["a"], child: { id: "1" }, list: [{ id: "2" }] });
    expect(out.dropped.sort()).toEqual(["extra", "note", "z"]);
  });
  it("合法输入逐字不变；null 分支保留", () => {
    const input = { name: "n", tags: [], child: null, list: [] };
    const out = pruneToSchema(input, schema);
    expect(out.value).toEqual(input);
    expect(out.dropped).toEqual([]);
  });
});
