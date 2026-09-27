import type { DataUseResponse } from "@policymate/contracts";
import { Link } from "react-router-dom";
import { FailurePanel } from "../components/FailurePanel";
import { Icon } from "../components/Icon";
import { useJsonResource } from "../hooks/useJsonResource";

function ServiceValue({ value }: { value: string | null }) {
  if (value === null) {
    return <span className="service-value service-value--unset">尚未配置（受控试行前必须填写）</span>;
  }
  return <span className="service-value">{value}</span>;
}

/**
 * 使用与数据说明页面。章节顺序和内容由后端提供，未配置的部署信息如实显示，
 * 不得使用虚构主体或联系人。
 */
export function DataUsePage() {
  const { state, reload } = useJsonResource<DataUseResponse>("/api/v1/data-use");

  return (
    <div className="page page--reading">
      <header className="subpage-header">
        <Link className="back-link" to="/" data-testid="back-home">
          <Icon name="arrowLeft" size={18} />
          返回首页
        </Link>
        <span className="subpage-mark" aria-hidden="true">
          <Icon name="shield" size={42} strokeWidth={1.4} />
        </span>
        <h1 className="page-title">使用与数据说明</h1>
        <p className="page-lead">
          使用前请了解工具边界、脱敏义务、内容处理方式和当前标签页的会话生命周期。
        </p>
        <div className="command-tag">
          <code>边界 · 脱敏 · Dify 处理 · 会话生命周期</code>
        </div>
      </header>

      {state.status === "loading" ? (
        <p className="loading-text" role="status" data-testid="data-use-loading">
          正在读取说明内容…
        </p>
      ) : null}

      {state.status === "error" ? (
        <FailurePanel failure={state.failure} onRetry={reload} testId="data-use-failure" />
      ) : null}

      {state.status === "ready" ? (
        <div className="document-list">
          {state.data.sections.map((section, sectionIndex) => (
            <section
              key={section.id}
              className="info-section"
              data-testid={`data-use-section-${section.id}`}
            >
              <span className="info-section__index" aria-hidden="true">
                {String(sectionIndex + 1).padStart(2, "0")}
              </span>
              <div className="info-section__content">
                <h2 className="info-section__title">{section.title}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={`p-${index}`}>{paragraph}</p>
                ))}
                {section.bullets.length > 0 ? (
                  <ul>
                    {section.bullets.map((bullet, index) => (
                      <li key={`b-${index}`}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}

          <section className="info-section info-section--service" data-testid="data-use-service">
            <span className="info-section__index" aria-hidden="true">
              {String(state.data.sections.length + 1).padStart(2, "0")}
            </span>
            <div className="info-section__content">
              <h2 className="info-section__title">服务与联系信息</h2>
              <dl className="service-list">
              <dt>服务提供者</dt>
              <dd>
                <ServiceValue value={state.data.service.provider} />
              </dd>
              <dt>试行反馈联系人</dt>
              <dd>
                <ServiceValue value={state.data.service.contact} />
              </dd>
              <dt>数据处理说明</dt>
              <dd>
                <ServiceValue value={state.data.service.dataProcessingStatement} />
              </dd>
              <dt>技术日志边界</dt>
              <dd>
                {state.data.service.technicalLoggingBoundary.length === 0 ? (
                  <ServiceValue value={null} />
                ) : (
                  <ul>
                    {state.data.service.technicalLoggingBoundary.map((line, index) => (
                      <li key={`log-${index}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </dd>
              </dl>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
