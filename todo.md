# AgroGestor Pro - TODO

## Módulo Animais
- [x] NewAnimalPage com tRPC real (trpc.animais.create)
- [x] EditAnimalPage com tRPC real (trpc.animais.getById + trpc.animais.update)
- [x] CattleDetailPageExpanded com tRPC real (animais, saude, pesagens, reproducao)
- [x] BulkCattleImportPage com tRPC real (trpc.animais.create por animal)
- [x] AnimaisPage com delete real (trpc.animais.delete)

## Módulo Compra e Venda
- [x] Tabelas compras e vendas criadas no banco de dados
- [x] Router tRPC compras (list, create, delete)
- [x] Router tRPC vendas (list, create, delete)
- [x] PurchasesPage com CRUD real via tRPC
- [x] SalesPage com CRUD real via tRPC

## Módulo Botões e Ações
- [x] Todos os botões em FarmsOverviewPage com onClick
- [x] Todos os botões em FarmsListPage com onClick
- [x] Todos os botões em FarmsSubdivisionsPage com onClick
- [x] Todos os botões em HerdMapPage com onClick
- [x] Todos os botões em BasicManagementPage com onClick
- [x] Todos os botões em SuppliesEntriesPage com onClick
- [x] Todos os botões em SuppliesExitsPage com onClick
- [x] Todos os botões em MachineryFuelingPage com onClick
- [x] Todos os botões em MachineryMaintenancePage com onClick
- [x] Todos os botões em MachineryListPage com onClick
- [x] Todos os botões em ReproductionProtocolsPage com onClick
- [x] Todos os botões em ReproductionSemenPage com onClick
- [x] Todos os botões em ReproductionEmbryosPage com onClick
- [x] Todos os botões em NutritionDietsPage com onClick
- [x] Todos os botões em NutritionTroughsPage com onClick
- [x] Todos os botões em FinancialMovementsPage com onClick
- [x] Todos os botões em FinancialCategoriesPage com onClick
- [x] Todos os botões em FinancialPeoplePage com onClick
- [x] Todos os botões em SimulationsPage com onClick
- [x] Todos os botões em SimulationsFeedlotPage com onClick
- [x] Todos os botões em SimulationsSemiFeedlotPage com onClick
- [x] Todos os botões em AdminOverviewPage com onClick
- [x] Todos os botões em ImprovementsPage com onClick

## Infraestrutura
- [x] bcryptjs instalado e funcionando
- [x] Erros de schema corrigidos (categoriasFinanceiras removido)
- [x] vitest.config.ts criado para testes no servidor
- [x] Testes unitários para compras e vendas (5 testes passando)
- [x] TypeScript sem erros (0 erros)
- [x] Servidor rodando sem erros

## Bug Fixes
- [x] Corrigir: dropdowns Tipo/Fazenda/Marca não carregam valor salvo ao editar maquinário (substituir FormSelect Radix por FormNativeSelect)

## Módulo de Manutenção (Máquinas)
- [x] Expandir tabela `manutencoes` (prestador, valorMaoObra, valorPecas, valorTotal, updatedAt)
- [x] Criar tabela `manutencao_pecas` (itens de peças por manutenção)
- [x] Backfill via ensureSchema.ts + aplicação no banco remoto
- [x] Router tRPC: get, list, listPecas, create, update, delete com cálculo de totais
- [x] Função `calcularTotaisManutencao` (peças + mão de obra = total geral)
- [x] Página de Registro de Manutenção (abas Peças/Prestador, totais ao vivo) no padrão FD
- [x] Página de Listagem de Manutenções (filtros, paginação, exportação) no padrão FD
- [x] Rotas: /maquinas/manutencao (lista) e /maquinas/manutencao/cadastro (form)
- [x] Testes Vitest da lógica de totais (8 testes passando)

## Melhorias Mobile (UX/Toque)
- [x] CSS global: regras touch-action, tap-highlight, scroll-behavior e min-height para inputs/selects
- [x] Topbar: botão hamburger e sino com minHeight/minWidth 44px
- [x] Sidebar: itens de menu com minHeight 48px e overlay de fechamento
- [x] ListExportButtons: botões com minHeight 44px e labels ocultos no mobile
- [x] NotificationCenter: botão sino com área de toque 44x44px
- [x] ManutencaoListPage: botão Nova Manutenção 48px, filtros full-width, ações 40x40px, paginação 40x40px
- [x] ManutencaoFormPage: abas 52px, botão Adicionar 48px, remover peça 40x40px, salvar/cancelar full-width 48px
- [x] MaquinasListPage: botão Cadastrar 48px, busca full-width, ações 40x40px, paginação 40x40px
- [x] AbastecimentoListPage: botão Novo 48px, filtros full-width, ações 40x40px, paginação 40x40px
- [x] AbastecimentoFormPage: botões salvar/cancelar full-width 48px com ícones
- [x] MaquinaRegistrationPage: botões salvar/cancelar full-width 48px com ícones
- [x] Botão Filtros accordion: minHeight 52px com ícone "tune" em todas as listas

## Polimento Mobile Completo (versão profissional)
- [x] Auditoria mobile real (iPhone 390px) página por página
- [x] Bottom navigation bar com módulos principais
- [x] Tabelas viram cards no mobile (13 listagens: Maquinário, Manutenção, Abastecimento, Animais, Financeiro, Estoque, Reprodução, Saúde, Benfeitorias, Fazendas, Compras, Vendas, Mapa do Rebanho)
- [x] Dashboard: cards de resumo em grade 2 colunas, filtros de período e central de alertas otimizados para mobile
- [x] Formulários: campos, abas, botões e teclado otimizados (Manutenção/Abastecimento/Máquina/Animal)
- [x] Componente MobileCard reutilizável criado
- [x] Header mobile (Topbar) com z-index e área de toque corrigidos
- [x] Teste final em viewport iPhone (390px) — nenhuma tabela espremida, 71 testes passando
