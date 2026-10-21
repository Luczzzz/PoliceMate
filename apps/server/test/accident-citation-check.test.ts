import { describe, expect, it } from "vitest";
import type { LegalSourceReference } from "@policymate/contracts";
import { checkCitations, citationNotice } from "../src/accident-liability/citation-check";

function source(over: Partial<LegalSourceReference> = {}): LegalSourceReference {
  return {
    sourceId: "src-cn-civil-code",
    version: "2021.01.2",
    title: "中华人民共和国民法典",
    issuingAuthority: "全国人民代表大会",
    documentNumber: "主席令第四十五号",
    authorityLevel: "法律",
    region: "国家",
    status: "current",
    statusLabel: "现行有效",
    publishedAt: "2020-05-28T00:00:00.000Z",
    effectiveAt: "2021-01-01T00:00:00.000Z",
    officialUrl: "https://flk.npc.gov.cn/",
    retrievedAt: "2026-09-28T00:00:00.000Z",
    lastVerifiedAt: "2026-09-28T00:00:00.000Z",
    nextReviewDueAt: "2026-10-28T00:00:00.000Z",
    maintainer: "受控试行内容维护者",
    articles: [
      {
        location: "第一千一百六十五条",
        minimalText: "行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。",
      },
    ],
    ...over,
  };
}

describe("事故研判意见的事后引用核对（ADR-0019）", () => {
  it("命中的确定引用由后端附上条文原文与版本，不采信模型写法", () => {
    const result = checkCitations(
      "法律依据\n《中华人民共和国民法典》第一千一百六十五条：过错责任。",
      [source()],
    );
    expect(result.verified).toEqual([
      {
        title: "中华人民共和国民法典",
        article: "第一千一百六十五条",
        minimalText: "行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。",
        version: "2021.01.2",
        officialUrl: "https://flk.npc.gov.cn/",
      },
    ]);
    expect(result.unverified).toEqual([]);
    expect(result.text).toContain("《中华人民共和国民法典》第一千一百六十五条：过错责任。");
    expect(citationNotice(result)).toContain("依据核对（系统比对本次受治理法源，非模型输出）");
    expect(citationNotice(result)).toContain("第一千一百六十五条（2021.01.2）");
  });

  it("法源名对但条号不在本次法源集中时降级标注，且不当成确定引用", () => {
    const result = checkCitations("《中华人民共和国民法典》第一千一百七十九条：赔偿范围。", [source()]);
    expect(result.verified).toEqual([]);
    expect(result.unverified).toEqual([{ title: "中华人民共和国民法典", article: "第一千一百七十九条" }]);
    expect(result.text).toContain("第一千一百七十九条〔条号未经核对〕");
    expect(citationNotice(result)).toContain("未在本次受治理法源中找到");
  });

  it("整部法源不在本次适用法源集里（例如只给了范围登记、没有条款）时同样降级", () => {
    const scopeOnly = source({ sourceId: "src-cn-road-traffic-safety-law", title: "中华人民共和国道路交通安全法", articles: [] });
    const result = checkCitations("《中华人民共和国道路交通安全法》第七十六条：过错责任。", [scopeOnly]);
    expect(result.verified).toEqual([]);
    expect(result.unverified).toEqual([{ title: "中华人民共和国道路交通安全法", article: "第七十六条" }]);
    expect(result.text).toContain("〔条号未经核对〕");
  });

  it("只写方向提示、不写条号时不产生任何核对噪音", () => {
    const result = checkCitations("〔待核对〕《中华人民共和国道路交通安全法》关于机动车与非机动车过错责任的规定。", [
      source({ title: "中华人民共和国道路交通安全法", articles: [] }),
    ]);
    expect(result.verified).toEqual([]);
    expect(result.unverified).toEqual([]);
    expect(citationNotice(result)).toContain("本报告未写出条号，未做条文比对");
  });

  it("同一处未命中引用只登记一次，重复出现不叠标注", () => {
    const text = "《中华人民共和国民法典》第一千一百七十九条〔条号未经核对〕；又见《中华人民共和国民法典》第一千一百七十九条。";
    const result = checkCitations(text, [source()]);
    expect(result.unverified).toHaveLength(1);
    expect(result.text.match(/〔条号未经核对〕/g)).toHaveLength(2);
  });
});
