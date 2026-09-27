/**
 * 外部边界提供者接口。
 *
 * 浏览器黑盒测试只在 Dify 与受治理内容两个外部边界使用确定性替身，
 * 其余产品状态机、校验、隐私和失败处理保持在同一个可观测缝内。
 */

/** 后端对一个外部服务可用性的判断。 */
export interface ServiceAvailability {
  available: boolean;
  /** 面向民警的不可用原因；可用时为 `null`。 */
  reason: string | null;
}

/** Dify 集成适配层的可用性边界。后续切片在此之上增加结构化结果契约。 */
export interface DifyProvider {
  readonly kind: string;
  getAvailability(): Promise<ServiceAvailability>;
}

/** 当前激活的不可变内容发布批次摘要。 */
export interface GovernedContentRelease {
  releaseId: string;
  /** 当前批次中通过治理门槛、可用于生产的文书范例变体数量。 */
  eligibleExampleCount: number;
}

/** 受治理内容读取边界。 */
export interface GovernedContentProvider {
  readonly kind: string;
  getActiveRelease(): Promise<GovernedContentRelease>;
}

export interface Providers {
  dify: DifyProvider;
  content: GovernedContentProvider;
}
