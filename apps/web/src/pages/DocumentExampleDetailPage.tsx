import type {
  DocumentExampleDetailResponse,
  DocumentExampleVariantDetail,
  LegalSourceReference,
} from "@policymate/contracts";
import { Link, useParams } from "react-router-dom";
import { useJsonResource } from "../hooks/useJsonResource";
import { DocumentNotice } from "../components/DocumentNotice";
import { FailurePanel } from "../components/FailurePanel";
import { Icon } from "../components/Icon";
import { safeExternalUrl } from "../util/safeUrl";
import { InfoSection } from "../components/InfoSection";
import { StatusPanel } from "../components/StatusPanel";

/**
 * 文书范例详情页。内容每次从后端读取，并由后端执行当前状态门控；
 * 失效标识显示“内容已经失效”，不回退到缓存正文。
 */
export function DocumentExampleDetailPage() {
  const { exampleId } = useParams<{ exampleId: string }>();
  const path = `/api/v1/document-examples/${encodeURIComponent(exampleId ?? "")}`;
  const { state, reload } = useJsonResource<DocumentExampleDetailResponse>(path);

  const header = (
    <header className="subpage-header">
      <Link className="back-link" to="/documents">
        <Icon name="arrowLeft" size={18} />
        返回文书范例列表
      </Link>
      <span className="subpage-mark" aria-hidden="true">
        <Icon name="document" size={42} strokeWidth={1.4} />
      </span>
      <h1 className="page-title">文书范例详情</h1>
      <p className="page-lead">只读制作指导，用于核验适用条件、结构与常见错误。</p>
    </header>
  );

  if (state.status === "loading") {
    return (
      <div className="page page--reading">
        {header}
        <p className="loading-text" role="status" data-testid="example-detail-loading">
          正在读取范例详情…
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    const failure = state.failure;
    if (failure.code === "content_unavailable") {
      return (
        <div className="page page--reading">
          {header}
          <StatusPanel
            variant="unavailable"
            title="当前内容已经失效"
            impact="该范例已退出当前激活批次，正文不再展示；缓存或历史链接不能绕过当前状态。"
            nextStep="请返回文书范例列表，从当前批次中重新选择可用的范例。"
            testId="example-unavailable"
            action={
              <Link className="button button--primary" to="/documents">
                返回文书范例列表
              </Link>
            }
          />
        </div>
      );
    }
    if (failure.code === "not_found") {
      return (
        <div className="page page--reading">
          {header}
          <StatusPanel
            variant="not_found"
            title="未找到该文书范例"
            impact="该标识不属于当前内容发布批次，页面不展示任何正文。"
            nextStep="请返回文书范例列表重新选择。"
            testId="example-not-found"
            action={
              <Link className="button button--primary" to="/documents">
                返回文书范例列表
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="page page--reading">
        {header}
        <FailurePanel failure={failure} onRetry={reload} testId="example-detail-failure" />
      </div>
    );
  }

  return (
    <div className="page page--reading" data-testid="example-detail">
      {header}
      <DocumentNotice notice={state.data.notice} />
      <ExampleDetail example={state.data.example} />
    </div>
  );
}

function ExampleDetail({ example }: { example: DocumentExampleVariantDetail }) {
  return (
    <div className="document-list" data-testid="example-detail-body">
      <InfoSection index={1} title="身份与状态" testId="example-identity">
        <h3 className="detail-name">{example.formalName}</h3>
        <DefinitionList
          items={[
            ["内容状态", example.contentStatusLabel],
            ["版本", example.version],
            ["程序类别", example.procedureCategoryLabel],
            ["办理阶段", example.stageLabel],
            ["文书类型", example.documentTypeName],
            ["常用别名", example.aliases.length > 0 ? example.aliases.join("、") : "不适用"],
            ["适用对象与程序角色", example.applicableRoles.join("、")],
            ["适用案情标签", example.caseTags.join("、")],
            ["内容发布批次", example.releaseId],
            ["最近核验日期", formatDate(example.lastVerifiedAt)],
            ["下次核验日期", formatDate(example.nextReviewDueAt)],
          ]}
        />
      </InfoSection>

      <InfoSection index={2} title="适用与排除" testId="example-applicability">
        <Bullets title="适用场景（触发条件）" items={example.applicableScenarios} />
        <Bullets title="不适用情形" items={example.exclusions} />
        <Bullets title="前置条件" items={example.prerequisites} />
        <Bullets title="选择前必须核验的事实" items={example.preflightChecks} />
        <div className="detail-block">
          <h3 className="detail-block__title">相邻变体差异</h3>
          {example.neighboringVariants.length === 0 ? (
            <p>当前批次中没有可展示的相邻变体。</p>
          ) : (
            <ul className="neighbor-list" data-testid="neighbor-list">
              {example.neighboringVariants.map((neighbor) => (
                <li key={neighbor.exampleId} data-testid={`neighbor-${neighbor.exampleId}`}>
                  <Link to={`/documents/${encodeURIComponent(neighbor.exampleId)}`}>
                    {neighbor.formalName}
                  </Link>
                  <p>{neighbor.difference}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </InfoSection>

      <InfoSection index={3} title="结构与制作指导" testId="example-guidance">
        <div className="detail-block">
          <h3 className="detail-block__title">结构分段及每段目的</h3>
          <ol className="structure-list" data-testid="structure-list">
            {example.structure.map((section) => (
              <li key={section.heading}>
                <span className="structure-list__heading">{section.heading}</span>
                <span className="structure-list__purpose">{section.purpose}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="detail-block">
          <h3 className="detail-block__title">分段注释式虚构示例</h3>
          <div className="annotated-list" data-testid="annotated-example">
            {example.annotatedExample.map((part) => (
              <article key={part.heading} className="annotated-part">
                <h4 className="annotated-part__heading">{part.heading}</h4>
                <p className="annotated-part__text">{part.fictionalText}</p>
                <ul className="annotated-part__notes">
                  {part.annotations.map((annotation, index) => (
                    <li key={`note-${index}`}>{annotation}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
        <Bullets title="制作要点" items={example.productionPoints} />
        <Bullets title="常见错误" items={example.commonErrors} />
        <Bullets title="高风险提醒" items={example.riskNotes} />
      </InfoSection>

      <InfoSection index={4} title="依据与治理信息" testId="example-governance">
        <div className="detail-block">
          <h3 className="detail-block__title">法源依据</h3>
          <div className="source-list" data-testid="legal-sources">
            {example.legalSources.map((source) => (
              <LegalSourceCard key={source.sourceId} source={source} />
            ))}
          </div>
        </div>
        <DefinitionList
          items={[
            ["正式格式或制作规范来源", example.formatSource ?? "不适用"],
            ["内容维护者", example.governance.maintainer],
            ["起草时间", formatDate(example.governance.draftedAt)],
            ["核验时间", formatDate(example.governance.verifiedAt)],
            ["发布时间", formatDate(example.governance.publishedAt)],
            ["最近核验日期", formatDate(example.governance.lastVerifiedAt)],
            ["下次核验日期", formatDate(example.governance.nextReviewDueAt)],
            ["内容发布批次", example.governance.releaseId],
            ["相对上一批次变更", example.governance.changeNote],
            ["法源核验说明", example.governance.sourceVerificationNote],
          ]}
        />
      </InfoSection>
    </div>
  );
}

function LegalSourceCard({ source }: { source: LegalSourceReference }) {
  return (
    <article className="source-card" data-testid={`legal-source-${source.sourceId}`}>
      <h4 className="source-card__title">{source.title}</h4>
      <DefinitionList
        items={[
          ["制定或发布机关", source.issuingAuthority],
          ["文号", source.documentNumber],
          ["效力层级", source.authorityLevel],
          ["适用地域", source.region],
          ["效力状态", source.statusLabel],
          ["公布时间", formatDate(source.publishedAt)],
          ["施行时间", source.effectiveAt === null ? "不适用" : formatDate(source.effectiveAt)],
          ["依据版本", source.version],
          ["最近核验日期", formatDate(source.lastVerifiedAt)],
          ["下次核验日期", formatDate(source.nextReviewDueAt)],
          ["内容维护者", source.maintainer],
        ]}
      />
      <div className="source-card__articles">
        <h5 className="source-card__subtitle">条款定位与最小必要原文</h5>
        <ul>
          {source.articles.map((article) => (
            <li key={article.location}>
              <span className="source-card__location">{article.location}</span>
              {article.minimalText}
            </li>
          ))}
        </ul>
      </div>
      {(() => {
        const officialUrl = safeExternalUrl(source.officialUrl);
        if (officialUrl === null) {
          return (
            <p
              className="source-card__link source-card__link--missing"
              data-testid={`source-link-missing-${source.sourceId}`}
            >
              官方链接未提供或协议不受支持，请自行到官方渠道核验。
            </p>
          );
        }
        return (
          <p className="source-card__link">
            <a href={officialUrl} rel="noreferrer noopener" target="_blank">
              打开官方来源
            </a>
            <span className="source-card__retrieved">（取得日期：{formatDate(source.retrievedAt)}）</span>
          </p>
        );
      })()}
    </article>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="detail-block">
      <h3 className="detail-block__title">{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DefinitionList({ items }: { items: [string, string][] }) {
  return (
    <dl className="detail-list">
      {items.map(([term, value]) => (
        <div className="detail-list__row" key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
