import { useMemo } from "react";
import type {
  EvidenceHoldingStatus,
  EvidencePriority,
  ReportEvidenceChecklistItem,
  ReportInterviewPointItem,
  ReportModule,
} from "@policymate/contracts";
import { useWorkbench, type MarkFilter } from "../analysis/WorkbenchContext";

/**
 * 报告临时工作台。
 *
 * 核心证据核查清单与分角色询问要点是当前标签页内的临时整理工具：
 * 支持展开/折叠、预定义条件筛选，以及“本次已核对”和“重点关注”两个可以
 * 同时存在的临时标记。全部状态由 `WorkbenchProvider` 持有，只存在于当前
 * 标签页内存，不写入事实快照、不回传 Dify、不改变报告结论，也不进入数据库、
 * 内容日志、URL 或可恢复历史。
 */

const WORKBENCH_BOUNDARY_NOTE =
  "标记只用于本次查看整理，不代表证据已经取得、证明目的已经实现、询问已经依法完成或程序已经完备。";

function uniqueOptions(values: { id: string; label: string }[]): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    if (!seen.has(value.id)) seen.set(value.id, value.label);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

function WorkbenchMarkButtons({
  itemId,
  markKey,
  reviewed,
  focus,
}: {
  itemId: string;
  markKey: string;
  reviewed: boolean;
  focus: boolean;
}) {
  const { toggleReviewed, toggleFocus } = useWorkbench();
  return (
    <div className="workbench-marks">
      <button
        type="button"
        className={`mark-chip${reviewed ? " is-selected" : ""}`}
        aria-pressed={reviewed}
        onClick={() => toggleReviewed(markKey)}
        data-testid={`workbench-reviewed-${itemId}`}
      >
        本次已核对
      </button>
      <button
        type="button"
        className={`mark-chip${focus ? " is-selected" : ""}`}
        aria-pressed={focus}
        onClick={() => toggleFocus(markKey)}
        data-testid={`workbench-focus-${itemId}`}
      >
        重点关注
      </button>
    </div>
  );
}

function ModuleHead({
  module,
  collapsedKey,
  testIdSuffix,
}: {
  module: ReportModule;
  collapsedKey: string;
  testIdSuffix: string;
}) {
  const { isCollapsed, toggleCollapsed } = useWorkbench();
  const collapsed = isCollapsed(collapsedKey);
  return (
    <header className="workbench-header">
      <h2 className="workbench-header__title">
        {module.label} <small>{module.status}</small>
      </h2>
      <button
        type="button"
        className="button button--muted workbench-header__toggle"
        aria-expanded={!collapsed}
        onClick={() => toggleCollapsed(collapsedKey)}
        data-testid={`workbench-collapse-${testIdSuffix}`}
      >
        {collapsed ? "展开" : "折叠"}
      </button>
    </header>
  );
}

