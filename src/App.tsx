import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Analytics from "./pages/Analytics";
import Posts from "./pages/Posts";
import PublisherAnalytics from "./pages/PublisherAnalytics";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import DocumentLibrary from "./pages/DocumentLibrary";
import DocumentEditor from "./pages/DocumentEditor";

const App = () => {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Analytics />} />
              <Route path="/posts" element={<Posts />} />
              <Route path="/publisher/:name" element={<PublisherAnalytics />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/documents" element={<DocumentLibrary />} />
              <Route path="/documents/:id" element={<DocumentEditor />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
