import { useNavigate } from "react-router-dom";
import type { CapabilityId } from "@policymate/contracts";

export interface EntryCardProps {
  capability: CapabilityId;
  title: string;
  description: string;
  icon: string;
  available: boolean;
  reason: string | null;
  to: string;
}

/**
 * 首页主入口卡片。两个入口使用完全相同的结构和视觉强度，
 * 不区分主次；不可用时在点击前显示“暂不可用”和原因。
 */
export function EntryCard({
  capability,
  title,
  description,
  icon,
  available,
  reason,
  to,
}: EntryCardProps) {
  const navigate = useNavigate();
  const descriptionId = `entry-description-${capability}`;
  const reasonId = `entry-reason-${capability}`;

  return (
    <article
      className={`entry-card${available ? "" : " entry-card--unavailable"}`}
      data-testid={`entry-${capability}`}
      data-available={available ? "true" : "false"}
    >
      <div className="entry-card__head">
        <span className="entry-card__icon" aria-hidden="true">
          {icon}
        </span>
        <div className="entry-card__headings">
          <h2 className="entry-card__title">{title}</h2>
          <span
            className={`entry-card__status ${available ? "is-available" : "is-unavailable"}`}
            data-testid={`entry-status-${capability}`}
          >
            <span aria-hidden="true">{available ? "✓" : "!"}</span>
            {available ? "可用" : "暂不可用"}
          </span>
        </div>
      </div>

      <p className="entry-card__description" id={descriptionId}>
        {description}
      </p>

      {available ? (
        <button
          type="button"
          className="button button--primary entry-card__action"
          data-testid={`entry-action-${capability}`}
          aria-describedby={descriptionId}
          onClick={() => navigate(to)}
        >
          进入{title}
          <span aria-hidden="true">›</span>
        </button>
      ) : (
        <>
          <p className="entry-card__reason" id={reasonId} data-testid={`entry-reason-${capability}`}>
            原因：{reason ?? "该入口当前不可用。"}
          </p>
          <button
            type="button"
            className="button button--muted entry-card__action"
            data-testid={`entry-action-${capability}`}
            aria-disabled="true"
            aria-describedby={`${descriptionId} ${reasonId}`}
            onClick={(event) => event.preventDefault()}
          >
            暂不可用
          </button>
        </>
      )}
    </article>
  );
}
