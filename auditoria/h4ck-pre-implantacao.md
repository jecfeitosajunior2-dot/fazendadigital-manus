# H4-CK — Conferência final de pré-implantação

Parecer sobre pedir autorização para implantar. Nenhuma funcionalidade nova foi criada. Nenhuma homologação já fechada foi reaberta. O ensaio não usou a porta 3000 nem a 3306, não criou banco real e não cadastrou o titular real.

## 1. Situação das 20 falhas

A suíte larga, com o banco apontado de propósito para `127.0.0.1:9`, teve 20 falhas em 13 arquivos. Causa de cada uma:

| # | Arquivo e teste | Mensagem | Causa comprovada | Classe |
| --- | --- | --- | --- | --- |
| 1–4 | `server/estoque.listByCategories.test.ts` (4) | `ECONNREFUSED 127.0.0.1:9` | A consulta nem abriu. A suíte usou uma URL fechada para não tocar na 3306. | INFRAESTRUTURA |
| 5–9 | `server/manutencao.categoria-filter.test.ts` (5) | `ECONNREFUSED 127.0.0.1:9` | Idem. O `select` não chegou ao MySQL. | INFRAESTRUTURA |
| 10 | `server/manutencao.validarSaldoEstoque.test.ts` — bloqueia quando a quantidade excede o saldo | `ECONNREFUSED 127.0.0.1:9` no `insert` | Idem. Não houve resposta de saldo. | INFRAESTRUTURA |
| 11 | `server/importLocalDataDryRun.test.ts` — valida sentinelas 801/802 | `ENOENT` em `.local-data\fazendas.json` | O arquivo de preparação não está na cópia isolada. Não foi inventado. | INFRAESTRUTURA |
| 12–14 | Três planilhas de sêmen (`semenPartidaHistoricoExport`, `semenEstoqueExport`, `semenUtilizadoExport`) | estouro de 5 segundos | Sob a suíte paralela a planilha passou de 5 s. Sozinhas, as 49 provas desses arquivos e do menu passaram em 4,8 s. | INFRAESTRUTURA |
| 15 | `navegacaoRelatoriosRemovidos.test.ts` — demais grupos do menu | a lista tinha 13 itens e o teste esperava 12 | O item “Acessos da conta” entrou na H4-CJ. O teste foi alinhado e, nesta fase, as 4 provas passaram. | INFRAESTRUTURA |
| 16 | `server/compraDetalhe.test.ts` — não cria animal, só leitura | falta o texto `eq(compras.userId, userId)` | No commit da H4-CI o arquivo já filtrava com `eq(compras.userId, dono)`. A leitura continua sem `insert` de animal, pesagem ou movimentação. As outras provas do arquivo passaram. | NÃO DETERMINADO como defeito de produto. O texto procurado está desatualizado. Não é regressão nova. |
| 17 | `server/perfisAcesso.test.ts` — migration comentada | `routers.ts` contém `usuario_permissoes` | As três consultas já estavam no commit da H4-CI. A tabela é a da permissão homologada. | NÃO DETERMINADO como defeito de produto. Expectativa antiga. Não é regressão nova. |
| 18 | `server/rfidUnicidade.test.ts` — mesma regra no servidor e no curral | `routers.ts` não contém `escolherAnimalPorRfid` | A função existe em `shared/rfidUnicidade.ts`. As outras 7 provas do arquivo passaram. O nome não está no roteador desde antes da H4-CJ. | NÃO DETERMINADO como defeito de produto. Contrato de texto antigo. |
| 19 | `client/src/lib/compraDetalheUx.test.ts` — lista não ganha animal pela compra | os primeiros 4.000 caracteres do `list` não têm `from(animais)` | A consulta `from(animais)` continua no mesmo procedimento, depois do bloco de permissão. Não há `insert(animais)` nesse trecho. | NÃO DETERMINADO como defeito de produto. A janela do teste ficou curta. |
| 20 | `client/src/lib/contasAReceberRecebimento.test.ts` — núcleo oficial | a assinatura ganhou `sessao?` | `criarRecebimento` continua sendo o recebimento oficial. A assinatura com sessão já estava na H4-CI. | NÃO DETERMINADO como defeito de produto. Texto da assinatura antigo. |

