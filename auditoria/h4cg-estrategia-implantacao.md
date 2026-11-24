# H4-CG — Estratégia de implantação

Planejamento de 23 de novembro de 2026. Nada foi implantado. O banco da fazenda não foi alterado, nenhum banco novo foi criado e nenhum serviço foi reiniciado.

A recomendação é a **alternativa B: criar um banco novo para a operação real e deixar o banco atual intocado, como arquivo dos dados de teste.**

## O que já está provado

A H4-CF aplicou as nove migrações numa cópia fiel e depois apagou essa cópia. O original continua com 60 tabelas. Faltam nele `reproducao_operacoes` e `semen_entrada_operacoes`. A 0060 já está compatível. A 0070 continua rejeitada. A 0077 continua opcional.

Os registros lidos nessa cópia são de teste: 37 animais, 50 pesagens, 4 compras, 7 vendas, 11 títulos, estoque, máquinas, 6 manutenções, 9 abastecimentos (5 sem fazenda), 76 registros de reprodução e 1 partida de sêmen. Esse histórico não é o começo da fazenda real.

## 1. As duas alternativas

### A — Migrar o banco que já existe

As nove migrações já passaram na cópia. Dá para preservar os registros, fazer backup antes e restaurar o arquivo se a aplicação falhar. O aplicativo novo fica compatível com esse banco depois das nove, desde que a conferência de arranque também aceite o restante das colunas. Isso ainda não foi medido no original.

O custo comercial é carregar o teste para dentro da operação. A limpeza futura desses dados seria outra autorização, em cima do banco que já estaria valendo. Os cinco abastecimentos sem fazenda continuariam lá. Relatório, estoque e reprodução misturariam ensaio e vida real.

### B — Criar um banco novo para a produção

O banco `fazenda_digital` permanece inteiro, no container atual, como arquivo. A operação real começa vazia, com um titular e uma fazenda criados de propósito.

O esquema definitivo não é só o arquivo `drizzle/schema.ts`. Esse modelo já traz a 0060, as tabelas da 0067 e da 0068 e o índice da 0069. Ele não traz a coluna gerada do brinco, a tabela de chave do estoque, as chaves de nutrição e de cocho, a fazenda histórica da manutenção nem a chave do abastecimento. Essas peças são as propostas 0071 a 0076. A 0070 não entra. A 0077 não entra no mínimo.

O caminho B ainda não foi ensaiado nessa combinação: banco vazio, modelo Drizzle e, em seguida, só as propostas que o modelo não possui. A H4-CF ensaiou as nove em cima da forma antiga do banco, não em cima de um banco nascido do modelo.

## 2. Riscos

| Critério | A — migrar o atual | B — banco novo |
| --- | --- | --- |
| Segurança dos dados | O teste vira base da operação. Limpar depois mexe no que já estiver valendo. | O teste fica guardado. A operação nasce sem lançamento antigo. |
| Complexidade | Nove arquivos já ensaiados na cópia fiel. | Um ensaio novo: modelo mais 0071–0076, sem repetir a 0060 e sem aplicar a 0070. |
| Tempo | Menor na hora da troca. | Maior na preparação. A troca em si é apontar o aplicativo para o banco novo. |
| Risco de migração | Baixo na estrutura, alto no significado dos números. | A estrutura ainda precisa de um ensaio no vazio. Não há dado antigo para quebrar. |
| Recuperação | Restaurar o backup por cima do banco já migrado. | Voltar a conexão para o banco antigo. Ele não terá sido modificado. |
| Dependência do aplicativo | O código novo recusa estoque, nutrição, brinco e manutenção se a estrutura das propostas não existir. O verificador de arranque não conhece essas propostas: ele só olha o modelo. | A mesma dependência. O banco novo precisa das duas camadas, modelo e propostas. |
| Esforço | Backup, nove migrações, contagem de duplicidade na hora, subir o código novo. | Ensaio do vazio, criar banco, primeiro titular, fazenda real, apontar a conexão, subir o código novo. |
| Começar vazio | Não. Os lançamentos de teste continuam. | Sim. É o que se quer para iniciar a operação real. |

## 3. O que o código isolado exige

Conferido só nos arquivos da branch `feat/h4-rebanho-sanidade-estoque`, commit `d511b8b`. O servidor da porta 3000 não foi iniciado nem modificado. O worktree oficial continua em `1f2dfe9`, na branch `cursor/at05-web-serial-poc`. Não foi lido o processo que está no ar, então a versão que responde hoje na porta 3000 não foi identificada.

- A conexão é `DATABASE_URL`. Em produção, sem essa variável, o arranque para. O arranque chama `verifyDatabaseSchema` e não chama `ensureSchema`. Ele não altera o banco.
- O verificador exige tabelas, colunas, índices e chaves do modelo. Coluna extra não o reprova. Coluna obrigatória ausente reprova. Ele não exige as propostas 0071–0076.
- O código de estoque, nutrição, leitura de cocho, brinco e manutenção consulta o banco na hora. Se a chave ou a fazenda da ordem de serviço não existir, a operação é recusada e nada é gravado.
- A manutenção nova grava `manutencoes.fazendaId` por SQL. Sem a 0075, essa gravação quebra mesmo que o verificador de arranque tenha passado.
- Sessão: cookie e procedimento protegido. Sem usuário na sessão, a rota privada responde não autorizado. Administrador exige papel principal.
- Variáveis de verdade para subir: `DATABASE_URL` e `JWT_SECRET`. O código tem um segredo de desenvolvimento se `JWT_SECRET` vier vazio. Produção não pode usar esse fallback. OAuth e a API Forge ficam desligados quando as URLs estão vazias. Não há, neste plano, chamada nova a serviço externo.
- `db:push`, `db:ensure-schema` e o journal do Drizzle não são o caminho. O journal ainda tem só `0000_omniscient_jigsaw`. Apontar o push para o banco da fazenda alteraria a estrutura sem o livro das nove.

