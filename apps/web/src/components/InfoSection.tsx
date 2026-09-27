import type { ReactNode } from "react";

export interface InfoSectionProps {
  index: number;
  title: string;
  testId?: string;
  children: ReactNode;
}

/** 说明页统一的编号小节，索引仅作视觉辅助并隐藏在无障碍树之外。 */
export function InfoSection({ index, title, testId, children }: InfoSectionProps) {
  return (
    <section className="info-section" data-testid={testId}>
      <span className="info-section__index" aria-hidden="true">
        {String(index).padStart(2, "0")}
      </span>
      <div className="info-section__content">
        <h2 className="info-section__title">{title}</h2>
        {children}
      </div>
    </section>
  );
}
