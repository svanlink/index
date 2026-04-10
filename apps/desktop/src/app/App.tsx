import { RouterProvider } from "react-router-dom";
import { AppProviders } from "./providers";
import { ErrorBoundary } from "./ErrorBoundary";
import { ScanWorkflowProvider } from "./scanWorkflow";
import { createAppRouter } from "./router";

const router = createAppRouter();

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    </ErrorBoundary>
  );
}