## 4. Bloqueios que podem acompanhar o começo

A operação inicial pode começar com estas limitações. Elas já são o comportamento do código e não serão implementadas nesta fase.

- Venda por arroba calcula na tela e não grava. A confirmação recusa essa forma antes de gravar venda, baixa ou título.
- O estorno do recebimento de compras continua bloqueado, com a mensagem já existente na tela.
- Exclusões físicas continuam bloqueadas para animal, pesagem, estoque, lote, histórico de movimentação e benfeitoria. O histórico fica para consulta.
- A 0077 fica adiada. Sem ela, editar manutenção ou abastecimento pode fazer o reenvio do pedido original não reconhecer a primeira gravação. Isso não abre um segundo consumo.

O censo de rotas não foi reaberto. Continuam os números já fechados: 252 rotas, 223 homologadas, 25 bloqueadas e 4 não aplicáveis.

## 5. Plano, sem executar

### Estratégia

Banco novo, vazio, para a operação real. O banco atual permanece como arquivo dos testes.

### Justificativa

Os números atuais são ensaio. Migrá-los obrigaria uma limpeza depois, no banco que a fazenda já estaria usando. Começar vazio evita essa mistura. A recuperação é voltar a conexão, porque o arquivo não terá sido migrado.

### Estrutura necessária

1. MySQL 8.4, banco com nome diferente de `fazenda_digital`, sem reaproveitar o volume de dados como se fosse outro servidor misturado.
2. Esquema do modelo Drizzle, que já inclui 0060, 0067, 0068 e 0069.
3. Propostas 0071, 0072, 0073, 0074, 0075 e 0076, aplicadas pelo executor que recusa a porta 3306 e o banco `fazenda_digital`.
4. Sem 0070. Sem 0077, até decisão própria.
5. Um titular principal e a fazenda real, criados na hora. Não copiar usuários, animais nem lançamentos de teste.

### Backup

Imediatamente antes de qualquer criação no servidor da fazenda, mesmo sem migrar o banco antigo: cópia consistente de `fazenda_digital`, arquivo fora do Git, com conferência de tamanho e hash. A conta de leitura pode repetir o método da H4-CF. A credencial guardada no Windows não entra no relatório.

### Restauração

Se o banco novo falhar antes da troca de conexão, ele é descartado e o aplicativo continua no banco antigo. Se a troca já tiver ocorrido e a operação real ainda não tiver lançamento que se queira manter, a conexão volta para `fazenda_digital`. Não se restaura o arquivo de teste por cima de lançamento real já aceito. Estrutura não se desfaz com `ROLLBACK`.

### Testes integrados

Num MySQL descartável, antes de existir banco novo na fazenda:

1. Criar o vazio com o modelo, sem apontar ferramenta nenhuma para a porta 3306.
2. Aplicar 0071–0076 e conferir que 0060, 0067, 0068 e 0069 já nasceram do modelo, sem serem reaplicadas à força.
3. Rodar o verificador de arranque nesse banco.
4. Gravar, e desfazer, um fluxo curto de animal, brinco, estoque, nutrição, manutenção e abastecimento.
5. Confirmar que arroba, estorno de recebimento e exclusão física continuam recusados.

### Aprovação

- O ensaio do vazio passou.
- O verificador de arranque aceitou o esquema.
- Os fluxos curtos gravaram e a recusa de duplicidade funcionou.
- O banco antigo segue com 60 tabelas e os mesmos agregados da última fotografia.
- Há backup conferido, feito na hora.
- O primeiro usuário é o titular real, não um usuário de teste.

### Interrupção

Parar, sem continuar no passo seguinte, se:

- o modelo e as propostas discordarem;
- aparecer duplicidade ao criar índice;
- o verificador de arranque recusar o banco;
- a ferramenta tentar usar a porta 3306 ou o nome `fazenda_digital` para escrever;
- o backup não conferir;
- alguém pedir para copiar animal, compra, venda ou estoque de teste.

### Mudança para produção

Só depois do ensaio do vazio e de uma autorização que diga, com todas as letras, que o banco novo pode ser criado e que o aplicativo pode passar a usá-lo. A troca é mudar `DATABASE_URL` e `JWT_SECRET` para valores de produção e subir o código desta branch. Isso reinicia o servidor. Não faz parte desta H4-CG. O banco antigo não é apagado nessa troca.

### Autorizações que ainda faltam

1. Ensaiar o esquema vazio num MySQL descartável.
2. Criar o banco novo no servidor da fazenda, sem alterar `fazenda_digital`.
3. Criar o titular e a fazenda reais.
4. Trocar a conexão do aplicativo e reiniciar o servidor.
5. Decidir, em separado, se a 0077 entra algum dia.

Não está autorizado, e não foi feito: migrar o original, limpar teste, apagar o banco antigo, fazer push, merge ou implantar.

## Evidências que ainda faltam para executar a B

- O ensaio do banco vazio, modelo mais 0071–0076, com o verificador de arranque.
- A confirmação de que 0067, 0068 e 0069 não serão aplicados duas vezes quando o modelo já as tiver criado.
- O backup feito na hora da criação, não o arquivo já apagado da H4-CF.
- A identidade do processo que hoje escuta a porta 3000. Ela não foi lida nesta fase.
- A autorização explícita de criar o banco, o titular e de reiniciar o aplicativo.
