import { CapabilityGate } from "../components/CapabilityGate";
import { InfoSection } from "../components/InfoSection";

interface BoundarySection {
  title: string;
  paragraphs: string[];
}

/**
 * 案情分析入口的边界说明页。这里只呈现进入能力前必须知晓的责任与数据边界，
 * 不提供尚未交付的功能操作，也不展示“敬请期待”类占位内容。
 */
const CASE_ANALYSIS_SECTIONS: readonly BoundarySection[] = [
  {
    title: "程序辅助工具边界",
    paragraphs: [
      "松警伴侣输出的是供民警核验的辅助内容，不创建官方案件记录，也不作出受案、立案、定性、处罚、审批或其他执法决定。",
      "分析结果必须结合现行规范、正式案卷、公安业务系统和有权民警判断。",
    ],
  },
  {
    title: "脱敏义务",
    paragraphs: [
      "请勿输入姓名、身份证号、手机号、精确住址等真实身份信息。",
      "本产品不做自动脱敏扫描或自动替换，也不会承诺提交内容已经充分脱敏。",
    ],
  },
  {
    title: "内容提交与 Dify 处理",
    paragraphs: [
      "提交内容将经 PoliceMate 后端发送至 Dify 处理；Dify API 密钥只保存在后端，移动端不会直接连接 Dify。",
    ],
  },
  {
    title: "当前标签页生命周期",
    paragraphs: [
      "分析内容仅属于当前浏览器标签页，不跨标签页、不跨设备，也不形成分析历史。",
      "刷新、关闭标签页或空闲 30 分钟后，内容不可恢复。",
    ],
  },
];

export interface CapabilityBoundaryPageProps {
  capability: "caseAnalysis";
}

export function CapabilityBoundaryPage({ capability }: CapabilityBoundaryPageProps) {
  return (
    <CapabilityGate
      capability={capability}
      title="案情分析"
      intro="开始输入前，请先确认程序责任、脱敏和会话边界。"
      icon="analysis"
      command="事实确认 → 决定性追问 → 结构化分析"
    >
      <div className="document-list">
        {CASE_ANALYSIS_SECTIONS.map((section, sectionIndex) => (
          <InfoSection key={section.title} index={sectionIndex + 1} title={section.title}>
            {section.paragraphs.map((paragraph, index) => (
              <p key={`p-${index}`}>{paragraph}</p>
            ))}
          </InfoSection>
        ))}
      </div>
    </CapabilityGate>
  );
}
