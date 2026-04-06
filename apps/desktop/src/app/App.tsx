import { RouterProvider } from "react-router-dom";
import { AppProviders } from "./providers";
import { ScanWorkflowProvider } from "./scanWorkflow";
import { createAppRouter } from "./router";

const router = createAppRouter();

export function App() {
  return (
    <AppProviders>
      <ScanWorkflowProvider>
        <RouterProvider router={router} />
      </ScanWorkflowProvider>
    </AppProviders>
  );
}
