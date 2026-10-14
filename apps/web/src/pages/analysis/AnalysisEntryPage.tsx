import { useShell } from "../../app/ShellContext";
import { CaseInputPage } from "./CaseInputPage";
import { StreamAnalysisPage } from "./StreamAnalysisPage";

/** `/analysis` 入口：由后端外壳的 reportFormat 决定进入流式页面还是结构化报告流程。 */
export function AnalysisEntryPage() {
  const { state } = useShell();
  return state.status === "ready" && state.data.reportFormat === "stream" ? <StreamAnalysisPage /> : <CaseInputPage />;
}
