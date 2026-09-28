import { useState } from "react";
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
  type FeedbackResponse,
} from "@policymate/contracts";
import { ApiFailure, requestJson } from "../api/client";

const CATEGORIES = Object.keys(FEEDBACK_CATEGORY_LABELS) as FeedbackCategory[];

/**
 * 结构化反馈。只提供预定义类型，不提供自由文本框，也不上传页面文本、
 * 案情、事实、报告或检索词。
 */
export function FeedbackPanel({ pageId = "data_use" }: { pageId?: string } = {}) {
  const [submitting, setSubmitting] = useState<FeedbackCategory | null>(null);
  const [accepted, setAccepted] = useState<{ categoryLabel: string; requestId: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (category: FeedbackCategory) => {
    if (submitting !== null) return;
    setSubmitting(category);
    setFailure(null);
    try {
      const result = await requestJson<FeedbackResponse>("/api/v1/feedback", {
        method: "POST",
        body: {
          contractVersion: "1.0",
          category,
          metadata: { pageId },
        },
      });
      setAccepted({ categoryLabel: result.categoryLabel, requestId: result.requestId });
    } catch (error) {
      setFailure(
        error instanceof ApiFailure ? error.message : "反馈提交失败，请稍后重试。",
      );
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <section className="info-section info-section--feedback" data-testid="feedback-panel">
      <span className="info-section__index" aria-hidden="true">
        反馈
      </span>
      <div className="info-section__content">
        <h2 className="info-section__title">结构化反馈</h2>
        <p>
          请选择最接近的问题类型。反馈只提交预定义类型和不含案情的元数据；本页不提供自由文本框，
          也不会上传页面文本、案情、事实、报告或检索词。
        </p>
        <ul className="feedback-options">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void submit(category)}
                disabled={submitting !== null}
                data-testid={`feedback-${category}`}
              >
                {submitting === category ? "正在提交…" : FEEDBACK_CATEGORY_LABELS[category]}
              </button>
            </li>
          ))}
        </ul>
        {accepted !== null ? (
          <p className="feedback-accepted" role="status" data-testid="feedback-accepted">
            已收到反馈：{accepted.categoryLabel}（排查用请求编号：{accepted.requestId}）
          </p>
        ) : null}
        {failure !== null ? (
          <p className="case-input__error" role="alert" data-testid="feedback-failure">
            {failure}
          </p>
        ) : null}
        <p className="field__note">需要进一步排查时，由试行组织者在线下联系。</p>
      </div>
    </section>
  );
}
