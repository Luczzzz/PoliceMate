import type { AcceptanceScenario } from "./types";

/**
 * 受控试行验收矩阵：规格 17 节的 AC-01 至 AC-34。
 *
 * 每个场景至少绑定一类证据：自动化测试、人工/设备记录或专项演练。
 * `coverage.ts` 会校验 ID 完整、引用存在且没有重复，防止任何场景被静默
 * 删除或悄悄改成“未覆盖”。测试标题必须与源码字面一致。
 */
export const ACCEPTANCE_SCENARIOS: AcceptanceScenario[] = [
  {
    id: "AC-01",
    title: "输入脱敏的典型重点案情并确认完整事实后生成结构完整、可追溯的初步意见报告",
    specSections: ["6", "7", "10"],
    automated: [
      { file: "apps/server/test/case-focus-scenarios.test.ts", title: "%s 生成完整且可追溯的六模块报告" },
      { file: "apps/server/test/public-order-drug-scenarios.test.ts", title: "%s 生成完整且可追溯的六模块报告" },
      { file: "apps/server/test/family-minor-scenarios.test.ts", title: "%s 生成完整且可追溯的六模块报告" },
      { file: "e2e/analysis-flow.spec.ts", title: "提交脱敏案情后直接进入报告页，无需任何确认或回答步骤" },
    ],
    manual: ["browser-android-chrome", "browser-wechat-embedded", "browser-ios-safari"],
    drills: [],
  },
  {
    id: "AC-02",
    title: "缺少决定性事实时直接生成条件不足报告，不阻断报告生成",
    specSections: ["6.4", "6.5", "7.2"],
    automated: [
      { file: "apps/server/test/case-focus-scenarios.test.ts", title: "%s 缺失决定性事实时降级为条件不足" },
      { file: "apps/server/test/analysis-api.test.ts", title: "提交案情一次请求即返回事实快照与分析报告，无需确认或回答步骤" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-03",
    title: "两个相邻定性无法合理排除时展示多种可能及转换条件",
    specSections: ["7.2", "7.4.1"],
    automated: [
      { file: "apps/server/test/case-focus-scenarios.test.ts", title: "相邻方向不能排除时优先于条件不足（保守顺序）" },
      { file: "apps/server/test/public-order-drug-scenarios.test.ts", title: "同一连续案情同时命中赌博与毒品时保留多种可能" },
      { file: "apps/server/test/family-minor-scenarios.test.ts", title: "同一连续案情同时涉及家庭暴力与侵害未成年人时，保留多种可能，不相互吸收" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-04",
    title: "候选、未知或争议事实不支撑主结论，只形成缺口、分支或风险提示",
    specSections: ["6.3", "7"],
    automated: [
      { file: "apps/server/test/case-focus-content.test.ts", title: "候选事实参与首份分析匹配，已排除事实不参与" },
      { file: "apps/server/test/family-minor-content.test.ts", title: "候选事实参与首份分析匹配，已排除事实不参与" },
      { file: "apps/server/test/family-minor-scenarios.test.ts", title: "%s 保留争议事实：结果事实存在争议时保留冲突表述并保守降级" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-05",
    title: "修改决定性事实并确认新快照后旧报告立即失效且旧临时标记不迁移",
    specSections: ["6.7", "8.4"],
    automated: [
      { file: "apps/server/test/analysis-workbench.test.ts", title: "确认新快照后旧报告失效并生成绑定新快照的报告" },
      { file: "e2e/report-workbench.spec.ts", title: "替代或争议事实必须由民警显式选择，确认新快照后旧报告失效且状态不迁移" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-06",
    title: "法源废止、过期或无法确认时相关内容退出生产并降级为依据不可用",
    specSections: ["7.2", "12", "13.7"],
    automated: [
      { file: "apps/server/test/case-focus-content.test.ts", title: "依赖法源比内容更早到期时，重点案情随法源到期" },
      { file: "apps/server/test/app.test.ts", title: "依赖非 current 法源时内容退出列表" },
      { file: "apps/server/test/case-focus-api.test.ts", title: "紧急禁用重点案情后，相关分析降级为依据不可用" },
      { file: "apps/server/test/case-focus-scenarios.test.ts", title: "%s 在法源失效或禁用后只展示依据不可用" },
    ],
    manual: [],
    drills: [
      "drill-legal-source-repealed",
      "drill-legal-source-uncertain",
      "drill-fail-closed-status",
      "drill-single-case-focus-disabled",
    ],
  },
  {
    id: "AC-07",
    title: "Dify 空结果、无效结构或无法匹配的条款时最多重试一次后失败关闭",
    specSections: ["10.3", "12.1"],
    automated: [
      { file: "apps/server/test/failure-modes.test.ts", title: "提取超时：重试一次后失败关闭并返回请求编号" },
      { file: "apps/server/test/failure-modes.test.ts", title: "报告空结果、结构错误、来源不匹配、跨模块矛盾或超时：失败关闭" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-08",
    title: "报告生成超过 90 秒时显示超时失败状态和请求编号，迟到响应不得回写",
    specSections: ["12.2"],
    automated: [
      { file: "apps/server/test/failure-modes.test.ts", title: "报告空结果、结构错误、来源不匹配、跨模块矛盾或超时：失败关闭" },
      { file: "apps/server/test/analysis-lifecycle.test.ts", title: "报告超时后的迟到响应不得回写会话状态" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-09",
    title: "取消生成或清除分析时在途请求取消且迟到响应被拒绝",
    specSections: ["11.6", "12.2"],
    automated: [
      { file: "apps/server/test/analysis-api.test.ts", title: "读取当前状态并清除本次分析" },
      { file: "apps/server/test/analysis-lifecycle.test.ts", title: "清除分析后的迟到响应被拒绝" },
      { file: "e2e/analysis-resilience.spec.ts", title: "提交后显示真实阶段与已等待时间，不显示百分比，并可取消" },
      { file: "e2e/privacy.spec.ts", title: "清除本次分析需要二次确认；取消确认时保留当前状态" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-10",
    title: "空闲 30 分钟、刷新或关闭标签页后案情、报告和临时状态不可恢复",
    specSections: ["8.4", "11.1"],
    automated: [
      { file: "apps/server/test/analysis-api.test.ts", title: "空闲超过 30 分钟后服务端会话不可恢复" },
      { file: "e2e/privacy.spec.ts", title: "空闲 30 分钟后当前标签页状态不可恢复" },
      { file: "e2e/privacy.spec.ts", title: "案情不进入浏览器存储、URL、Service Worker 缓存或控制台输出" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-11",
    title: "标记本次已核对只改变本地展示状态，不改变事实、报告、Dify 输入或完成率",
    specSections: ["8"],
    automated: [
      { file: "e2e/report-workbench.spec.ts", title: "标记与筛选不写入 URL、不触发后端请求、不改变报告结论" },
      { file: "apps/server/test/analysis-workbench.test.ts", title: "证据清单与询问要点返回结构化项目，其他模块不携带工作台项目" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-12",
    title: "筛选临时工作台时显示 X/Y 和清除筛选，原始顺序、内容和结论不变",
    specSections: ["8.2"],
    automated: [
      { file: "e2e/report-workbench.spec.ts", title: "展开折叠、两个可同时存在的临时标记、筛选 X/Y 与清除筛选" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-13",
    title: "文书任务关联多个可能变体时展示差异和待核验条件，不自动选择唯一范例",
    specSections: ["9.3"],
    automated: [
      { file: "apps/server/test/analysis-workbench.test.ts", title: "只使用程序类别、办理阶段、适用对象和案情标签筛选，并返回差异与选择前需核验条件" },
      { file: "apps/server/test/document-example-content.test.ts", title: "多个变体可能适用时并列展示差异，不自动选择唯一范例" },
      { file: "e2e/report-workbench.spec.ts", title: "只按结构化条件筛选候选，展示差异与选择前需核验，不自动选择唯一范例" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-14",
    title: "文书检索无结果时显示当前没有匹配的已核验范例并允许返回分类浏览",
    specSections: ["9.2"],
    automated: [
      { file: "e2e/document-examples.spec.ts", title: "筛选条件组合后无匹配结果时显示明确状态并可返回分类浏览" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-15",
    title: "文书范例在打开后被紧急下架时旧链接不能继续访问正文",
    specSections: ["9.5", "13.7"],
    automated: [
      { file: "apps/server/test/content.test.ts", title: "单个范例下架后从索引消失，旧链接返回 unavailable" },
      { file: "apps/server/test/app.test.ts", title: "单项下架后旧链接不能访问正文" },
      { file: "e2e/document-examples.spec.ts", title: "单项下架后列表与旧链接同步失效" },
    ],
    manual: [],
    drills: ["drill-single-example-withdrawn"],
  },
  {
    id: "AC-16",
    title: "Dify 故障但文书内容有效时案情分析暂不可用而文书范例仍可浏览",
    specSections: ["12.4"],
    automated: [
      { file: "apps/server/test/app.test.ts", title: "在替身状态下反映分析服务不可用，但保持文书范例可用" },
      { file: "e2e/availability.spec.ts", title: "案情分析不可用时文书范例仍可浏览" },
    ],
    manual: [],
    drills: ["drill-analysis-entry-disabled", "drill-master-switch"],
  },
  {
    id: "AC-17",
    title: "文书范例全部失效时首页保留入口但显示暂不可用，不进入空列表",
    specSections: ["3.4", "12.4"],
    automated: [
      { file: "apps/server/test/app.test.ts", title: "当前批次没有合格范例时禁用文书范例入口" },
      { file: "e2e/availability.spec.ts", title: "文书范例不可用时在点击前显示暂不可用，且不进入空入口" },
      { file: "e2e/document-examples.spec.ts", title: "全部范例失效时入口在点击前显示暂不可用" },
    ],
    manual: [],
    drills: ["drill-no-eligible-examples"],
  },
  {
    id: "AC-18",
    title: "页面包含真实身份信息时产品不宣称自动识别，警示常驻且不持久化或进入内容日志",
    specSections: ["11.2", "11.4"],
    automated: [
      { file: "apps/server/test/privacy.test.ts", title: "案情、事实与回答不进入遥测记录" },
      { file: "apps/server/test/privacy-canary.test.ts", title: "合成 canary 不进入遥测、日志、缓存或第三方工具" },
      { file: "e2e/privacy.spec.ts", title: "案情不进入浏览器存储、URL、Service Worker 缓存或控制台输出" },
      { file: "e2e/analysis-flow.spec.ts", title: "常驻显示脱敏义务、Dify 处理提示与字符计数" },
    ],
    manual: [],
    drills: ["drill-privacy-canary"],
  },
  {
    id: "AC-19",
    title: "输入超长文本或不支持格式时明确拒绝，不静默截断或解析",
    specSections: ["6.2", "12.3"],
    automated: [
      { file: "apps/server/test/analysis-api.test.ts", title: "拒绝超过 10,000 字符的案情，且不静默截断" },
      { file: "e2e/analysis-flow.spec.ts", title: "超过 10,000 字符时明确拒绝，不静默截断" },
      { file: "e2e/analysis-resilience.spec.ts", title: "输入格式不支持时同样显示输入状态" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-20",
    title: "契约版本不兼容时停止分析并提示刷新或更新，不猜测字段",
    specSections: ["10.5"],
    automated: [
      { file: "apps/server/test/app.test.ts", title: "拒绝不兼容的契约版本" },
      { file: "e2e/states.spec.ts", title: "契约版本不兼容时提示更新页面" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-21",
    title: "主判断与受立案条件或依据链路矛盾时阻止主判断展示并降级",
    specSections: ["7", "10.3", "12.1"],
    automated: [
      { file: "apps/server/test/failure-modes.test.ts", title: "报告空结果、结构错误、来源不匹配、跨模块矛盾或超时：失败关闭" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-22",
    title: "次要证据项生成失败但关键模块有效时展示通过校验的部分并标记局部失败",
    specSections: ["7.3", "10.3"],
    automated: [
      { file: "apps/server/test/failure-modes.test.ts", title: "次要模块局部失败时保留其他模块并明确标记局部失败" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-23",
    title: "系统字体放大并使用屏幕阅读器时核心流程、状态和操作顺序完整可用",
    specSections: ["15.2"],
    automated: [
      { file: "e2e/accessibility.spec.ts", title: "系统字体放大到 200% 时关键内容不被截断且仍可操作" },
      { file: "e2e/accessibility.spec.ts", title: "屏幕阅读器可依次读取总体状态、主判断与固定六模块索引" },
      { file: "e2e/accessibility.spec.ts", title: "键盘焦点顺序与视觉阅读顺序一致且焦点可见" },
      { file: "e2e/accessibility.spec.ts", title: "正文与关键状态达到最小对比度且状态不只依赖颜色" },
      { file: "e2e/accessibility.spec.ts", title: "减少动态效果设置下不依赖动画完成任务" },
      { file: "e2e/responsive.spec.ts", title: "关键状态不只依赖颜色表达" },
    ],
    manual: ["a11y-device-assistive-tech"],
    drills: [],
  },
  {
    id: "AC-24",
    title: "普通 4G 和中端手机首次打开首页 3 秒内可操作，后续本地交互即时响应",
    specSections: ["15.3"],
    automated: [
      { file: "e2e/performance.spec.ts", title: "4G 限速与中端 CPU 下首页 3 秒内进入可操作状态" },
      { file: "e2e/performance.spec.ts", title: "折叠、筛选与临时标记不依赖服务端往返且即时响应" },
    ],
    manual: ["performance-real-device-4g"],
    drills: [],
  },
  {
    id: "AC-25",
    title: "从不公开网址进入时页面不宣称认证或保密访问，noindex 已设置且接口仍执行限流与安全规则",
    specSections: ["2.3", "11.7"],
    automated: [
      { file: "e2e/data-use.spec.ts", title: "分发说明不把不公开网址表述为认证、权限控制或保密访问" },
      { file: "e2e/data-use.spec.ts", title: "首页文档声明 noindex 并禁止跟随" },
      { file: "apps/server/test/security.test.ts", title: "频率超限时返回 429 与重试提示" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-26",
    title: "提交结构化反馈时只提交预定义反馈类型和非内容元数据，不上传页面文本",
    specSections: ["14"],
    automated: [
      { file: "apps/server/test/privacy.test.ts", title: "接受预定义类型与非内容元数据" },
      { file: "apps/server/test/privacy.test.ts", title: "拒绝自由文本和未知字段，避免夹带页面内容" },
      { file: "e2e/feedback.spec.ts", title: "只提供预定义类型，不提供自由文本框" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-27",
    title: "内容项到达下次核验日期时自动退出生产并阻断依赖结论，直到新版本重新发布",
    specSections: ["13.7"],
    automated: [
      { file: "apps/server/test/content.test.ts", title: "内容超过复核期限时退出生产" },
      { file: "apps/server/test/case-focus-content.test.ts", title: "到期后退出生产，恢复后重新可用" },
    ],
    manual: [],
    drills: ["drill-content-expiry", "drill-source-expiry"],
  },
  {
    id: "AC-28",
    title: "内容维护者发布新批次时部分操作失败则继续使用上一完整批次",
    specSections: ["13.6"],
    automated: [
      { file: "apps/server/test/content.test.ts", title: "批次包含未通过测试或状态不合规的内容时激活失败，旧批次保持激活" },
    ],
    manual: [],
    drills: ["drill-release-activation-atomic", "drill-release-rollback", "drill-release-rebuild-from-assets"],
  },
  {
    id: "AC-29",
    title: "查看报告或范例时页面不存在产品内复制、打印、分享、下载或导出入口",
    specSections: ["7.5", "9"],
    automated: [
      { file: "e2e/document-examples.spec.ts", title: "页面不提供复制、编辑、下载、打印、分享或导出入口" },
      { file: "e2e/report-export.spec.ts", title: "报告页不存在产品内复制、打印、分享、下载或导出入口" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-30",
    title: "无网络、限流或功能禁用时就地显示具体影响和可执行下一步",
    specSections: ["12.3", "12.4"],
    automated: [
      { file: "e2e/states.spec.ts", title: "断网后就地显示网络不可用状态及下一步" },
      { file: "e2e/analysis-resilience.spec.ts", title: "请求过于频繁时显示限流状态、影响与下一步" },
      { file: "e2e/availability.spec.ts", title: "直接访问不可用入口时显示功能暂不可用状态和可执行下一步" },
    ],
    manual: [],
    drills: ["drill-documents-entry-disabled"],
  },
  {
    id: "AC-31",
    title: "已确认事实触发人身危险、医疗、未成年人保护或证据灭失核验提示",
    specSections: ["6.4.1"],
    automated: [
      { file: "apps/server/test/family-minor-content.test.ts", title: "已确认事实触发家庭暴力、人身安全、医疗需要、未成年人保护与证据灭失提示，且只要求人工核验" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-32",
    title: "仅有未经确认的危险关键词时不产生紧急结论",
    specSections: ["6.4.1"],
    automated: [
      { file: "apps/server/test/family-minor-content.test.ts", title: "只有候选关键词时不显示已触发的紧急风险结论" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-33",
    title: "输入模糊日期或金额时保留原始值、范围和精确程度",
    specSections: ["3.5", "6.3"],
    automated: [
      { file: "apps/server/test/analysis-fixture.test.ts", title: "年初 → 范围值" },
      { file: "apps/server/test/analysis-fixture.test.ts", title: "一千多元 → 不完整范围（下限明确）" },
      { file: "e2e/format.spec.ts", title: "报告时间按北京时间展示、金额使用人民币元且法源标注实际地域" },
    ],
    manual: [],
    drills: [],
  },
  {
    id: "AC-34",
    title: "页面显示时间、金额和法源地域时使用简体中文、北京时间、人民币元及明确的国家、浙江地域标签",
    specSections: ["3.5"],
    automated: [
      { file: "e2e/format.spec.ts", title: "报告时间按北京时间展示、金额使用人民币元且法源标注实际地域" },
      { file: "apps/server/test/document-example-content.test.ts", title: "法源限定为国家公开正式规范并带有官方链接" },
    ],
    manual: [],
    drills: [],
  },
];

/** 必须存在的场景 ID（规格 17 节 AC-01 至 AC-34）。 */
export const REQUIRED_ACCEPTANCE_IDS: string[] = Array.from(
  { length: 34 },
  (_, index) => `AC-${String(index + 1).padStart(2, "0")}`,
);