function WorkbenchFilters({
  testIdSuffix,
  mark,
  onMark,
  filtersActive,
  visibleCount,
  totalCount,
  onClear,
  children,
}: {
  testIdSuffix: string;
  mark: MarkFilter;
  onMark: (value: MarkFilter) => void;
  filtersActive: boolean;
  visibleCount: number;
  totalCount: number;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="workbench-controls">
      <p className="workbench-boundary" data-testid={`workbench-boundary-${testIdSuffix}`}>
        {WORKBENCH_BOUNDARY_NOTE}
      </p>
      <fieldset className="filter-group">
        <legend className="filter-group__legend">临时标记</legend>
        <div className="filter-group__options">
          {(
            [
              ["all", "全部"],
              ["reviewed", "本次已核对"],
              ["focus", "重点关注"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`filter-chip${mark === value ? " is-selected" : ""}`}
              aria-pressed={mark === value}
              onClick={() => onMark(value)}
              data-testid={`workbench-filter-mark-${value}-${testIdSuffix}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {children}
      {filtersActive ? (
        <div className="active-filters" data-testid={`workbench-active-filters-${testIdSuffix}`}>
          <p className="workbench-count" data-testid={`workbench-count-${testIdSuffix}`}>
            当前显示 {visibleCount} 项，共 {totalCount} 项
          </p>
          <button
            type="button"
            className="button button--secondary"
            onClick={onClear}
            data-testid={`workbench-clear-${testIdSuffix}`}
          >
            清除筛选
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChipGroup<T extends string>({
  legend,
  dimension,
  testIdSuffix,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  dimension: string;
  testIdSuffix: string;
  options: { id: T; label: string }[];
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="filter-group" data-testid={`workbench-filter-${dimension}-${testIdSuffix}`}>
      <legend className="filter-group__legend">{legend}</legend>
      <div className="filter-group__options">
        <button
          type="button"
          className={`filter-chip${selected === null ? " is-selected" : ""}`}
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
          data-testid={`workbench-filter-${dimension}-all-${testIdSuffix}`}
        >
          全部
        </button>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`filter-chip${selected === option.id ? " is-selected" : ""}`}
            aria-pressed={selected === option.id}
            onClick={() => onSelect(selected === option.id ? null : option.id)}
            data-testid={`workbench-filter-${dimension}-${option.id}-${testIdSuffix}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function matchesMark(mark: MarkFilter, reviewed: string[], focus: string[], markKey: string): boolean {
  if (mark === "reviewed") return reviewed.includes(markKey);
  if (mark === "focus") return focus.includes(markKey);
  return true;
}

/** 项目 ID 只在模块内唯一，因此临时标记按模块命名空间存储。 */
function evidenceKey(itemId: string): string {
  return `evidence:${itemId}`;
}

function interviewKey(itemId: string): string {
  return `interview:${itemId}`;
}

export function EvidenceChecklistWorkbench({ module }: { module: ReportModule }) {
  const {
    reviewed,
    focus,
    isCollapsed,
    evidenceFilters,
    setEvidenceFilters,
    clearEvidenceFilters,
  } = useWorkbench();
  const items: ReportEvidenceChecklistItem[] = module.evidenceItems;
  const priorityOptions = useMemo(
    () => uniqueOptions(items.map((item) => ({ id: item.priority, label: item.priorityLabel }))),
    [items],
  );
  const holdingOptions = useMemo(
    () => uniqueOptions(items.map((item) => ({ id: item.holdingStatus, label: item.holdingStatusLabel }))),
    [items],
  );

  const visible = items.filter((item) => {
    if (!matchesMark(evidenceFilters.mark, reviewed, focus, evidenceKey(item.itemId))) return false;
    if (evidenceFilters.priority !== null && item.priority !== evidenceFilters.priority) return false;
    if (evidenceFilters.holdingStatus !== null && item.holdingStatus !== evidenceFilters.holdingStatus) {
      return false;
    }
    return true;
  });
  const filtersActive =
    evidenceFilters.mark !== "all" ||
    evidenceFilters.priority !== null ||
    evidenceFilters.holdingStatus !== null;

  return (
    <section
      id="report-module-evidence_checklist"
      className="report-module report-module--workbench"
      data-testid="report-module-evidence_checklist"
      data-workbench="evidence"
    >
      <ModuleHead module={module} collapsedKey="evidence" testIdSuffix="evidence" />
      {module.summary ? <p>{module.summary}</p> : null}
      {module.failureReason ? <p role="alert">{module.failureReason}</p> : null}
      {isCollapsed("evidence") ? null : (
        <>
          <WorkbenchFilters
            testIdSuffix="evidence"
            mark={evidenceFilters.mark}
            onMark={(mark) => setEvidenceFilters({ mark })}
            filtersActive={filtersActive}
            visibleCount={visible.length}
            totalCount={items.length}
            onClear={clearEvidenceFilters}
          >
            <ChipGroup
              legend="优先级"
              dimension="priority"
              testIdSuffix="evidence"
              options={priorityOptions as { id: EvidencePriority; label: string }[]}
              selected={evidenceFilters.priority}
              onSelect={(priority) => setEvidenceFilters({ priority })}
            />
            <ChipGroup
              legend="当前掌握状态"
              dimension="status"
              testIdSuffix="evidence"
              options={holdingOptions as { id: EvidenceHoldingStatus; label: string }[]}
              selected={evidenceFilters.holdingStatus}
              onSelect={(holdingStatus) => setEvidenceFilters({ holdingStatus })}
            />
          </WorkbenchFilters>
          {items.length === 0 ? (
            module.items.length > 0 ? (
              <ul className="workbench-list" data-testid="workbench-list-evidence">
                {module.items.map((item, index) => (
                  <li className="workbench-item" key={index}>
                    <p className="workbench-item__text">{item}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>当前模块没有已校验的结构化项目。</p>
            )
          ) : visible.length === 0 ? (
            <p data-testid="workbench-empty-evidence">当前筛选条件下没有项目，请清除筛选或调整条件。</p>
          ) : (
            <ul className="workbench-list" data-testid="workbench-list-evidence">
              {visible.map((item) => (
                <li className="workbench-item" key={item.itemId} data-testid={`workbench-item-${item.itemId}`}>
                  <p className="workbench-item__text">{item.text}</p>
                  <p className="workbench-item__meta">
                    <span>{item.priorityLabel}</span>
                    <span>{item.holdingStatusLabel}</span>
                    {item.purpose !== null ? <span>证明目的：{item.purpose}</span> : null}
                    {item.sourceHint !== null ? <span>可能来源：{item.sourceHint}</span> : null}
                    {item.preservationRisk !== null ? <span>保全风险：{item.preservationRisk}</span> : null}
                  </p>
                  <WorkbenchMarkButtons
                    itemId={item.itemId}
                    markKey={evidenceKey(item.itemId)}
                    reviewed={reviewed.includes(evidenceKey(item.itemId))}
                    focus={focus.includes(evidenceKey(item.itemId))}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function InterviewPointsWorkbench({ module }: { module: ReportModule }) {
  const {
    reviewed,
    focus,
    isCollapsed,
    interviewFilters,
    setInterviewFilters,
    clearInterviewFilters,
  } = useWorkbench();
  const items: ReportInterviewPointItem[] = module.interviewItems;
  const roleOptions = useMemo(
    () => uniqueOptions(items.map((item) => ({ id: item.role, label: item.roleLabel }))),
    [items],
  );

  const visible = items.filter((item) => {
    if (!matchesMark(interviewFilters.mark, reviewed, focus, interviewKey(item.itemId))) return false;
    if (interviewFilters.role !== null && item.role !== interviewFilters.role) return false;
    return true;
  });
  const filtersActive = interviewFilters.mark !== "all" || interviewFilters.role !== null;

  return (
    <section
      id="report-module-interview_points"
      className="report-module report-module--workbench"
      data-testid="report-module-interview_points"
      data-workbench="interview"
    >
      <ModuleHead module={module} collapsedKey="interview" testIdSuffix="interview" />
      {module.summary ? <p>{module.summary}</p> : null}
      {module.failureReason ? <p role="alert">{module.failureReason}</p> : null}
      {isCollapsed("interview") ? null : (
        <>
          <WorkbenchFilters
            testIdSuffix="interview"
            mark={interviewFilters.mark}
            onMark={(mark) => setInterviewFilters({ mark })}
            filtersActive={filtersActive}
            visibleCount={visible.length}
            totalCount={items.length}
            onClear={clearInterviewFilters}
          >
            <ChipGroup
              legend="询问对象角色"
              dimension="role"
              testIdSuffix="interview"
              options={roleOptions}
              selected={interviewFilters.role}
              onSelect={(role) => setInterviewFilters({ role })}
            />
          </WorkbenchFilters>
          {items.length === 0 ? (
            module.items.length > 0 ? (
              <ul className="workbench-list" data-testid="workbench-list-interview">
                {module.items.map((item, index) => (
                  <li className="workbench-item" key={index}>
                    <p className="workbench-item__text">{item}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>当前模块没有已校验的结构化项目。</p>
            )
          ) : visible.length === 0 ? (
            <p data-testid="workbench-empty-interview">当前筛选条件下没有项目，请清除筛选或调整条件。</p>
          ) : (
            <ul className="workbench-list" data-testid="workbench-list-interview">
              {visible.map((item) => (
                <li className="workbench-item" key={item.itemId} data-testid={`workbench-item-${item.itemId}`}>
                  <p className="workbench-item__text">{item.text}</p>
                  <p className="workbench-item__meta">
                    <span>询问对象：{item.roleLabel}</span>
                    {item.topic !== null ? <span>要点：{item.topic}</span> : null}
                  </p>
                  <WorkbenchMarkButtons
                    itemId={item.itemId}
                    markKey={interviewKey(item.itemId)}
                    reviewed={reviewed.includes(interviewKey(item.itemId))}
                    focus={focus.includes(interviewKey(item.itemId))}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
