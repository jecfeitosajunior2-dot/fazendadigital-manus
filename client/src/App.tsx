import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import {
  RebanhoPage,
  LotesPage,
  ManejoPage,
  ReproducaoPage,
  NutricaoPage,
  InsumosPage,
  MaquinarioPage,
  ComercialPage,
  FinanceiroPage,
  RelatoriosPage,
  SimulacoesPage,
  ConfiguracoesPage,
} from "./pages/Modules";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/painel" component={Dashboard} />
      <Route path="/rebanho" component={RebanhoPage} />
      <Route path="/rebanho/lotes" component={LotesPage} />
      <Route path="/manejo" component={ManejoPage} />
      <Route path="/reproducao" component={ReproducaoPage} />
      <Route path="/nutricao" component={NutricaoPage} />
      <Route path="/insumos" component={InsumosPage} />
      <Route path="/maquinario" component={MaquinarioPage} />
      <Route path="/comercial" component={ComercialPage} />
      <Route path="/financeiro" component={FinanceiroPage} />
      <Route path="/relatorios" component={RelatoriosPage} />
      <Route path="/simulacoes" component={SimulacoesPage} />
      <Route path="/configuracoes" component={ConfiguracoesPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors closeButton position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
