import { Link } from "react-router-dom";
import { EntryCard } from "../components/EntryCard";
import { FailurePanel } from "../components/FailurePanel";
import { useShell } from "../app/ShellContext";

/**
 * 首页只提供两个同级主入口，不展示未来功能占位、账户、历史、收藏或设置入口。
 */
export function HomePage() {
  const { state, reload } = useShell();

  return (
    <div className="page">
      <header className="page-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            松
          </span>
          <div>
            <strong className="brand__name">松警伴侣</strong>
            <span className="brand__subtitle">程序辅助工具 · 移动端 H5</span>
          </div>
        </div>
        <h1 className="page-title">把复杂案情，整理成可核验的研判线索</h1>
        <p className="page-lead">
          两个入口同等重要，均提供辅助参考，不替代正式办案系统、现行规范和有权民警判断。
        </p>
      </header>

      {state.status === "loading" ? (
        <div className="entries" data-testid="entries-loading" aria-busy="true" aria-live="polite">
          <p className="visually-hidden">正在读取入口状态。</p>
          <div className="entry-card entry-card--skeleton" aria-hidden="true" />
          <div className="entry-card entry-card--skeleton" aria-hidden="true" />
        </div>
      ) : null}

      {state.status === "error" ? <FailurePanel failure={state.failure} onRetry={reload} /> : null}

      {state.status === "ready" ? (
        <nav className="entries" aria-label="主要入口" data-testid="primary-entries">
          <EntryCard
            capability="caseAnalysis"
            title="案情分析"
            description="输入脱敏案情，经事实确认与决定性追问后，生成带法源依据的结构化分析报告。"
            icon="析"
            available={state.data.entries.caseAnalysis.available}
            reason={state.data.entries.caseAnalysis.reason}
            to="/analysis"
          />
          <EntryCard
            capability="documentExamples"
            title="文书范例"
            description="按办理阶段浏览只读的文书制作指导与注释式虚构示例，不作为正式模板。"
            icon="文"
            available={state.data.entries.documentExamples.available}
            reason={state.data.entries.documentExamples.reason}
            to="/documents"
          />
        </nav>
      ) : null}

      <footer className="page-footer">
        <Link className="link-button" to="/data-use" data-testid="data-use-link">
          使用与数据说明
        </Link>
        <p className="page-footer__note">
          本工具提供辅助参考，不替代正式办案系统、现行规范和有权民警判断；不保存分析记录。
        </p>
      </footer>
    </div>
  );
}
