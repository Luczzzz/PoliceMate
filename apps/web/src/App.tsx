import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ShellProvider } from "./app/ShellContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineBanner } from "./components/OfflineBanner";
import { CapabilityBoundaryPage } from "./pages/CapabilityBoundaryPage";
import { DataUsePage } from "./pages/DataUsePage";
import { DocumentExampleDetailPage } from "./pages/DocumentExampleDetailPage";
import { DocumentsRoute } from "./pages/DocumentsPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { TestThrowPage } from "./pages/TestThrowPage";

export function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <a className="skip-link" href="#main">
          跳到主要内容
        </a>
        <div className="app-shell">
          <OfflineBanner />
          <main id="main" className="app-main">
            <ShellProvider>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/data-use" element={<DataUsePage />} />
                <Route
                  path="/analysis"
                  element={<CapabilityBoundaryPage capability="caseAnalysis" />}
                />
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
            </ShellProvider>
          </main>
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
