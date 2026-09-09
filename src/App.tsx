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

/** O app depois da entrada: sidebar, cabeçalho e as rotas. */
function Esmeraldinha() {
  // Na primeira execução o guia se abre sozinho; depois disso ele só aparece
  // se for pedido no cabeçalho.
  const [guiaAberto, setGuiaAberto] = React.useState(() => !hasSeenWelcome());

  // A migração dos professores que ficaram no `localStorage` fala com a API,
  // então só tem como acontecer depois da entrada.
  React.useEffect(() => {
    void migrateProfessoresFromLocalStorage();
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex min-h-full flex-1 flex-col">
        <SiteHeader onAbrirGuia={() => setGuiaAberto(true)} />
        <Routes>
          <Route path="/" element={<Navigate to="/painel" replace />} />
          <Route path="/painel" element={<Painel />} />
          <Route path="/professores" element={<Professores />} />
          <Route path="/cadernetas" element={<Cadernetas />} />
          <Route path="/conta" element={<ContaPage />} />
        </Routes>
      </main>
      {guiaAberto && <WelcomeTour onClose={() => setGuiaAberto(false)} />}
    </SidebarProvider>
  );
}

/**
 * Qual tela existe agora: a entrada enquanto não há sessão, o primeiro
 * acesso enquanto a senha ainda é a temporária, e só então o app.
 */
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
