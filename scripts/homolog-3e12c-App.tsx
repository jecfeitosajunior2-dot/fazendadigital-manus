/**
 * App enxuto só para a 3E.12C. Usa as páginas React reais, em carga sob demanda.
 */
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CattleProvider } from "@/contexts/CattleContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { AuthGuard } from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";

const NovaVendaPage = lazy(() => import("@/pages/NovaVendaPage"));
const VendaDetalhePage = lazy(() => import("@/pages/VendaDetalhePage"));

function OverviewStub() {
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Homologação 3E.12C</h1>
      <p className="text-sm text-gray-600">Ambiente isolado. Abra Nova Venda para continuar.</p>
    </div>
  );
}

function ProtectedRoutes() {
  return (
    <Suspense fallback={<div className="p-6">Carregando tela…</div>}>
      <Switch>
        <Route path="/admin/overview" component={OverviewStub} />
        <Route path="/compra-venda/vendas/nova" component={NovaVendaPage} />
        <Route path="/compra-venda/vendas/:id" component={VendaDetalhePage} />
        <Route>
          <OverviewStub />
        </Route>
      </Switch>
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/entrar" />} />
      <Route path="/entrar" component={LoginPage} />
      <Route>
        {() => (
          <AuthGuard>
            <ProtectedRoutes />
          </AuthGuard>
        )}
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <NotificationProvider>
          <CattleProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </CattleProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
