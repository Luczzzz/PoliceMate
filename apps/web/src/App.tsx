import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AnalysisFlowProvider } from "./analysis/AnalysisSessionContext";
import { WorkbenchProvider } from "./analysis/WorkbenchContext";
import { ScrollToTop } from "./app/ScrollToTop";
import { ShellProvider } from "./app/ShellContext";
import { AuthProvider } from "./app/AuthContext";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineBanner } from "./components/OfflineBanner";
import { AccidentLiabilityPage } from "./pages/AccidentLiabilityPage";
import { AnalysisEntryPage } from "./pages/analysis/AnalysisEntryPage";
import { AnalysisReportPage } from "./pages/analysis/AnalysisReportPage";
import { ModifyFactsPage } from "./pages/analysis/ModifyFactsPage";
import { DataUsePage } from "./pages/DataUsePage";
import { DocumentExampleDetailPage } from "./pages/DocumentExampleDetailPage";
import { DocumentsRoute } from "./pages/DocumentsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { CalendarPage } from "./pages/CalendarPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { TestThrowPage } from "./pages/TestThrowPage";

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ErrorBoundary>
        <a className="skip-link" href="#main">
          跳到主要内容
        </a>
        <div className="app-shell">
          <OfflineBanner />
          <main id="main" className="app-main">
            <AuthProvider>
              <ShellProvider>
                <AnalysisFlowProvider>
                  <WorkbenchProvider>
                    <AnalysisProgress />
                    <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/data-use" element={<DataUsePage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/analysis" element={<AnalysisEntryPage />} />
                    <Route path="/accident-liability" element={<AccidentLiabilityPage />} />
                    <Route path="/analysis/report" element={<AnalysisReportPage />} />
                    <Route path="/analysis/modify" element={<ModifyFactsPage />} />
                    <Route
                      path="/documents"
                      element={<DocumentsRoute />}
                    />
                    <Route path="/documents/:exampleId" element={<DocumentExampleDetailPage />} />
                    {import.meta.env.DEV ? (
                      <Route path="/__test__/throw" element={<TestThrowPage />} />
                    ) : null}
                    <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </WorkbenchProvider>
                </AnalysisFlowProvider>
              </ShellProvider>
            </AuthProvider>
          </main>
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
