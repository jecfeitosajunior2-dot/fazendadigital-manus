# Validação de brinco único entre animais ativos

**Data:** 04/07/2026  
**Commit:** `60530bc`  
**Branch:** `main`  
**Repositório:** fazendadigital-manus

---

## 1. Regra de negócio

### Regra principal
**Dois animais ativos não podem ter o mesmo número de brinco.**

### Regras complementares
- Pode **reutilizar** um brinco que já foi usado por animal **vendido, morto ou transferido**.
- Para usar um brinco que **já está em outro animal ativo**, é preciso **primeiro**:
  1. alterar o brinco do animal de origem, **ou**
  2. inativar esse animal (vendido / morto / transferido).
- Comparação **case-insensitive** (`12` = `12`, `ABC` = `abc`).

### Cenários

| Situação | Resultado |
|----------|-----------|
| Dois animais ativos com o mesmo brinco | **Bloqueado** |
| Novo ativo com brinco de animal vendido/morto/transferido | **Permitido** |
| Trocar brinco para número de outro ativo sem liberar antes | **Bloqueado** |
| Reativar animal com brinco já usado por outro ativo | **Bloqueado** |
| Importação: 2 linhas ativas com mesmo brinco | **Bloqueado** |
| Importação: linha vendida + linha ativa, mesmo brinco | **Permitido** |

---

## 2. Mensagem de erro

### Texto exibido ao usuário
```
O brinco "12" já está sendo usado por outro animal ativo. Para usar esse número, altere o brinco do animal atual ou inative o registro anterior.
```
*(O `"12"` é substituído pelo brinco digitado.)*

### Mensagens na importação

| Situação | Mensagem |
|----------|----------|
| Duplicata na planilha (ativos) | `Brinco "X" duplicado entre animais ativos na planilha` |
| Duplicata no banco (ativo) | Mesma mensagem principal acima |
| Brinco vazio | `Brinco é obrigatório` |

### Toasts no frontend (prefixos existentes)
- Cadastro: `Erro ao cadastrar animal: [mensagem]`
- Edição: `Erro ao atualizar animal: [mensagem]`
- Troca de brinco: `Erro: [mensagem]`

---

## 3. Implementação

### Arquivos novos

| Arquivo | Função |
|---------|--------|
| `shared/brincoAtivo.ts` | Lógica central da regra e mensagens |
| `server/brincoAtivoValidation.ts` | Validação no MySQL e modo local |
| `server/brincoAtivo.test.ts` | Testes unitários da regra |

### Onde a validação é aplicada

| Endpoint / fluxo | Validação |
|------------------|-----------|
| `animais.create` | Antes do insert |
| `animais.update` | Brinco e status efetivos; exclui o próprio animal |
| `animais.validarImportacao` | Só brincos de animais ativos |
| `animais.importar` | Linha a linha antes do insert |
| Modo local (MySQL offline) | `assertBrincoUnicoEntreAtivos(..., useLocal=true)` |

### Funções principais

**`shared/brincoAtivo.ts`**
- `normalizeBrincoKey()` — trim + lowercase
- `resolveEffectiveStatus()` — status efetivo (default `ativo`)
- `findActiveBrincoConflict()` — conflito em memória
- `buildBrincoAtivoConflitoMessage()` — mensagem ao usuário
- `validarBrincoAtivoImportacao()` — validação de planilha

**`server/brincoAtivoValidation.ts`**
- `findActiveBrincoConflictInDb()` / `findActiveBrincoConflictLocal()`
- `assertBrincoUnicoEntreAtivosDb()` / `assertBrincoUnicoEntreAtivosLocal()`
- `loadActiveBrincoKeysFromDb()` / `loadActiveBrincoKeysLocal()`

### O que não foi alterado
- Schema / migrations do banco
- Constraint única no MySQL
- Modal "Troca de Brinco Detectada"
- Histórico de troca de brinco (lógica mantida)
- Validação em tempo real enquanto digita (só ao salvar)

---

## 4. Registro de testes

### Execução de referência

| Campo | Valor |
|-------|--------|
| **Data** | 04/07/2026 |
| **Runner** | Vitest v3.2.4 |
| **Comando** | `npx vitest run server/brincoAtivo.test.ts server/animais.importacao.test.ts` |
| **Resultado** | **65 passed / 65 total** |
| **Falhas** | 0 |

### Arquivos de teste

| Arquivo | Testes | Foco |
|---------|--------|------|
| `server/brincoAtivo.test.ts` | 7 | Regra de brinco único entre ativos |
| `server/animais.importacao.test.ts` | 58 | Importação, datas, cabeçalhos PT-BR |

---

## 5. Testes unitários — brinco (`server/brincoAtivo.test.ts`)

