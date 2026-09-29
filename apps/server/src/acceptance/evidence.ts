import type { ManualAcceptanceRecord } from "./types";

/**
 * 设备、浏览器、可访问性与性能验收记录。
 *
 * 自动化代理记录由 Playwright 在确定性的浏览器引擎/设备仿真下执行并通过；
 * 真实设备、真实屏幕阅读器与真实网络环境必须由人在设备上执行并补充结果，
 * 未完成前 `blocksRelease` 记录会阻断受控试行发布检查（规格 15、18.1）。
 *
 * 记录中不得包含任何案情、事实、报告或个人信息；`operator` 只记录角色。
 */

const AUTOMATED_PROXY_BROWSER = "Playwright 浏览器引擎/设备仿真（确定性替身边界）";
const AUTOMATED_PROXY_OPERATOR = "受控试行验收脚本";

export const MANUAL_ACCEPTANCE_RECORDS: ManualAcceptanceRecord[] = [
  {
    id: "browser-android-chrome",
    kind: "browser",
    title: "当前及前一个主要版本 Android Chrome 核心流程",
    method: "automated-proxy",
    environment: "Chromium 移动仿真（Pixel 7 / Android Chrome User-Agent），竖屏 412×915",
    performedAt: "2026-09-29",
    result: "pass",
    evidence: [{ file: "e2e/cross-browser.spec.ts", title: "核心流程在目标移动浏览器引擎下可用" }],
    operator: AUTOMATED_PROXY_OPERATOR,
    notes: "以 Chromium 引擎代理 Android Chrome；真实机型抽查仍建议在试行前完成。",
    blocksRelease: true,
  },
  {
    id: "browser-wechat-embedded",
    kind: "browser",
    title: "当前微信内置浏览器核心流程",
    method: "automated-proxy",
    environment: "Chromium 移动仿真 + 微信内置浏览器 User-Agent（MicroMessenger）",
    performedAt: "2026-09-29",
    result: "pass",
    evidence: [{ file: "e2e/cross-browser.spec.ts", title: "核心流程在目标移动浏览器引擎下可用" }],
    operator: AUTOMATED_PROXY_OPERATOR,
    notes: "以 Chromium 引擎加微信 User-Agent 代理微信内置浏览器；真机微信仍需人工确认分享/返回行为。",
    blocksRelease: true,
  },
  {
    id: "browser-ios-safari",
    kind: "browser",
    title: "当前及前一个主要版本 iOS Safari 核心流程",
    method: "manual",
    environment: "真实 iPhone + iOS Safari（当前及前一个主要版本）",
    performedAt: "",
    result: "not_run",
    evidence: [{ file: "e2e/cross-browser.spec.ts", title: "核心流程在目标移动浏览器引擎下可用" }],
    operator: "受控试行验收负责人",
    notes:
      "本仓库运行环境无法安装 WebKit 依赖，必须在真实 iPhone 上执行 e2e/cross-browser 同名流程并回填结果、设备型号与系统版本。",
    blocksRelease: true,
  },
  {
    id: "a11y-device-assistive-tech",
    kind: "accessibility",
    title: "真实设备系统字体放大与屏幕阅读器顺序",
    method: "manual",
    environment: "真实 iPhone VoiceOver / Android TalkBack + 系统字体最大档",
    performedAt: "",
    result: "not_run",
    evidence: [
      { file: "e2e/accessibility.spec.ts", title: "系统字体放大到 200% 时关键内容不被截断且仍可操作" },
      { file: "e2e/accessibility.spec.ts", title: "屏幕阅读器可依次读取总体状态、主判断与固定六模块索引" },
    ],
    operator: "受控试行验收负责人",
    notes: "自动化代理已覆盖字体放大、可访问名称与焦点顺序；真实屏幕阅读器听读仍需人工确认。",
    blocksRelease: true,
  },
  {
    id: "performance-real-device-4g",
    kind: "performance",
    title: "中端测试手机 + 普通 4G 首次可操作时间",
    method: "manual",
    environment: "约定中端测试手机 + 普通 4G（非 WiFi）",
    performedAt: "",
    result: "not_run",
    evidence: [{ file: "e2e/performance.spec.ts", title: "4G 限速与中端 CPU 下首页 3 秒内进入可操作状态" }],
    operator: "受控试行验收负责人",
    notes: "自动化代理使用 CDP 4G 限速与 4× CPU 降速；真实机型仍需人工记录首次可操作时间。",
    blocksRelease: true,
  },
];

/** 未通过即阻断发布的记录。 */
export function blockingManualRecords(
  records: readonly ManualAcceptanceRecord[] = MANUAL_ACCEPTANCE_RECORDS,
): ManualAcceptanceRecord[] {
  return records.filter((record) => record.blocksRelease);
}
