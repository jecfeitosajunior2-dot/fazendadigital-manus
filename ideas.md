# Direção de Design — AgroGestor Pro (Prévia)

## Filosofia escolhida: "Editorial Agrarian"
Estética inspirada em revistas técnicas de agronegócio impressas em papel pesado: tipografia editorial com serifa display, paleta terrosa contemporânea (verde-musgo, palha, terracota), camadas com textura sutil de papel kraft e fotografias de campo tratadas em duotone para reforçar identidade.

### Princípios
- Layout assimétrico com sidebar fixa escura e área de trabalho clara, separados por linha contínua tipo "régua editorial".
- Hierarquia tipográfica forte: serifa display (Fraunces) para títulos, sans humanista (Inter Tight) para dados, mono (JetBrains Mono) para métricas.
- Microtextura: ruído sutil + gradientes ocre apenas em superfícies de destaque (KPIs e hero).
- Dados como protagonistas: tabelas densas com alinhamento numérico, gráficos com paleta restrita.

### Paleta
- `--bark` (#1B2316) — sidebar e tipografia profunda
- `--moss` (#3F6B3A) — primária/ações
- `--harvest` (#C9A24A) — destaque/realces
- `--clay` (#B14A2D) — alertas/destaques de risco
- `--paper` (#F5F1E8) — fundo principal
- `--linen` (#E9E1CE) — superfícies elevadas

### Layout
Sidebar 260px fixa escura com módulos agrupados (Painel, Rebanho, Reprodução, Nutrição, Manejo, Insumos, Maquinário, Compra & Venda, Financeiro, Relatórios, Simulações). Topbar slim com seletor de fazenda, busca e perfil. Conteúdo em grid de 12 colunas com cards "editoriais" (KPI, gráfico, tabela densa).

### Animação
- Transições 180–220ms ease-out customizada.
- Hover em cards: leve translateY(-2px) + sombra ocre.
- Entrada da página: stagger de 40ms nos cards principais.
- Feedback de botão: scale(0.97) ao pressionar.

### Tipografia
- Display: **Fraunces** 600/700 (variável, opsz alto)
- UI: **Inter Tight** 400/500/600
- Mono: **JetBrains Mono** 500

### Elementos assinatura
1. "Régua editorial" vertical separando sidebar e conteúdo.
2. KPI cards com numeral em mono grande, rótulo em caixa-alta micro-tipografada e mini-sparkline ocre.
3. Cabeçalhos de seção com kicker em caixa-alta e linha curta abaixo.