| # | Teste | Entrada / cenário | Esperado |
|---|-------|-------------------|----------|
| 1 | normaliza brinco ignorando maiúsculas e espaços | `"  ABC-123 "` | `"abc-123"` |
| 2 | bloqueia dois animais ativos com o mesmo brinco | #1 ativo brinco 100; busca 100 excluindo #1 | sem conflito; busca sem exclusão → conflito id=1 |
| 3 | permite reutilizar brinco de animal inativo | #5 vendido brinco 100; novo ativo 100 | sem conflito |
| 4 | não valida unicidade quando o animal ficará inativo | #1 ativo brinco 100; status efetivo vendido | sem conflito |
| 5 | valida importação apenas entre linhas ativas | vendido 300 OK; ativo 400 OK; ativo 400 de novo | erro "duplicado entre animais ativos" |
| 6 | monta mensagem clara orientando como resolver o conflito | brinco `"12"` | texto exato da mensagem de erro |
| 7 | resolve status efetivo com fallback ativo | `(undefined, "vendido")` → vendido; `("", undefined)` → ativo | conforme regra |

---

## 6. Testes de importação — brinco (`server/animais.importacao.test.ts`)

| # | Teste | Resultado esperado |
|---|-------|-------------------|
| 1 | aceita linha com brinco e sexo válidos | 1 válido, 0 erros |
| 2 | rejeita linha sem brinco | erro campo `brinco` |
| 3 | rejeita brinco duplicado entre animais ativos na planilha | msg "duplicado entre animais ativos" |
| 4 | permite brinco duplicado na planilha quando um animal é inativo | 2 válidos, 0 erros |
| 5 | rejeita brinco já usado por animal ativo no banco | msg "já está sendo usado por outro animal ativo" |
| 6 | permite brinco de animal inativo no banco para novo animal ativo | 1 válido, 0 erros |
| 7 | valida 100 animais: 95 válidos e 5 com erro de brinco duplicado | 95 válidos, 5 erros campo brinco |

---

## 7. Demais testes de importação (50 testes — pré-existentes)

Suites incluídas em `server/animais.importacao.test.ts`:
- Validação geral (sexo, raça, status, lote, categoria, datas)
- `parseDateBR` — conversão de formatos de data (10 testes)
- `normalizarCabecalho` — limpeza de rótulos (3 testes)
- `normalizarLinha` — cabeçalhos PT-BR (5 testes)
- `normalizarSexo / normalizarStatus / normalizarBooleano` (3 testes)
- `COLUNAS_IMPORTACAO` — estrutura da planilha (3 testes)
- `isLinhaExemplo` — linha de demonstração (4 testes)
- Fluxo de importação — linha de exemplo ignorada (3 testes)

**Todos passando na execução de 04/07/2026.**

---

## 8. Cobertura vs. lacunas

### Coberto por testes automatizados
- Lógica pura em `shared/brincoAtivo.ts`
- Validação de importação (espelho em `validarLinhas()`)
- Datas, cabeçalhos PT-BR, linha exemplo

### Não coberto (validação manual recomendada)
- API tRPC com MySQL real (`create` / `update`)
- Modo local com JSON
- Frontend (toast, modal de troca)
- Testes E2E end-to-end

### Checklist manual

| # | Cenário | Esperado |
|---|---------|----------|
| M1 | Cadastrar ativo com brinco novo | Salva |
| M2 | Cadastrar segundo ativo, mesmo brinco | Bloqueia + mensagem |
| M3 | Inativar primeiro, cadastrar segundo com mesmo brinco | Salva |
| M4 | Editar brinco para número de outro ativo | Bloqueia |
| M5 | Liberar brinco do origem, tentar de novo | Salva |
| M6 | Troca de brinco (modal) para número em uso | Bloqueia |
| M7 | Importar 2 linhas ativas, mesmo brinco | Erro na validação |
| M8 | Importar vendido + ativo, mesmo brinco | Aceita |

---

## 9. Como rodar os testes

```powershell
cd "c:\Users\Pedro Neto\Documents\Fazenda Digital"

# Testes de brinco + importação
npx vitest run server/brincoAtivo.test.ts server/animais.importacao.test.ts

# Com detalhe
npx vitest run server/brincoAtivo.test.ts server/animais.importacao.test.ts --reporter=verbose
```

---

## 10. Git

```
Commit:  60530bc
Autor:   Pedro Neto <pedro@example.com>
Data:    04/07/2026 18:07 (-0300)
Mensagem:
  Impede brinco duplicado entre animais ativos e melhora a orientação ao usuário.

Arquivos: 11 | +1111 | -552 linhas
Push: origin/main (84cb83a → 60530bc)
```

---

## 11. Cronologia da sessão

1. Definição da regra de brinco único entre ativos
2. Diagnóstico: validação inexistente no cadastro/edição; importação bloqueava todos os brincos
3. Implementação completa (backend + importação + modo local)
4. Ajuste da mensagem de erro para linguagem operacional
5. Commit e push na `main`
6. Documentação e registro de testes (este arquivo)
