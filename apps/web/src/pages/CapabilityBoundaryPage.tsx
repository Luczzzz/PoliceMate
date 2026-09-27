import type { CapabilityId } from "@policymate/contracts";
import { Link } from "react-router-dom";
import { useShell } from "../app/ShellContext";
import { FailurePanel } from "../components/FailurePanel";
import { StatusPanel } from "../components/StatusPanel";

interface BoundarySection {
  title: string;
  paragraphs: string[];
}

interface CapabilityCopy {
  title: string;
  intro: string;
  sections: readonly BoundarySection[];
}

/**
 * 入口边界说明页。这里只呈现进入能力前必须知晓的责任与数据边界，
 * 不提供尚未交付的功能操作，也不展示“敬请期待”类占位内容。
 */
const CAPABILITY_COPY: Record<CapabilityId, CapabilityCopy> = {
  caseAnalysis: {
    title: "案情分析",
    intro: "开始输入前，请先确认以下边界。",
    sections: [
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
    ],
  },
  documentExamples: {
    title: "文书范例",
    intro: "浏览前，请先确认文书范例的定位。",
    sections: [
      {
        title: "只读制作指导",
        paragraphs: [
          "文书范例是只读、可追溯的制作指导，不是可直接套用的正式模板。",
          "产品不接收案情自动填充范例，也不仿制正式办案系统界面。",
        ],
      },
      {
        title: "虚构示例",
        paragraphs: [
          "范例中的人物、地址、号码、时间和金额均为虚构。",
          "正式名称、格式和要求须以当前有效的官方规范与办案系统为准。",
        ],
      },
      {
        title: "不得直接制发",
        paragraphs: [
          "应结合正式办案系统、现行规范和具体案情核验后使用，不得直接制发。",
          "本产品不生成、审批或导出正式法律文书。",
        ],
      },
    ],
  },
};

export interface CapabilityBoundaryPageProps {
  capability: CapabilityId;
}

export function CapabilityBoundaryPage({ capability }: CapabilityBoundaryPageProps) {
  const { state, reload } = useShell();
  const copy = CAPABILITY_COPY[capability];

  const header = (
    <header className="page-header">
      <p className="breadcrumb">
        <Link className="link-button" to="/">
          ‹ 返回首页
        </Link>
      </p>
      <h1 className="page-title">{copy.title}</h1>
      <p className="page-lead">{copy.intro}</p>
    </header>
  );

  if (state.status === "loading") {
    return (
      <div className="page" data-testid="capability-loading">
        {header}
        <p className="loading-text" role="status">
          正在读取入口状态…
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="page">
        {header}
        <FailurePanel failure={state.failure} onRetry={reload} testId="capability-failure" />
      </div>
    );
  }

  const availability = state.data.entries[capability];
  if (!availability.available) {
    return (
      <div className="page">
        {header}
        <StatusPanel
          variant="unavailable"
          title="功能暂不可用"
          impact={`“${copy.title}”当前无法进入，页面不会加载任何未经验证的内容。`}
          nextStep="请稍后返回首页重试，或先使用另一个入口。若持续不可用，请通过“使用与数据说明”中的联系方式反馈。"
          testId="capability-unavailable"
          extra={
            <p className="status-panel__note" data-testid="capability-unavailable-reason">
              原因：{availability.reason ?? "该入口当前不可用。"}
            </p>
          }
          action={
            <Link className="button button--primary" to="/">
              返回首页
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page" data-testid={`capability-${capability}`}>
      {header}
      {copy.sections.map((section) => (
        <section key={section.title} className="info-section">
          <h2 className="info-section__title">{section.title}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p key={`p-${index}`}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