Nenhuma dessas 20 é regressão funcional do código. Nenhuma impede a implantação do que já foi homologado. As 11 de banco e de arquivo ausente continuam vermelhas se a suíte for repetida sem MySQL descartável e sem `.local-data`. Não foram apontadas para a porta 3306.

## 2. Testes de infraestrutura recuperados

Nesta fase, sem mudar produção:

- Menu: 4 provas aprovadas.
- Três exportações de sêmen: 45 provas aprovadas, inclusive as três que tinham estourado o tempo.

Não entram de novo no total único.

## 3. Regressões funcionais encontradas

Nenhuma.

## 4. Autenticação definitiva

A tela `/entrar` entra por e-mail e senha (`auth.login`). O cookie `session` guarda a versão da sessão. Cada chamada protegida compara essa versão com o banco. Logout limpa o cookie.

OAuth e Forge continuam desligados pela constante `OAUTH_CALLBACK_HABILITADO = false`. Não são o acesso do proprietário. Para ligá-los seria preciso mudar a constante, informar servidor, portal, identificador e segredo, e cadastrar o retorno `${origem}/api/oauth/callback`. Um usuário nascido só por esse caminho entra sem papel e sem titular. Isso não foi testado e não deve ser ligado na implantação.

O login da H4-CJ usou identidade artificial no banco descartável. Ele prova o mesmo mecanismo que a instalação real usará. Não substitui o cadastro do titular real, que continua fora desta fase.

## 5. Procedimento do primeiro titular

`scripts/criar-titular-inicial.ts` só corre com `FD_CRIAR_TITULAR_INICIAL=1` e `--confirmo-banco-novo`. Recusa o nome do banco antigo, recusa banco sem nome e recusa um segundo principal. A senha vem do ambiente, vira hash e não entra na auditoria. O `titularUserId` aponta para o próprio registro.

Na H4-CJ isso rodou uma vez no banco descartável, com identidade artificial. A segunda execução foi recusada. O titular real não foi criado.

## 6. Administração de funcionários

A tela `/conta/acessos` chama o servidor. O navegador não escolhe o titular. O titular cria o funcionário, define a senha, concede fazenda e permissão, e revoga.

Na H4-CJ, pela tela: o funcionário viu o animal depois da concessão; a revogação respondeu “Permissão revogada.”; a sessão aberta, ao recarregar, caiu em `/entrar`. Essa queda é recusa do servidor, porque a versão da sessão mudou. Na suíte isolada, funcionário não concede permissão a si mesmo e outra conta é recusada. Isso não foi repetido aqui.

O botão “Recuperar acesso” da entrada só grava um texto na própria página. Não chama o servidor e não troca senha. O titular também não redefine a própria senha por essa tela: o servidor recusa com `alvo_protegido`. A recuperação do proprietário ainda não tem procedimento seguro e testado.

## 7. Resultado dos quatro fluxos de interface

A evidência da H4-CJ basta. Não foram clicados de novo.

| Fluxo | O que a tela fez | O que o MySQL isolado guardou |
| --- | --- | --- |
| Funcionários | Login, fazenda, permissão, consulta de CJ-1, revogação e sessão derrubada | Permissão retirada e versão da sessão avançada |
| Rebanho | Cadastro de CJ-1, lista e pesagem de 180 kg | Animal 1 ativo e pesagem 1 |
| Compras e vendas | Compra 1, recebimento de CJ-REC-1, venda à vista por cabeça de R$ 3.500,00 | Animal 2 vendido, baixa ativa, título a receber de 3500.00 |
| Estoque e nutrição | Produto nutricional, entrada de 100 kg, fornecimento de 10 kg, saldo 90 kg | Um consumo de −10. A mesma solicitação repetida voltou `repetido: true` |

A repetição do fornecimento foi a mesma solicitação já enviada pela tela, reenviada pela sessão do navegador. Não foi um segundo formulário. A rota antiga de venda, a arroba e o estorno de recebimento não foram usados.

## 8. Pendências comprovadas

1. Recuperação da senha do proprietário não existe de verdade. O botão da entrada não fala com o servidor.
2. Onze provas de infraestrutura seguem vermelhas sem MySQL descartável e sem o JSON `.local-data`. Não medem o produto.
3. Cinco provas procuram um texto antigo. O comportamento correspondente permanece. Não foram “corrigidas” para ficarem verdes.

