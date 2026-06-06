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

## Pull-to-Refresh Mobile
- [x] Criar hook/componente PullToRefresh reutilizável (gesto de puxar para baixo) — usePullToRefresh hook + PullToRefreshIndicator componente
- [x] Aplicar em MaquinasListPage (prototipado) — refetch automático ao puxar para baixo
- [x] Aplicar em ManutencaoListPage — refetch automático ao puxar para baixo
- [x] Aplicar em AbastecimentoListPage — refetch automático ao puxar para baixo
- [x] Aplicar em FinancialManagementPage — refetch automático ao puxar para baixo
- [x] Aplicar em InsumosVisaoGeralPage (Estoque) — refetch automático ao puxar para baixo
- [x] Aplicar em CattleDetailPageExpanded (Animais) — refetch automático ao puxar para baixo
- [x] Pull-to-Refresh Mobile implementado em 5 listas principais + 1 página de detalhe (Máquinas, Manutenção, Abastecimento, Financeiro, Estoque, CattleDetail)
- [x] Teste Vitest para hook usePullToRefresh (validar callback e threshold) — 11 testes passando
- [x] Indicador visual de carregamento durante o refetch — componente com seta rotativa, barra de progresso e mensagem

## Categorias de Estoque
- [x] Adicionar procedure listByCategories ao estoqueRouter para buscar itens por categoria
- [x] Adicionar coluna estoqueId à tabela manutencao_pecas para rastreabilidade
- [x] Implementar autocomplete de peças no formulário de manutenção com busca em tempo real
- [x] Auto-preenchimento de preço unitário ao selecionar peça do estoque
- [x] Teste Vitest para procedure listByCategories (4 testes passando)
- [x] Integrar categorias no formulário de produtos (Farmácia, Nutricionais, Combustíveis, Lubrificantes, Ferramentas, Peças, Agrícolas, Epis, Outros Insumos) — categorias já presentes em CATEGORIAS_PRODUTO
- [x] Implementar controle visível de filtro por categoria no formulário de manutenção (select/chips) para refetch dinâmico
- [x] Teste Vitest para filtro de categoria na manutenção — valida query com múltiplas categorias e refetch (5 testes passando)

## Subcategorias de Estoque (cascata)
- [x] Mapear todas as subcategorias por categoria em SUBCATEGORIAS (9 categorias) — listas completas conforme fornecido
- [x] Campo subcategoria no schema (drizzle) já existente (varchar 80)
- [x] Procedure de criar/editar produto já aceita subcategoria (estoqueInputFields)
- [x] Formulário de cadastro com dropdown em cascata (categoria -> subcategoria) já implementado
- [x] Corrigir fallback SUBCATEGORIAS.Outros (chave inexistente) para array vazio seguro
- [x] Teste Vitest validando mapeamento de subcategorias por categoria — 10 testes passando (101 total)


## Leitura de Odômetro/Horímetro no Abastecimento
- [x] Campo de horímetro já existe no schema e procedure
- [x] Validação de leitura crescente (não permitir valores menores que anterior)
- [x] Exibição de última leitura com feedback visual
- [x] Indicador de erro quando leitura é inválida (border vermelha + aviso)
- [x] Cálculo de consumo médio (L/hora) com base no histórico
- [x] Testes Vitest para validação de horímetro (8 testes passando — 109 total)

## Bug Fixes Críticos
- [x] BUG CRÍTICO: `insert into manutencao_pecas` falha com `manutencaoId = NaN` — corrigido: todas as 16 ocorrências de `(result as any).insertId` em routers.ts e 1 em oauth.ts atualizadas para `(result as any)[0]?.insertId` (TiDB Cloud retorna array, não objeto direto)

## Correções solicitadas (2026-06-04)
- [x] Adicionar diálogo de confirmação "Tem certeza?" antes de excluir itens — componente ConfirmDialog/useConfirm aplicado na lista de manutenção (desktop+mobile) e na remoção de peça no formulário
- [x] Validar quantidade de peça/insumo contra saldo em estoque — frontend bloqueia qtd > disponível com toast; backend valida em manutencoes.create/update via validarSaldoEstoquePecas (TRPCError); saldo exibido no autocomplete e abaixo do campo Qtd
- [x] Teste Vitest para validarSaldoEstoquePecas (3 casos) — 119 testes passando, 0 erros TypeScript/LSP

## Reformulação Cadastro de Animal (2026-06-05)
- [x] Adicionar 16 novos campos à tabela animais (pelagem, marca, dataDesmama, castrado, dataEntrada, pesoEntrada, produtorOrigem, precoKg, frete, sisbov, dataRnd, rgn, rgd, rastreadoNascimento, pai, mae) via ALTER TABLE
- [x] Atualizar schema.ts e router animais.create/update com os novos campos
- [x] Reconstruir NewAnimalPage em 6 cards (Identificação Principal, Dados Zootécnicos, Entrada/Aquisição, Rastreabilidade, Genealogia, Observações) no padrão Fazenda Digital
- [x] Categoria dinâmica conforme sexo (Macho/Fêmea)
- [x] Validação de obrigatórios (Brinco, Sexo) com destaque visual turquesa
- [x] Botões Cancelar / Salvar e Novo / Salvar
- [x] Teste funcional end-to-end validado no preview (cadastro persistido na lista) e 119 testes Vitest passando

