import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "radix-ui/tooltip";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Cadernetas } from "@/pages/cadernetas";
import { Professores } from "@/pages/professores";

export function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <BrowserRouter>
        <SidebarProvider>
          <TooltipProvider>
            <AppSidebar />
            <main className="flex min-h-full flex-1 flex-col">
              <SiteHeader />
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to="/professores" replace />}
                />
                <Route path="/professores" element={<Professores />} />
                <Route path="/cadernetas" element={<Cadernetas />} />
              </Routes>
            </main>
            <Toaster />
          </TooltipProvider>
        </SidebarProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
