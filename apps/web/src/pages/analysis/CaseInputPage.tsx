import { useMemo, useState } from "react";
import { CASE_TEXT_MAX_CHARACTERS, countCharacters } from "@policymate/contracts";
import { useNavigate } from "react-router-dom";
import { ApiFailure } from "../../api/client";
import { useAnalysisFlow } from "../../analysis/AnalysisSessionContext";
import { CapabilityGate } from "../../components/CapabilityGate";
import { FailurePanel } from "../../components/FailurePanel";
import { InlineFailure } from "../../components/InlineFailure";
import { InfoSection } from "../../components/InfoSection";

/**
 * 案情输入页。
 *
 * 常驻显示脱敏义务和“内容将发送至 Dify 处理”的提示；只接受纯文本；
 * 显示字符计数。超过上限或包含不支持内容时明确拒绝，不静默截断。
 */
const BOUNDARY_SECTIONS: ReadonlyArray<{ title: string; paragraphs: string[] }> = [
  {
    title: "程序辅助工具边界",
    paragraphs: [
      "松警伴侣输出的是供民警核验的辅助内容，不创建官方案件记录，也不作出受案、立案、定性、处罚、审批或其他执法决定。",
      "分析结果必须结合现行规范、正式案卷、公安业务系统和有权民警判断。",
    ],
  },
  {
    title: "当前标签页生命周期",
    paragraphs: [
      "分析内容仅属于当前浏览器标签页，不跨标签页、不跨设备，也不形成分析历史。",
      "刷新、关闭标签页或空闲 30 分钟后，内容不可恢复。",
    ],
  },
];

export function CaseInputPage() {
  const { start } = useAnalysisFlow();
  const navigate = useNavigate();
  const [caseText, setCaseText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const characterCount = useMemo(() => countCharacters(caseText), [caseText]);
  const overLimit = characterCount > CASE_TEXT_MAX_CHARACTERS;
  const empty = caseText.trim() === "";

  const submit = async () => {
    if (overLimit || empty || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await start(caseText);
      navigate("/analysis/facts");
    } catch (error) {
      setFailure(
        error instanceof ApiFailure
          ? error
          : new ApiFailure("server", "服务暂时不可用，请稍后重试。"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CapabilityGate
      capability="caseAnalysis"
      title="案情分析 · 输入案情"
      intro="输入脱敏后的自由案情，系统将提取候选事实，经你逐项确认后再进入决定性追问。"
      icon="analysis"
      command="案情输入 → 候选事实确认 → 决定性追问 → 分析前确认"
    >
      <div className="case-input" data-testid="case-input">
        <section className="deidentification-notice" data-testid="deidentification-notice" role="note">
          <h2 className="deidentification-notice__title">提交前请确认</h2>
          <ul className="deidentification-notice__list">
            <li>
              请勿输入姓名、身份证号、手机号、精确住址等真实身份信息；本产品不做自动脱敏，
              提交前请自行完成脱敏。
            </li>
            <li>提交内容将经 PoliceMate 后端发送至 Dify 处理。</li>
            <li>这里只接受纯文本：不支持文件、图片、语音或富文本格式。</li>
            <li>内容只保留在当前标签页，不自动保存草稿。</li>
          </ul>
        </section>

        <label className="field" htmlFor="case-text-input">
          <span className="field__label">案情内容（脱敏后的自由描述）</span>
          <textarea
            id="case-text-input"
            className="field__input case-input__textarea"
            rows={9}
            value={caseText}
            onChange={(event) => setCaseText(event.target.value)}
            placeholder="请描述大致时间、地点、相关人员、主要行为、结果和当前未知事项。"
            data-testid="case-text-input"
            aria-describedby="case-char-count case-input-hint"
          />
        </label>
        <div className="case-input__meta">
          <p
            className={`case-input__count${overLimit ? " case-input__count--over" : ""}`}
            id="case-char-count"
            data-testid="char-count"
            aria-live="polite"
          >
            已输入 {characterCount.toLocaleString("zh-Hans-CN")} / {CASE_TEXT_MAX_CHARACTERS.toLocaleString("zh-Hans-CN")} 字符
            {overLimit ? "：已超出上限，请精简后提交" : ""}
          </p>
          <p className="field__note" id="case-input-hint">
            提示：可以用“人员甲”“张某”等中性表述代替真实姓名。
          </p>
        </div>

        {overLimit ? (
          <p className="case-input__error" data-testid="case-input-error" role="alert">
            案情内容超过 {CASE_TEXT_MAX_CHARACTERS.toLocaleString("zh-Hans-CN")} 字符上限，无法提交；系统不会截断内容，请分段精简后重新输入。
          </p>
        ) : null}
        {failure !== null ? <InlineFailure failure={failure} testId="case-input-failure" /> : null}

        <button
          type="button"
          className="button button--primary case-input__submit"
          onClick={() => void submit()}
          disabled={overLimit || empty || submitting}
          data-testid="case-input-submit"
        >
          {submitting ? "正在提取候选事实…" : "提交案情，提取候选事实"}
        </button>
        <p className="field__note">
          提交后系统只做候选事实提取，不会默认确认任何事实；所有候选事实都需要你逐项确认。
        </p>
      </div>

      <div className="document-list">
        {BOUNDARY_SECTIONS.map((section, index) => (
          <InfoSection key={section.title} index={index + 1} title={section.title}>
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p key={`p-${paragraphIndex}`}>{paragraph}</p>
            ))}
          </InfoSection>
        ))}
      </div>
    </CapabilityGate>
  );
}
