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
import SubdivisoesPage from "./pages/SubdivisoesPage";
import {
  FarmsOverviewPage,
  FarmsListPage,
  HerdOverviewPage,
  QuickAccessPage,
  AdministrativeOverviewPage,
  PurchasesPage,
  SalesPage,
  SimulationsFeedlotPage,
  SimulationsSemiFeedlotPage,
} from "./pages/ModulePages";
import { NewAnimalPage } from "./pages/NewAnimalPage";
import { EditAnimalPage } from "./pages/EditAnimalPage";
import { CattleDetailPageExpanded } from "./pages/CattleDetailPageExpanded";
import LotsManagementPage from "./pages/LotsManagementPage";
import MapaRebanhoPage from "./pages/MapaRebanhoPage";
import AlocacaoAnimaisPage from "./pages/AlocacaoAnimaisPage";
import { NewLotePage } from "./pages/LoteFormPage";
import EditLotePage from "./pages/EditLotePage";
import { SaudePage } from "./pages/ReproductionManagementPage";
import { ReproductionManagementPage } from "./pages/ReproductionManagementPage";
import { FinancialManagementPage } from "./pages/FinancialManagementPage";
import FinancialPeoplePage from "./pages/FinancialPeoplePage";
import { ReportsManagementPage } from "./pages/ReportsManagementPage";
import SuppliesManagementPage from "./pages/SuppliesManagementPage";
import {
  ManejoVisaoGeralPage,
  ManejoRegistrosPage,
  ManejoFormPage,
  ManejoSessaoPage,
} from "./pages/ManejoPages";
import DiagnosticoAt05Page from "./pages/DiagnosticoAt05Page";
import FarmRegistrationPage from "./pages/FarmRegistrationPage";
import BenfeitoriasListPage from "./pages/BenfeitoriasListPage";
import BenfeitoriaRegistrationPage from "./pages/BenfeitoriaRegistrationPage";
import ProductRegistrationPage from "./pages/ProductRegistrationPage";
import MaquinaRegistrationPage from "./pages/MaquinaRegistrationPage";
import MaquinasListPage from "./pages/MaquinasListPage";
import AbastecimentoListPage from "./pages/AbastecimentoListPage";
import AbastecimentoFormPage from "./pages/AbastecimentoFormPage";
import InsumosVisaoGeralPage from "./pages/InsumosVisaoGeralPage";
import InsumosNovaMovimentacaoPage from "./pages/InsumosNovaMovimentacaoPage";
import InsumosHistoricoMovimentacaoPage from "./pages/InsumosHistoricoMovimentacaoPage";
import ManutencaoListPage from "./pages/ManutencaoListPage";
import ManutencaoFormPage from "./pages/ManutencaoFormPage";

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
      <Route path="/fazendas/subdivisoes" component={SubdivisoesPage} />

      {/* Administrativo */}
      <Route path="/administrativo/visao-geral" component={AdministrativeOverviewPage} />
      <Route path="/benfeitorias/visao-geral" component={() => <RedirectTo to="/fazendas/benfeitorias" />} />
      <Route path="/benfeitorias/lista-benfeitorias" component={() => <RedirectTo to="/fazendas/benfeitorias" />} />

      {/* Herd */}
      <Route path="/rebanho/visao-geral" component={HerdOverviewPage} />
      <Route path="/rebanho/lista-animais" component={AnimaisPage} />
      <Route path="/rebanho/mapa-rebanho" component={MapaRebanhoPage} />
      <Route path="/rebanho/alocacao-animais" component={AlocacaoAnimaisPage} />
      <Route path="/rebanho/lotes" component={LotsManagementPage} />
      <Route path="/rebanho/novo-lote" component={NewLotePage} />
      <Route path="/rebanho/editar-lote" component={EditLotePage} />
      <Route path="/rebanho/detalhes-animal" component={CattleDetailPageExpanded} />
      <Route path="/rebanho/novo-animal" component={NewAnimalPage} />
      <Route path="/rebanho/editar-animal" component={EditAnimalPage} />

      {/* Manejo */}
      <Route path="/manejo/visao-geral" component={ManejoVisaoGeralPage} />
      <Route path="/manejo/registros/sessao" component={ManejoSessaoPage} />
      <Route path="/manejo/registros/cadastro" component={ManejoFormPage} />
      <Route path="/manejo/registros" component={ManejoRegistrosPage} />
      <Route path="/manejos/meus" component={() => <RedirectTo to="/manejo/registros" />} />
      <Route path="/manejos/listar" component={() => <RedirectTo to="/manejo/registros" />} />
      <Route path="/manejos/criar" component={() => <RedirectTo to="/manejo/registros/cadastro" />} />
      <Route path="/manejos/basicos" component={() => <RedirectTo to="/manejo/registros" />} />

      {/* POC temporária — Diagnóstico AT05 (Web Serial). Sem item de menu. */}
      <Route path="/diagnostico/at05" component={DiagnosticoAt05Page} />

      {/* Insumos */}
      <Route path="/insumos/visao-geral" component={() => <InsumosVisaoGeralPage />} />
      <Route path="/insumos/lista-produtos" component={EstoquePage} />
      <Route path="/insumos/estoque" component={() => <RedirectTo to="/insumos/lista-produtos" />} />
      <Route path="/insumos/movimentacao" component={() => <InsumosVisaoGeralPage variant="movimentacao" />} />
      <Route path="/insumos/nova-movimentacao" component={InsumosNovaMovimentacaoPage} />
      <Route path="/insumos/historico-produto" component={InsumosHistoricoMovimentacaoPage} />
      <Route path="/insumos/cadastro" component={ProductRegistrationPage} />
      <Route path="/insumos/entradas" component={() => <RedirectTo to="/insumos/movimentacao" />} />
      <Route path="/insumos/saidas" component={() => <RedirectTo to="/insumos/movimentacao" />} />

      {/* Machinery */}
      <Route path="/maquinas/visao-geral" component={MaquinasListPage} />
      <Route path="/maquinas/cadastro" component={MaquinaRegistrationPage} />
      <Route path="/maquinas/lista-maquinas" component={() => <RedirectTo to="/maquinas/visao-geral" />} />
      <Route path="/maquinas/abastecimento/cadastro" component={AbastecimentoFormPage} />
      <Route path="/maquinas/abastecimento" component={AbastecimentoListPage} />
      <Route path="/maquinas/manutencao/cadastro" component={ManutencaoFormPage} />
      <Route path="/maquinas/manutencao" component={ManutencaoListPage} />

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
      <Route path="/financeiro/pessoas" component={FinancialPeoplePage} />

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