## Criar lote no formulário de animal (2026-06-05)
- [x] Adicionar opção "+ Criar novo lote…" no select de Lote do cadastro de animal
- [x] Diálogo de criação rápida (nome obrigatório + descrição opcional) que cria via lotes.create
- [x] Após criar, recarregar lista de lotes e selecionar o novo lote automaticamente
- [x] Teste Vitest lotes.create.test.ts (6 casos) — 125 testes passando, 0 erros TS/LSP
- [x] Validado no navegador: toast de sucesso, diálogo fecha, lote selecionado

## Unificação AnimalFormPage (2026-06-05)
- [x] Brinco Eletrônico / RFID card adicionado ao formulário de animal (campo brincoEletronico)
- [x] Unificar NewAnimalPage e EditAnimalPage em um único componente AnimalFormPage
- [x] Detectar modo create/edit pelo parâmetro ?id= na URL
- [x] Carregar dados do animal via animais.getById em modo edição
- [x] Pré-preencher todos os 25+ campos no modo edição
- [x] Botão "Salvar Alterações" em modo edição, "Cadastrar Animal" + "Salvar e Novo" em modo criação
- [x] Campo Status visível em ambos os modos
- [x] Atualizar App.tsx para importar EditAnimalPage de NewAnimalPage.tsx (não de EditAnimalPage.tsx)
- [x] 125 testes Vitest passando, 0 erros TypeScript/LSP

## Importação em Massa de Animais (2026-06-05)
- [x] Instalar xlsx (SheetJS) para parse de XLSX/XLS/CSV no backend
- [x] Criar procedure animais.gerarModeloPlanilha (retorna base64 do XLSX modelo)
- [x] Criar procedure animais.validarImportacao (valida linhas, retorna erros por linha)
- [x] Criar procedure animais.importar (cria animais válidos reutilizando lógica de create)
- [x] Criar componente ImportarAnimaisModal.tsx com 3 etapas: upload → pré-validação → resultado
- [x] Adicionar botão "Importar" na AnimaisPage ao lado de Exportar Planilha / PDF / Novo Animal
- [x] Testes Vitest para validação de importação (campos obrigatórios, duplicados, datas inválidas) — 16 testes, 141 total

## Planilha modelo oficial (base do usuário) — 25 colunas PT-BR (2026-06-05)
- [x] Criar shared/importacaoAnimais.ts com 25 colunas oficiais + mapeamento de cabeçalhos PT-BR
- [x] Recriar gerarModeloPlanilha: cabeçalhos na linha 1, abas Instruções/Dicionário/Exemplos, sem fórmulas externas (corrige erro de abertura)
- [x] Normalizar cabeçalhos PT-BR → chaves internas em validarImportacao e importar
- [x] Normalizar valores: Fêmea→femea, Ativo→ativo, Sim/Não→boolean
- [x] parseData multi-formato (DD/MM/AAAA, DD/MM/AA, AAAA-MM-DD) no importar
- [x] Atualizar texto do modal frontend
- [x] Testes Vitest do helper de normalização — 174 testes passando

## Correção importação — linha exemplo e lote dinâmico (2026-06-05)
- [x] gerarModeloPlanilha: remover linha exemplo da aba Animais (mover para aba Exemplos separada)
- [x] gerarModeloPlanilha: receber userId, buscar lotes reais do banco e gerar dropdown dinâmico na coluna Lote
- [x] validarImportacao: aceitar nome do lote (string) e resolver para loteId interno
- [x] importar: usar loteId resolvido pelo nome em vez de exigir ID numérico
- [x] Testes: cobrir cenário de lote por nome e linha exemplo ignorada

## Correção estrutural — ignorar linha de exemplo (defesa robusta) (2026-06-05)
- [x] Detecção estrutural de linha-exemplo por valores-marcador (brinco BR-001) no helper compartilhado (isLinhaExemplo)
- [x] Filtrar linha de exemplo no parser frontend (ImportarAnimaisModal)
- [x] Filtrar linha de exemplo no backend (validarImportacao e importar) como defesa redundante
- [x] Testes: planilha cabeçalho + exemplo + 2 animais válidos → total 2, válidos 2, erros 0 — 181 testes passando

## Exclusão segura de lotes (2026-06-05)
- [x] Backend: procedure lotes.excluir — contar animais vinculados, bloquear se > 0, excluir se = 0
- [x] Backend: testes Vitest — lote sem animais (OK), lote com 1 animal (bloqueado), lote com vários (bloqueado), tentativa via API (bloqueada)
- [x] Frontend: botão excluir na lista de Lotes com ícone de lixeira
- [x] Frontend: modal de confirmação com nome do lote
- [x] Frontend: modal de bloqueio com nome do lote e contagem de animais vinculados

## Mapeamento dinâmico Tipo → Marcas (2026-06-06)
- [x] Adicionar MARCAS_POR_TIPO em shared/maquina-types.ts (6 categorias: Aeronaves, Máquinas, Implementos, Veículos, Equipamentos com Motor, Outros)
- [x] Exportar getMarcasPorTipo e isMarcaValidaParaTipo de shared/maquina-types.ts
- [x] Re-exportar getMarcasPorTipo, isMarcaValidaParaTipo e MARCAS_POR_TIPO em client/src/lib/maquina-types.ts
- [x] Formulário de cadastro/edição: campo Marca carrega marcas exclusivas do tipo selecionado via datalist
- [x] Formulário: ao trocar o tipo, limpa a marca se não for válida para o novo tipo
- [x] Formulário: placeholder do campo Marca indica o tipo selecionado
- [x] Backend validarImportacao: valida combinação Tipo+Marca — erro descritivo "Marca X não é válida para o tipo Y"
