import { Link } from "react-router-dom";
import { EntryCard } from "../components/EntryCard";
import { FailurePanel } from "../components/FailurePanel";
import { Icon } from "../components/Icon";
import { useShell } from "../app/ShellContext";

/**
 * 首页只提供两个同级主入口，不展示未来功能占位、账户、历史、收藏或设置入口。
 */
export function HomePage() {
  const { state, reload } = useShell();

  return (
    <div className="page page--home">
      <nav className="primary-nav" aria-label="首页导航">
        <Link className="nav-brand" to="/" aria-label="松警伴侣首页">
          <span className="nav-brand__mark" aria-hidden="true">
            <Icon name="brand" size={21} strokeWidth={1.8} />
          </span>
          <span>松警伴侣</span>
        </Link>
        <Link className="button button--secondary nav-action" to="/data-use">
          使用说明
        </Link>
      </nav>

      <header className="home-hero">
        <span className="hero-mark" aria-hidden="true">
          <Icon name="brand" size={68} strokeWidth={1.35} />
        </span>
        <p className="trial-label">受控试行版 · 程序辅助工具</p>
        <h1 className="page-title page-title--hero">把复杂案情，整理成可核验的研判线索</h1>
        <p className="page-lead page-lead--hero">
          围绕案情分析、程序核查与公开法源，为一线民警提供清晰、可追溯的辅助参考。
        </p>
      </header>

      <section className="entry-section" aria-labelledby="entry-section-title">
        <div className="section-heading">
          <h2 id="entry-section-title">选择工作入口</h2>
          <p>两个入口同等重要，并根据当前服务与内容状态独立开放。</p>
        </div>

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
              description="输入脱敏案情，直接生成带法源依据的结构化分析报告，可逐项核验并在报告页补充或修改。"
              icon="analysis"
              available={state.data.entries.caseAnalysis.available}
              reason={state.data.entries.caseAnalysis.reason}
              to="/analysis"
            />
            <EntryCard
              capability="documentExamples"
              title="文书范例"
              description="按办理阶段浏览只读的文书制作指导与注释式虚构示例，不作为正式模板。"
              icon="document"
              available={state.data.entries.documentExamples.available}
              reason={state.data.entries.documentExamples.reason}
              to="/documents"
            />
          </nav>
        ) : null}
      </section>

      <aside className="boundary-strip" aria-labelledby="boundary-title">
        <div>
          <span className="boundary-strip__icon" aria-hidden="true">
            <Icon name="shield" size={24} />
          </span>
          <h2 id="boundary-title">辅助参考，不替代执法判断</h2>
          <p>不创建官方案件记录，不替代正式办案系统、现行规范和有权民警判断。</p>
        </div>
        <Link className="button button--inverse" to="/data-use" data-testid="data-use-link">
          查看使用与数据说明
          <Icon name="arrowRight" size={17} />
        </Link>
      </aside>

      <footer className="page-footer page-footer--home">
        <p className="page-footer__note">辅助参考 · 不保存分析记录 · 请结合现行规范核验</p>
      </footer>
    </div>
  );
}
