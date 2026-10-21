import type { LegalSourceRecord } from "./model";

/**
 * 交通事故责任认定辅助的“可提示法源”范围登记。
 *
 * 这两条记录**故意不带条款原文**（`articles: []`）。它们只承担一件事：告诉模型
 * 一起道路交通事故通常落在哪些法源范围内，使模型可以给出「〔待核对〕《道路
 * 交通安全法》关于机动车与非机动车过错责任的规定」这一档**方向提示**。
 *
 * 为什么不带条款：条文原文必须由内容维护者逐字核对官方公布文本后才能录入，
 * 不得凭记忆或由模型代写。在录入并核验之前，这两部法只能被点名，不能被写成
 * 「《道路交通安全法》第 76 条」这种确定引用——那会给出一个没人核对过的条号。
 *
 * 补条款的流程与既有国家公开法源一致：逐字录入原文 → 填 `contentHash` 与
 * `lastVerifiedAt` → 设置 30 天复核期限 → 重新发布批次。
 */

const TRAFFIC_MAINTAINER = "受控试行内容维护者（国家公开法源）";
/** 范围登记同样需要复核期限：法源改名、废止或修正后不得继续被点名。 */
const TRAFFIC_VERIFIED_AT = "2026-10-21T00:00:00.000Z";
const TRAFFIC_RETRIEVED_AT = "2026-10-21T00:00:00.000Z";
const TRAFFIC_NEXT_REVIEW_DUE_AT = "2026-11-20T00:00:00.000Z";

/** 《中华人民共和国道路交通安全法》：2021 年修正，自公布之日施行。 */
export const ROAD_TRAFFIC_SAFETY_LAW: LegalSourceRecord = {
  sourceId: "src-cn-road-traffic-safety-law",
  version: "2021.04.1",
  title: "中华人民共和国道路交通安全法",
  issuingAuthority: "全国人民代表大会常务委员会",
  documentNumber: "中华人民共和国主席令第八十一号（2021年修正）",
  authorityLevel: "法律",
  region: "国家",
  status: "current",
  publishedAt: "2003-10-28T00:00:00.000Z",
  effectiveAt: "2004-05-01T00:00:00.000Z",
  officialUrl: "https://www.gov.cn/xinwen/2021-04/29/content_5603864.htm",
  retrievedAt: TRAFFIC_RETRIEVED_AT,
  contentHash: "cn-road-traffic-safety-law-2021-04.1",
  // 范围登记：尚无逐字核验的条款原文，因此只能作为方向提示的来源。
  articles: [],
  domains: ["traffic"],
  lastVerifiedAt: TRAFFIC_VERIFIED_AT,
  nextReviewDueAt: TRAFFIC_NEXT_REVIEW_DUE_AT,
  maintainer: TRAFFIC_MAINTAINER,
};

/** 《中华人民共和国道路交通安全法实施条例》：2004 年公布，2017 年修订。 */
export const ROAD_TRAFFIC_SAFETY_REGULATION: LegalSourceRecord = {
  sourceId: "src-cn-road-traffic-safety-regulation",
  version: "2017.10.1",
  title: "中华人民共和国道路交通安全法实施条例",
  issuingAuthority: "国务院",
  documentNumber: "国务院令第405号（2017年修订）",
  authorityLevel: "行政法规",
  region: "国家",
  status: "current",
  publishedAt: "2004-04-30T00:00:00.000Z",
  effectiveAt: "2004-05-01T00:00:00.000Z",
  officialUrl: "https://www.gov.cn/zhengce/zhengceku/2017-10/23/content_5233848.htm",
  retrievedAt: TRAFFIC_RETRIEVED_AT,
  contentHash: "cn-road-traffic-safety-regulation-2017-10.1",
  articles: [],
  domains: ["traffic"],
  lastVerifiedAt: TRAFFIC_VERIFIED_AT,
  nextReviewDueAt: TRAFFIC_NEXT_REVIEW_DUE_AT,
  maintainer: TRAFFIC_MAINTAINER,
};

export function createTrafficLegalSources(): LegalSourceRecord[] {
  return [ROAD_TRAFFIC_SAFETY_LAW, ROAD_TRAFFIC_SAFETY_REGULATION];
}