## 9. Riscos operacionais

- Se o proprietário perder a senha, não há recuperação automática. A implantação precisa de um procedimento administrativo, ainda não escrito como script seguro, antes de liberar o uso.
- OAuth desligado evita um acesso sem titular. Ligá-lo na pressa criaria usuário sem conta.
- Venda por arroba, estorno de recebimento e exclusão física de animal continuam indisponíveis. Não são essenciais para o uso já homologado, se o proprietário aceitar começar sem elas.
- A compra 2 da H4-CJ ficou sem recebimento, resíduo de clique repetido no ensaio. Não está no banco da fazenda.

## 10. Condições de implantação

Não executar agora. Quando houver autorização:

1. Backup atualizado e conferido do banco antigo.
2. O banco antigo permanece como histórico. Não é apagado.
3. Criar o banco novo só com autorização.
4. Aplicar o modelo, o complemento de restrições e as propostas 0071 a 0076.
5. Subir com `FD_PRONTIDAO_DEFINITIVA=1`.
6. Conta de aplicação só no banco novo.
7. Rodar o titular inicial uma vez, senha fora do código, sem imprimir a senha.
8. Entrar e sair pela tela `/entrar` com essa conta.
9. Conceder e revogar um funcionário artificial de ensaio, e confirmar que a sessão antiga cai.
10. Definir e ensaiar, antes de liberar usuários, como o proprietário recupera a senha sem criar um segundo titular e sem senha em texto.
11. Atualizar o aplicativo só com autorização.
12. Trocar a conexão para o banco novo.
13. Reiniciar o servidor de forma controlada.
14. Repetir na instalação real: animal, pesagem, compra com recebimento, venda integrada, estoque com fornecimento e a revogação.
15. Só então liberar usuários.
16. Monitorar e fazer backup do banco novo.

Teste obrigatório antes da liberação: login do titular real, logout, revogação de um funcionário de ensaio com queda da sessão, e o procedimento de recuperação da senha do proprietário.

## 11. Plano de recuperação

Antes da primeira gravação real no banco novo, a mudança pode ser cancelada: o aplicativo volta a apontar para o ambiente anterior e o banco novo vazio pode ser descartado.

Depois da primeira gravação real, não voltar sozinho para o banco antigo. Os registros reais ficam no banco novo. A recuperação passa a ser o backup desse banco novo.

## 12. Testes novos

Nenhum `it` novo nesta fase.

## 13. Total único atualizado

A H4-CJ fechou em **1072** (1067 mais 5). Esta fase não soma as 49 provas reexecutadas nem as 4330 da suíte larga.

**1072**

## 14. Arquivos modificados

- `auditoria/h4ck-pre-implantacao.md`

## 15. Commit local

O commit fica em cima de `de4b3bae9955938ad8035b377b5f50d506d79e3b`. O hash sai na resposta do chat. Não houve push.

## 16. Estado do Git

- Branch: `feat/h4-rebanho-sanidade-estoque`
- HEAD antes deste commit: `de4b3bae9955938ad8035b377b5f50d506d79e3b`
- Upstream: `409bc2bc7b9fcd50d0e9a41ab97e89e125cf283c`
- Dois commits locais ainda não enviados: a H4-CI (`78b3fcb`) e a H4-CJ (`de4b3ba`)
- A diferença “18 à frente” era a cadeia da H4-CH antes do envio. Depois do envio, a origem ficou em `409bc2b`. Não houve perda. A linhagem segue linear até `92341df`, `0eadbdd`, `c4fe81a`, `474010e`, `d511b8b` e `409bc2b`
- Árvore limpa antes deste relatório. Sem rebase, reset ou merge

## 17. Confirmação de preservação do ambiente oficial

O projeto oficial não foi editado. A porta 3000 não foi usada. A porta 3306 não foi usada. Nenhum container foi criado ou removido nesta fase. O titular real não foi cadastrado. O banco operacional novo não foi criado. Não houve implantação.

## Classificação

**AMARELO — APTO COM CONDIÇÕES PENDENTES**

Os quatro fluxos e a autenticação por e-mail e senha estão comprovados. A condição que falta antes de liberar usuários é o procedimento seguro de recuperação da senha do proprietário. As 20 falhas da suíte larga não são regressão do produto.
