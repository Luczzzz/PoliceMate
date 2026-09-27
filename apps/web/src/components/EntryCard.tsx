import { useNavigate } from "react-router-dom";
import type { CapabilityId } from "@policymate/contracts";
import { Icon, type IconName } from "./Icon";

export interface EntryCardProps {
  capability: CapabilityId;
  title: string;
  description: string;
  icon: IconName;
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
          <Icon name={icon} size={25} />
        </span>
        <div className="entry-card__headings">
          <h2 className="entry-card__title">{title}</h2>
          <span
            className={`entry-card__status ${available ? "is-available" : "is-unavailable"}`}
            data-testid={`entry-status-${capability}`}
          >
            <Icon name={available ? "check" : "alert"} size={13} strokeWidth={2.2} />
            {available ? null : <span className="visually-hidden">!</span>}
            {available ? "服务可用" : "暂不可用"}
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
          <Icon name="arrowRight" size={19} />
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
            disabled
            aria-disabled="true"
            aria-describedby={`${descriptionId} ${reasonId}`}
          >
            暂不可用
          </button>
        </>
      )}
    </article>
  );
}
