import { useMemo, useState } from "react";
import type {
  DocumentExampleFacetOption,
  DocumentExampleListResponse,
  DocumentExampleVariantSummary,
} from "@policymate/contracts";
import { Link } from "react-router-dom";
import { useJsonResource } from "../hooks/useJsonResource";
import { CapabilityGate } from "../components/CapabilityGate";
import { DocumentNotice } from "../components/DocumentNotice";
import { FailurePanel } from "../components/FailurePanel";
import { Icon } from "../components/Icon";
import { StatusPanel } from "../components/StatusPanel";

/**
 * 文书范例入口路由。可用状态由后端外壳响应门控；
 * 可用时渲染当前激活批次中的只读范例索引。
 */
export function DocumentsRoute() {
  return (
    <CapabilityGate
      capability="documentExamples"
      title="文书范例"
      intro="按办理阶段浏览只读的文书制作指导，或按关键词、程序类别、办理阶段和文书类型筛选。"
      icon="document"
      command="办理阶段 → 适用条件 → 制作指导"
    >
      <DocumentExamplesIndex />
    </CapabilityGate>
  );
}

/** 关键词匹配：大小写与空格不敏感，覆盖正式名称、别名、文书类型与案情标签。 */
function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function matchesKeyword(item: DocumentExampleVariantSummary, keyword: string): boolean {
  const haystack = normalize(
    [
      item.formalName,
      ...item.aliases,
      item.documentTypeName,
      item.stageLabel,
      item.procedureCategoryLabel,
      ...item.caseTags,
      ...item.applicableRoles,
    ].join(" "),
  );
  return haystack.includes(normalize(keyword));
}

interface ActiveFilter {
  id: string;
  label: string;
}

function DocumentExamplesIndex() {
  const { state, reload } = useJsonResource<DocumentExampleListResponse>("/api/v1/document-examples");

  if (state.status === "loading") {
    return (
      <p className="loading-text" role="status" data-testid="document-examples-loading">
        正在读取当前批次中的已核验范例…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <FailurePanel failure={state.failure} onRetry={reload} testId="document-examples-failure" />
    );
  }

  return <DocumentExamplesList data={state.data} />;
}

