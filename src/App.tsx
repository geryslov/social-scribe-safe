import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { WorkspaceThemeProvider } from "@/components/WorkspaceThemeProvider";
import Analytics from "./pages/Analytics";
import Posts from "./pages/Posts";
import PublisherAnalytics from "./pages/PublisherAnalytics";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import DocumentLibrary from "./pages/DocumentLibrary";
import DocumentEditor from "./pages/DocumentEditor";
import JoinWorkspace from "./pages/JoinWorkspace";
import AdminDashboard from "./pages/AdminDashboard";

const App = () => {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceProvider>
          <WorkspaceThemeProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                <Route path="/" element={<Posts />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/publisher/:name" element={<PublisherAnalytics />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/documents" element={<DocumentLibrary />} />
                  <Route path="/documents/:id" element={<DocumentEditor />} />
                  <Route path="/join/:token" element={<JoinWorkspace />} />
                  <Route path="/admin" element={<AdminDashboard />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </WorkspaceThemeProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
