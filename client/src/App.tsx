import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CattleProvider } from "./contexts/CattleContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { AuthGuard, AppShell } from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import { AnimaisPage, EstoquePage } from "./pages/GenericPage";
import {
  FarmsOverviewPage,
  FarmsListPage,
  SubdivisionsPage,
  HerdOverviewPage,
  HerdMapPage,
  QuickAccessPage,
  AdministrativeOverviewPage,
  PurchasesPage,
  SalesPage,
  SimulationsFeedlotPage,
  SimulationsSemiFeedlotPage,
} from "./pages/ModulePages";
import BulkCattleImportPage from "./pages/BulkCattleImportPage";
import { NewAnimalPage } from "./pages/NewAnimalPage";
import { EditAnimalPage } from "./pages/EditAnimalPage";
import { CattleDetailPageExpanded } from "./pages/CattleDetailPageExpanded";
import LotsManagementPage from "./pages/LotsManagementPage";
import { SaudePage } from "./pages/ReproductionManagementPage";
import { ReproductionManagementPage } from "./pages/ReproductionManagementPage";
import { FinancialManagementPage } from "./pages/FinancialManagementPage";
import { ReportsManagementPage } from "./pages/ReportsManagementPage";
import SuppliesManagementPage from "./pages/SuppliesManagementPage";
import { AdvancedManagementPage } from "./pages/AdvancedManagementPage";
import FarmRegistrationPage from "./pages/FarmRegistrationPage";
import BenfeitoriasListPage from "./pages/BenfeitoriasListPage";
import BenfeitoriaRegistrationPage from "./pages/BenfeitoriaRegistrationPage";
import ProductRegistrationPage from "./pages/ProductRegistrationPage";

function RedirectTo({ to }: { to: string }) {
  return <Redirect to={to} />;
}

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/admin/overview" component={DashboardPage} />

      {/* Quick Access */}
      <Route path="/primeiro-uso/help" component={QuickAccessPage} />

      {/* Farms — iRancho + FD */}
      <Route path="/fazendas/visao-geral" component={FarmsOverviewPage} />
      <Route path="/fazendas/benfeitorias" component={BenfeitoriasListPage} />
      <Route path="/fazendas/benfeitorias/cadastro" component={BenfeitoriaRegistrationPage} />
      <Route path="/fazendas/lista-fazendas" component={FarmsListPage} />
      <Route path="/fazendas/cadastro" component={FarmRegistrationPage} />
      <Route path="/fazendas/subdivisoes" component={SubdivisionsPage} />

      {/* Administrativo */}
      <Route path="/administrativo/visao-geral" component={AdministrativeOverviewPage} />
      <Route path="/benfeitorias/visao-geral" component={() => <RedirectTo to="/fazendas/benfeitorias" />} />
      <Route path="/benfeitorias/lista-benfeitorias" component={() => <RedirectTo to="/fazendas/benfeitorias" />} />

      {/* Herd */}
      <Route path="/rebanho/visao-geral" component={HerdOverviewPage} />
      <Route path="/rebanho/lista-animais" component={AnimaisPage} />
      <Route path="/rebanho/mapa-rebanho" component={HerdMapPage} />
      <Route path="/rebanho/lotes" component={LotsManagementPage} />
      <Route path="/rebanho/importacao-em-massa" component={BulkCattleImportPage} />
      <Route path="/rebanho/detalhes-animal" component={CattleDetailPageExpanded} />
      <Route path="/rebanho/novo-animal" component={NewAnimalPage} />
      <Route path="/rebanho/editar-animal" component={EditAnimalPage} />

      {/* Manejo — iRancho label + rotas FD */}
      <Route path="/manejo/visao-geral" component={AdvancedManagementPage} />
      <Route path="/manejos/meus" component={AdvancedManagementPage} />
      <Route path="/manejos/criar" component={AdvancedManagementPage} />
      <Route path="/manejos/listar" component={AdvancedManagementPage} />
      <Route path="/manejos/basicos" component={AdvancedManagementPage} />

      {/* Insumos */}
      <Route path="/insumos/visao-geral" component={EstoquePage} />
      <Route path="/insumos/estoque" component={EstoquePage} />
      <Route path="/insumos/cadastro" component={ProductRegistrationPage} />
      <Route path="/insumos/entradas" component={SuppliesManagementPage} />
      <Route path="/insumos/saidas" component={SuppliesManagementPage} />

      {/* Machinery */}
      <Route path="/maquinas/visao-geral" component={AdvancedManagementPage} />
      <Route path="/maquinas/abastecimento" component={AdvancedManagementPage} />
      <Route path="/maquinas/manutencao" component={AdvancedManagementPage} />
      <Route path="/maquinas/lista-maquinas" component={AdvancedManagementPage} />

      {/* Reproduction & Saude */}
      <Route path="/reproducao/visao-geral" component={ReproductionManagementPage} />
      <Route path="/reproducao/protocolos" component={ReproductionManagementPage} />
      <Route path="/reproducao/semen" component={ReproductionManagementPage} />
      <Route path="/reproducao/embrioes" component={ReproductionManagementPage} />
      <Route path="/saude/registros" component={SaudePage} />

      {/* Nutrition */}
      <Route path="/nutricao/visao-geral" component={SuppliesManagementPage} />
      <Route path="/nutricao/dietas" component={SuppliesManagementPage} />
      <Route path="/nutricao/cochos" component={SuppliesManagementPage} />
      <Route path="/nutricao/batidas" component={SuppliesManagementPage} />

      {/* Purchase and Sale */}
      <Route path="/compra-venda/visao-geral" component={PurchasesPage} />
      <Route path="/compra-venda/compras" component={PurchasesPage} />
      <Route path="/compra-venda/vendas" component={SalesPage} />

      {/* Financial */}
      <Route path="/financeiro/visao-geral" component={FinancialManagementPage} />
      <Route path="/financeiro/contas" component={FinancialManagementPage} />
      <Route path="/financeiro/movimentacao" component={FinancialManagementPage} />
      <Route path="/financeiro/categorias" component={FinancialManagementPage} />
      <Route path="/financeiro/pessoas" component={FinancialManagementPage} />

      {/* Reports */}
      <Route path="/relatorios/visao-geral" component={ReportsManagementPage} />
      <Route path="/relatorios/gerenciais" component={ReportsManagementPage} />
      <Route path="/relatorios/evolucao" component={ReportsManagementPage} />
      <Route path="/relatorios/reprodutivos" component={ReportsManagementPage} />
      <Route path="/relatorios/operacionais" component={ReportsManagementPage} />

      {/* Simulations */}
      <Route path="/simulacoes/visao-geral" component={SimulationsFeedlotPage} />
      <Route path="/simulacoes/confinamento" component={SimulationsFeedlotPage} />
      <Route path="/simulacoes/semi-confinamento" component={SimulationsSemiFeedlotPage} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
            <AppShell>
              <ProtectedRoutes />
            </AppShell>
          </AuthGuard>
        )}
      </Route>
    </Switch>
  );
}

function App() {
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

export default App;
