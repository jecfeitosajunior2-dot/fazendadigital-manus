# Ficha individual do animal — Sanitário e Reprodução — sessão 07/07/2026

**Data:** 07/07/2026  
**Commit:** `beb3a6d`  
**Branch:** `main`  
**Repositório:** [fazendadigital-manus](https://github.com/jecfeitosajunior2-dot/fazendadigital-manus)

---

## Links rápidos

| Recurso | URL |
|---------|-----|
| **Commit do dia** | [beb3a6d](https://github.com/jecfeitosajunior2-dot/fazendadigital-manus/commit/beb3a6d) |
| Página principal | `client/src/pages/CattleDetailPageExpanded.tsx` |
| Helpers de exibição | `client/src/lib/fichaAnimalDisplay.ts` |
| Carência compartilhada | `shared/carenciaAnimal.ts` |
| Reprodução compartilhada | `shared/reproRegistroMeta.ts` |
| Doc anterior (Lista de Animais — 06/07) | [2026-07-06-lista-animais-importacao.md](./2026-07-06-lista-animais-importacao.md) |

---

## 1. Resumo executivo

Nesta sessão foram entregues **três blocos de trabalho** na **ficha individual do animal** (`/rebanho/detalhes-animal?id=...`):

1. **Card principal** — visão gerencial com peso, ganho, GMD, carência e localização.
2. **Aba Sanitário** — formulário completo, histórico em tabela, carência detalhada, custos e exclusão com confirmação.
3. **Aba Reprodução** — formulário e histórico reprodutivo adaptados por sexo (fêmea/macho), com previsão de parto e fallback local.

Também foram criados **módulos compartilhados** de carência e reprodução, reutilizados no overview do rebanho.

---

## 2. Card principal do animal

### 2.1 Conteúdo

| Área | Campos / ações |
|------|----------------|
| Identificação | Brinco, status, badge **Em carência** (com data “Até DD/MM/AAAA”) |
| Localização | Fazenda, Lote, Subdivisão atual |
| Dados | Nº RFID, Sexo, Categoria, Idade, Dias na Fazenda |
| Métricas | Peso atual, Ganho, GMD |
| Ação | Botão **Editar Animal** |

### 2.2 Abas de histórico

| Aba | Função |
|-----|--------|
| Pesagens | Histórico, nova pesagem, exclusão com confirmação |
| Sanitário | Ver seção 3 |
| Reprodução | Ver seção 4 |
| Subdivisão | Histórico de pastos |
| Observações | Campo de observações do animal |

---

## 3. Aba Sanitário

### 3.1 Formulário “Novo Registro Sanitário”

| Campo | Obrigatório |
|-------|-------------|
| Tipo | Sim |
| Data | Sim |
| Produto / Medicamento | Não |
| Dose | Não |
| Carência (dias) | Não |
| Fim da carência (preview) | Calculado |
| Responsável | Não |
| Custo | Não |
| Observações | Não |

- Botão **Salvar** desabilitado sem Tipo + Data.
- Com formulário aberto: tabela, contador e total de custos ficam ocultos.

### 3.2 Histórico sanitário

**Colunas:** Data | Tipo | Produto | Dose | Carência | Custo | Ações

| Detalhe | Comportamento |
|---------|---------------|
| Carência | Duas linhas: `90 dias` / `até DD/MM/AAAA` |
| Tipo | Badges com abreviações + tooltip |
| Total | **Total em custos sanitários** abaixo da tabela |
| Exclusão | Confirmação informando impacto na carência do animal |

### 3.3 Tipos sanitários disponíveis

Vacinação, Vermifugação, Medicação, Tratamento clínico, Exame, Procedimento sanitário, Outro.

---

## 4. Aba Reprodução

### 4.1 Formulário “Novo Registro Reprodutivo”

**Campos comuns (todos os sexos):**

| Campo | Obrigatório |
|-------|-------------|
| Tipo de Registro | Sim |
| Data | Sim |
| Resultado / Status | Não |
| Responsável | Não |
| Observações | Não |

### 4.2 Adaptação por sexo

#### Fêmea

| Aspecto | Valor |
|---------|-------|
| **Tipos** | Cio, Cobertura, Inseminação, Diagnóstico de prenhez, Parto, Aborto, Desmama, Outro |
| **Campo relacionado** | Reprodutor / Sêmen |
| **Placeholder** | Ex: Touro 55, sêmen Nelore 123 |
| **Previsão de Parto** | Visível; cálculo automático (+283 dias) para Cobertura, Inseminação e Diagnóstico de prenhez |
| **Resultados** | Realizado, Positivo, Negativo, Prenha, Vazia, Inconclusivo, Repetir, Outro |

**Layout:**

```
Linha 1: Tipo de Registro* | Data*
Linha 2: Resultado / Status | Reprodutor / Sêmen
Linha 3: Previsão de Parto | Responsável
Linha 4: Observações
```

#### Macho

| Aspecto | Valor |
|---------|-------|
| **Tipos** | Cobertura realizada, Exame andrológico, Coleta de sêmen, Uso como reprodutor, Outro |
| **Campo relacionado** | Matriz / Lote atendido |
| **Placeholder** | Ex: Matriz 25, Lote Matrizes 01 |
| **Previsão de Parto** | Oculta (não salva no cadastro) |
| **Resultados** | Realizado, Apto, Inapto, Positivo, Negativo, Inconclusivo, Repetir, Outro |

**Layout:**

```
Linha 1: Tipo de Registro* | Data*
Linha 2: Resultado / Status | Matriz / Lote atendido
Linha 3: Responsável
Linha 4: Observações
```

#### Sexo indefinido

- Lista genérica de tipos e resultados.
- Campo **Relacionado** com rótulo genérico.
- Previsão de Parto visível (como fêmea).

### 4.3 Histórico reprodutivo

**Colunas:** Data | Tipo | Resultado | Relacionado | Previsão | Observações | Ações

| Detalhe | Comportamento |
|---------|---------------|
| Ordenação | Mais recente primeiro |
| Contador | “X registro(s) reprodutivo(s) · mais recente primeiro” |
| Coluna Relacionado | Touro/sêmen (fêmeas) ou matriz/lote (machos) |
| Coluna Previsão | “—” para machos |
| Estado vazio | Mensagem adaptada por sexo |
| Exclusão | “Tem certeza que deseja excluir este registro reprodutivo? Esta ação não pode ser desfeita.” |
| Formulário aberto | Oculta tabela e estado vazio |

### 4.4 Exemplos de uso

**Fêmea — Inseminação:**

| Campo | Valor |
|-------|-------|
| Tipo | Inseminação |
| Data | 07/07/2026 |
| Resultado | Realizado |
| Reprodutor / Sêmen | Sêmen Nelore 123 |
| Previsão de Parto | 16/04/2027 |
| Responsável | Paulo Gomes |
| Observações | Inseminação realizada pela manhã. |

**Macho — Cobertura realizada:**

| Campo | Valor |
|-------|-------|
| Tipo | Cobertura realizada |
| Data | 07/07/2026 |
| Resultado | Realizado |
| Matriz / Lote atendido | Lote Matrizes 01 |
| Responsável | Paulo Gomes |
| Observações | Cobertura observada no piquete. |

---

## 5. Backend e persistência

### 5.1 API (tRPC)

| Router | Endpoints | Fallback local |
|--------|-----------|----------------|
| `saude` | list, create, delete | Sim |
| `reproducao` | list, create, delete | Sim |

**Create reprodução — campos extras:**

- `reprodutorSemen` (texto livre)
- `responsavel` (texto livre)
- `dataPrevistoParto` (opcional; não enviado para machos)

**Vínculo animal no cadastro reprodutivo:**

| Sexo | femeaId | machoId |
|------|---------|---------|
| Fêmea | id do animal | — |
| Macho | id do animal | id do animal |

### 5.2 Fallback local (MySQL offline)

Arquivos em `.local-data/`:

| Arquivo | Conteúdo |
|---------|----------|
| `saude-registros.json` | Registros sanitários |
| `reproducao-registros.json` | Registros reprodutivos |

### 5.3 Metadados em observações (reprodução)

Campos **Reprodutor/Sêmen**, **Matriz/Lote atendido** e **Responsável** são empacotados em `observacoes` via metadados internos (`shared/reproRegistroMeta.ts`), **sem alteração de schema** do banco.

---

## 6. Módulos compartilhados (novos)

### 6.1 `shared/carenciaAnimal.ts`

- `buildFimCarenciaPorAnimal()` — calcula a maior data de carência válida por animal.
- Usado na ficha individual, lista de animais e **overview do rebanho**.

### 6.2 `shared/reproRegistroMeta.ts`

| Export | Função |
|--------|--------|
| `REPRO_TIPOS_FEMEA` / `REPRO_TIPOS_MACHO` / `REPRO_TIPOS_UNICO` | Opções de tipo por sexo |
| `REPRO_RESULTADOS_FEMEA` / `REPRO_RESULTADOS_MACHO` | Opções de resultado por sexo |
| `getReproTipoOptions()` | Lista de tipos conforme sexo |
| `getReproResultadoOptions()` | Lista de resultados conforme sexo |
| `getReproRelacionadoLabel()` | Rótulo do campo relacionado |
| `getReproRelacionadoPlaceholder()` | Placeholder do campo relacionado |
| `shouldShowPrevisaoPartoForm()` | Exibe previsão de parto no formulário |
| `shouldCalcPrevisaoParto()` | Habilita cálculo +283 dias |
| `calcPrevisaoParto283()` | Soma 283 dias à data do registro |
| `packReproObservacoes()` / `unpackReproObservacoes()` | Persistência de metadados |

### 6.3 `client/src/lib/fichaAnimalDisplay.ts`

Helpers de exibição para a ficha:

- Status do animal (label, badge, accent)
- Peso, ganho, GMD, idade
- Carência sanitária (linhas, preview, dias → data)
- Custos sanitários (formatação e total)
- Ordenação de pesagens

---

## 7. Arquivos alterados no commit

| Arquivo | Linhas (aprox.) | Papel |
|---------|-----------------|-------|
| `client/src/pages/CattleDetailPageExpanded.tsx` | +1186 / −323 | UI da ficha (card + abas) |
| `client/src/lib/fichaAnimalDisplay.ts` | +283 (novo) | Helpers de exibição |
| `shared/carenciaAnimal.ts` | +94 (novo) | Lógica de carência |
| `shared/reproRegistroMeta.ts` | +170 (novo) | Lógica reprodutiva |
| `server/localFallbackStore.ts` | +305 | Fallback saúde + reprodução |
| `server/routers.ts` | +184 | Routers saúde e reprodução |
| `server/routers/rebanhoOverview.ts` | +19 | Carência no overview |

**Total:** 7 arquivos, +1.918 / −323 linhas.

---

## 8. Fora de escopo (futuro)

Não implementado nesta sessão:

- Custo, fotos e documentos na reprodução
- Escore corporal
- Criação automática de bezerro no parto
- Vínculo obrigatório com outro animal cadastrado
- Protocolo reprodutivo avançado
- Alertas de previsão de parto
- Relatórios reprodutivos
- Edição de registro reprodutivo (fluxo: excluir + novo)

---

## 9. Como testar

1. Abrir **Rebanho → Lista de Animais →** clicar em um animal.
2. **Sanitário:** `+ Novo Registro` → preencher Tipo + Data → Salvar → conferir tabela e carência.
3. **Reprodução (fêmea):** registrar Inseminação → verificar previsão de parto (+283 dias) e coluna Relacionado.
4. **Reprodução (macho):** registrar Cobertura realizada → confirmar ausência de Previsão de Parto e rótulo **Matriz / Lote atendido**.
5. **Exclusão:** testar confirmação em ambas as abas.
6. **Offline (opcional):** com MySQL parado, salvar registros e verificar `.local-data/saude-registros.json` e `reproducao-registros.json`.

---

## 10. Git

```text
Commit:  beb3a6d
Mensagem: Implementa registro reprodutivo na ficha do animal e consolida melhorias da ficha individual.
Push:    main → origin/main (07/07/2026)
```
