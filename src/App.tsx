import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "radix-ui/tooltip";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Professores } from "@/pages/professores";

export function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SidebarProvider>
        <TooltipProvider>
          <AppSidebar />
          <main className="flex min-h-full flex-1 flex-col">
            <SiteHeader />
            <Professores />
          </main>
          <Toaster />
        </TooltipProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}
