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
