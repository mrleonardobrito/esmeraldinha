import * as React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "radix-ui/tooltip";
import { ContaProvider, useConta } from "@/components/conta-provider";
import { SiteHeader } from "@/components/site-header";
import { PrimeiroAcesso, TelaDeEntrada } from "@/components/tela-de-entrada";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { WelcomeTour } from "@/components/welcome-tour";
import { Cadernetas } from "@/pages/cadernetas";
import { ContaPage } from "@/pages/conta";
import { Painel } from "@/pages/painel";
import { Professores } from "@/pages/professores";
import { migrateProfessoresFromLocalStorage } from "@/lib/professores-migration";
import { hasSeenWelcome } from "@/lib/welcome";

function Esmeraldinha() {
  const { conta } = useConta();
  const [guiaAberto, setGuiaAberto] = React.useState(() => !hasSeenWelcome());

  React.useEffect(() => {
    if (conta?.papel === "auxiliar de ensino") void migrateProfessoresFromLocalStorage();
  }, [conta?.papel]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
        <SiteHeader onAbrirGuia={() => setGuiaAberto(true)} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/painel" replace />} />
          <Route path="/painel" element={<Painel />} />
          <Route
            path="/professores"
            element={conta?.papel === "auxiliar de ensino" ? <Professores /> : <Navigate to="/cadernetas" replace />}
          />
          <Route path="/cadernetas" element={<Cadernetas />} />
          <Route
            path="/conta"
            element={<ContaPage />}
          />
        </Routes>
        </div>
      </main>
      {guiaAberto && <WelcomeTour onClose={() => setGuiaAberto(false)} />}
    </SidebarProvider>
  );
}

function Acesso() {
  const { conta, carregando } = useConta();

  if (carregando) return null;
  if (!conta) return <TelaDeEntrada />;
  if (conta.precisaTrocarSenha) return <PrimeiroAcesso />;

  return <Esmeraldinha />;
}

export function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <BrowserRouter>
        <ContaProvider>
          <TooltipProvider>
            <Acesso />
            <Toaster />
          </TooltipProvider>
        </ContaProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