function DocumentExamplesList({ data }: { data: DocumentExampleListResponse }) {
  const [keyword, setKeyword] = useState("");
  const [procedure, setProcedure] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      data.items.filter((item) => {
        if (procedure !== null && item.procedureCategory !== procedure) return false;
        if (stage !== null && item.stageId !== stage) return false;
        if (documentType !== null && item.documentTypeId !== documentType) return false;
        if (keyword.trim() !== "" && !matchesKeyword(item, keyword)) return false;
        return true;
      }),
    [data.items, procedure, stage, documentType, keyword],
  );

  const activeFilters: ActiveFilter[] = [];
  if (keyword.trim() !== "") activeFilters.push({ id: "keyword", label: `关键词“${keyword.trim()}”` });
  const procedureLabel = data.facets.procedureCategories.find((o) => o.id === procedure)?.label;
  if (procedure !== null && procedureLabel !== undefined) {
    activeFilters.push({ id: "procedure", label: `程序类别：${procedureLabel}` });
  }
  const stageLabel = data.stages.find((o) => o.id === stage)?.label;
  if (stage !== null && stageLabel !== undefined) {
    activeFilters.push({ id: "stage", label: `办理阶段：${stageLabel}` });
  }
  const documentTypeLabel = data.facets.documentTypes.find((o) => o.id === documentType)?.label;
  if (documentType !== null && documentTypeLabel !== undefined) {
    activeFilters.push({ id: "documentType", label: `文书类型：${documentTypeLabel}` });
  }

  const filtersActive = activeFilters.length > 0;
  const clearFilters = () => {
    setKeyword("");
    setProcedure(null);
    setStage(null);
    setDocumentType(null);
  };

  return (
    <div className="documents-index" data-testid="documents-index">
      <DocumentNotice notice={data.notice} />

      <section className="example-controls" aria-labelledby="example-controls-title">
        <h2 id="example-controls-title" className="visually-hidden">
          文书范例检索与筛选
        </h2>

        <label className="field" htmlFor="example-search-input">
          <span className="field__label">关键词检索</span>
          <input
            id="example-search-input"
            className="field__input"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="按文书名称、别名或办案用语检索"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            data-testid="example-search"
            aria-describedby="example-search-note"
          />
        </label>
        <p className="field__note" id="example-search-note">
          检索词只保留在当前页面内存，不写入网址、存储或内容日志。
        </p>

        <FilterGroup
          dimension="procedure"
          legend="程序类别"
          options={data.facets.procedureCategories}
          selected={procedure}
          onSelect={setProcedure}
        />
        <FilterGroup
          dimension="stage"
          legend="办理阶段"
          options={data.facets.stages}
          selected={stage}
          onSelect={setStage}
        />
        <FilterGroup
          dimension="documentType"
          legend="文书类型"
          options={data.facets.documentTypes}
          selected={documentType}
          onSelect={setDocumentType}
        />

        {filtersActive ? (
          <div className="active-filters" data-testid="active-filters">
            <p className="active-filters__label" id="active-filters-label">
              已启用筛选
            </p>
            <ul className="active-filters__list" aria-labelledby="active-filters-label">
              {activeFilters.map((filter) => (
                <li key={filter.id} data-testid={`active-filter-${filter.id}`}>
                  {filter.label}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button button--secondary"
              onClick={clearFilters}
              data-testid="clear-filters"
            >
              清除筛选
            </button>
          </div>
        ) : null}
      </section>

      {filtersActive ? (
        filtered.length === 0 ? (
          <StatusPanel
            variant="not_found"
            title="当前没有匹配的已核验范例"
            impact="当前激活批次中没有符合这些条件的内容，可能是条件过窄，或该文书尚未纳入受控试行。"
            nextStep="请调整或清除筛选条件，或按办理阶段返回分类浏览。"
            testId="no-match"
            action={
              <button
                type="button"
                className="button button--primary"
                onClick={clearFilters}
                data-testid="back-to-browse"
              >
                返回分类浏览
              </button>
            }
          />
        ) : (
          <section className="example-results" aria-labelledby="example-results-title">
            <div className="section-heading section-heading--compact">
              <h2 id="example-results-title">检索结果</h2>
              <p data-testid="result-count">
                共 {filtered.length} 条已核验范例（当前批次 {data.items.length} 条）
              </p>
            </div>
            <ExampleList items={filtered} />
          </section>
        )
      ) : (
        <section className="example-browse" aria-labelledby="example-browse-title">
          <div className="section-heading section-heading--compact">
            <h2 id="example-browse-title">按办理阶段浏览</h2>
            <p data-testid="browse-count">当前批次共 {data.items.length} 条已核验范例</p>
          </div>
          {data.stages.map((stageEntry) => {
            const stageItems = filtered.filter((item) => item.stageId === stageEntry.id);
            return (
              <section
                key={stageEntry.id}
                className="stage-group"
                data-testid={`stage-section-${stageEntry.id}`}
                aria-labelledby={`stage-title-${stageEntry.id}`}
              >
                <h3 className="stage-group__title" id={`stage-title-${stageEntry.id}`}>
                  {stageEntry.label}
                  <span className="stage-group__count">{stageItems.length}</span>
                </h3>
                {stageItems.length === 0 ? (
                  <p className="stage-group__empty">该阶段暂无已核验范例。</p>
                ) : (
                  <ExampleList items={stageItems} />
                )}
              </section>
            );
          })}
        </section>
      )}
    </div>
  );
}

function FilterGroup({
  dimension,
  legend,
  options,
  selected,
  onSelect,
}: {
  dimension: string;
  legend: string;
  options: DocumentExampleFacetOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <fieldset className="filter-group" data-testid={`filter-group-${dimension}`}>
      <legend className="filter-group__legend">{legend}</legend>
      <div className="filter-group__options">
        <button
          type="button"
          className={`filter-chip${selected === null ? " is-selected" : ""}`}
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
          data-testid={`filter-${dimension}-all`}
        >
          全部
        </button>
        {options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`filter-chip${isSelected ? " is-selected" : ""}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : option.id)}
              data-testid={`filter-${dimension}-${option.id}`}
            >
              {option.label}
              <span className="filter-chip__count">{option.count}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ExampleList({ items }: { items: DocumentExampleVariantSummary[] }) {
  return (
    <ul className="example-list" data-testid="example-list">
      {items.map((item) => (
        <li key={item.exampleId}>
          <Link
            className="example-card"
            to={`/documents/${encodeURIComponent(item.exampleId)}`}
            data-testid={`example-card-${item.exampleId}`}
          >
            <span className="example-card__head">
              <span className="example-card__name">{item.formalName}</span>
              <span className="example-card__status">{item.contentStatusLabel}</span>
            </span>
            <span className="example-card__meta">
              {item.procedureCategoryLabel} · {item.stageLabel} · {item.documentTypeName}
            </span>
            {item.aliases.length > 0 ? (
              <span className="example-card__aliases">别名：{item.aliases.join("、")}</span>
            ) : null}
            <span className="example-card__go">
              查看制作指导
              <Icon name="arrowRight" size={17} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
