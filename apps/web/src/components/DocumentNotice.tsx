import type { DocumentExampleNotice } from "@policymate/contracts";
import { Icon } from "./Icon";

/**
 * 文书范例常驻定位说明。列表页与详情页都必须显示，
 * 用于避免把只读指导误认为可直接制发的正式模板。
 */
export function DocumentNotice({ notice }: { notice: DocumentExampleNotice }) {
  return (
    <aside className="document-notice" data-testid="document-notice" aria-label="文书范例定位说明">
      <span className="document-notice__icon" aria-hidden="true">
        <Icon name="shield" size={22} />
      </span>
      <div className="document-notice__body">
        <p className="document-notice__lead">{notice.auxiliaryReference}</p>
        <ul className="document-notice__list">
          <li>{notice.notFormalTemplate}</li>
          <li>{notice.mustNotIssue}</li>
          <li>{notice.fictionalData}</li>
        </ul>
      </div>
    </aside>
  );
}
