import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CattleProvider } from "./contexts/CattleContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import { AnimaisPage, EstoquePage, ContasPage } from "./pages/GenericPage";
import {
  FarmsOverviewPage,
  FarmsListPage,
  SubdivisionsPage,
  HerdOverviewPage,
  HerdMapPage,
  LotsPage,
  MyManagementsPage,
  CreateManagementPage,
  ListManagementsPage,
  BasicManagementsPage,
  SuppliesEntriesPage,
  SuppliesExitsPage,
  MachineryFuelingPage,
  MachineryMaintenancePage,
  MachineryListPage,
  ReproductionProtocolsPage,
  ReproductionSemenPage,
  ReproductionEmbryosPage,
  NutritionDietsPage,
  NutritionTroughsPage,
  PurchasesPage,
  SalesPage,
  FinancialTransactionsPage,
  FinancialCategoriesPage,
  FinancialPeoplePage,
  ReportsManagerialPage,
  ReportsEvolutionPage,
  ReportsReproductivePage,
  ReportsOperationalPage,
  SimulationsFeedlotPage,
  SimulationsSemiFeedlotPage,
  AdministrativeOverviewPage,
  ImprovementsPage,
  QuickAccessPage,
} from "./pages/ModulePages";
import BulkCattleImportPage from "./pages/BulkCattleImportPage";
import CattleDetailPage from "./pages/CattleDetailPage";
import { NewAnimalPage } from "./pages/NewAnimalPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/entrar" />} />
      <Route path="/entrar" component={LoginPage} />
      <Route path="/admin/overview" component={DashboardPage} />
      
      {/* Quick Access */}
      <Route path="/primeiro-uso/help" component={QuickAccessPage} />
      
      {/* Farms */}
      <Route path="/fazendas/visao-geral" component={FarmsOverviewPage} />
      <Route path="/fazendas/lista-fazendas" component={FarmsListPage} />
      <Route path="/fazendas/subdivisoes" component={SubdivisionsPage} />
      
      {/* Administrative */}
      <Route path="/benfeitorias/visao-geral" component={AdministrativeOverviewPage} />
      <Route path="/benfeitorias/lista-benfeitorias" component={ImprovementsPage} />
      
      {/* Herd */}
      <Route path="/rebanho/visao-geral" component={HerdOverviewPage} />
      <Route path="/rebanho/lista-animais" component={AnimaisPage} />
      <Route path="/rebanho/mapa-rebanho" component={HerdMapPage} />
      <Route path="/rebanho/lotes" component={LotsPage} />
      <Route path="/rebanho/importacao-em-massa" component={BulkCattleImportPage} />
        <Route path="/rebanho/detalhes-animal" component={CattleDetailPage} />
        <Route path="/rebanho/novo-animal" component={NewAnimalPage} />
      
      {/* Manejos */}
      <Route path="/manejos/meus" component={MyManagementsPage} />
      <Route path="/manejos/criar" component={CreateManagementPage} />
      <Route path="/manejos/listar" component={ListManagementsPage} />
      <Route path="/manejos/basicos" component={BasicManagementsPage} />
      
      {/* Supplies */}
      <Route path="/insumos/estoque" component={EstoquePage} />
      <Route path="/insumos/entradas" component={SuppliesEntriesPage} />
      <Route path="/insumos/saidas" component={SuppliesExitsPage} />
      
      {/* Machinery */}
      <Route path="/maquinas/abastecimento" component={MachineryFuelingPage} />
      <Route path="/maquinas/manutencao" component={MachineryMaintenancePage} />
      <Route path="/maquinas/lista-maquinas" component={MachineryListPage} />
      
      {/* Reproduction */}
      <Route path="/reproducao/protocolos" component={ReproductionProtocolsPage} />
      <Route path="/reproducao/semen" component={ReproductionSemenPage} />
      <Route path="/reproducao/embrioes" component={ReproductionEmbryosPage} />
      
      {/* Nutrition */}
      <Route path="/nutricao/dietas" component={NutritionDietsPage} />
      <Route path="/nutricao/cochos" component={NutritionTroughsPage} />
      
      {/* Purchase and Sale */}
      <Route path="/compra-venda/compras" component={PurchasesPage} />
      <Route path="/compra-venda/vendas" component={SalesPage} />
      
      {/* Financial */}
      <Route path="/financeiro/contas" component={ContasPage} />
      <Route path="/financeiro/movimentacao" component={FinancialTransactionsPage} />
      <Route path="/financeiro/categorias" component={FinancialCategoriesPage} />
      <Route path="/financeiro/pessoas" component={FinancialPeoplePage} />
      
      {/* Reports */}
      <Route path="/relatorios/gerenciais" component={ReportsManagerialPage} />
      <Route path="/relatorios/evolucao" component={ReportsEvolutionPage} />
      <Route path="/relatorios/reprodutivos" component={ReportsReproductivePage} />
      <Route path="/relatorios/operacionais" component={ReportsOperationalPage} />
      
      {/* Simulations */}
      <Route path="/simulacoes/confinamento" component={SimulationsFeedlotPage} />
      <Route path="/simulacoes/semi-confinamento" component={SimulationsSemiFeedlotPage} />
      
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <CattleProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </CattleProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
