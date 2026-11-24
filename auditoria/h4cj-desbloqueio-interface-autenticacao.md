# H4-CJ — Desbloqueio da interface e autenticação

Esta fase fechou os dois impedimentos da H4-CI: os fluxos comerciais não tinham sido clicados na tela, e a autenticação com a administração de acessos não tinha sido comprovada.

O ensaio rodou só na cópia isolada. O banco da fazenda não foi alterado. O banco operacional novo não foi criado. O titular real não foi cadastrado. A porta 3000 não foi usada. Não houve push, merge nem implantação.

## 1. Conferência do histórico Git

A diferença entre “18 commits à frente” e “1 commit à frente” não é perda de histórico.

Na H4-CH a branch ainda não tinha sido enviada. Aqueles 18 commits locais eram a cadeia que ainda não estava na origem. O envio da H4-CH levou a origem até `409bc2bc7b9fcd50d0e9a41ab97e89e125cf283c`.

A H4-CI acrescentou um único commit local, `78b3fcbbc7e30fc8d4fbdc685a609fdaa9495b03`. Por isso a branch ficou um commit à frente da origem.

Conferência feita sem rebase, reset ou qualquer outra operação que reescreva o histórico:

- HEAD no início desta fase: `78b3fcbbc7e30fc8d4fbdc685a609fdaa9495b03`
- Remoto da branch: `409bc2bc7b9fcd50d0e9a41ab97e89e125cf283c`
- Ancestral comum entre os dois: o próprio remoto
- A cadeia é linear
- Os commits das fases anteriores continuam ancestrais: `92341df` (H4-CA), `0eadbdd` (H4-CB), `c4fe81a` (H4-CD), `474010e` (H4-CE), `d511b8b` (H4-CF) e `409bc2b` (H4-CH, que também guarda o relatório da H4-CG)

Nada inesperado apareceu no histórico. A fase seguiu.

## 2. Arquitetura real de autenticação

A tela que o proprietário vê, em `/entrar`, usa login local de e-mail e senha. O botão Entrar chama `auth.login`. Não há botão de OAuth nessa página.

O servidor grava um cookie `session`, httpOnly, com o identificador da pessoa e a versão da sessão. Em cada chamada protegida, `decidirSessao` compara a versão do cookie com a versão gravada no banco. Se a versão mudou, se a situação não permite login, ou se falta papel ou titular, a sessão é recusada.

O logout limpa o cookie. Também existe a saída por `/api/auth/logout`, que devolve a pessoa para `/entrar`.

O titular é a pessoa com papel `principal` cujo próprio id é o `titularUserId`. O funcionário é uma pessoa com papel `comum` ou `secundario`, vinculada ao titular, com fazendas e permissões concedidas.

OAuth e Forge existem no código como um segundo caminho. A entrada `/api/oauth/callback` está desligada por uma constante, `OAUTH_CALLBACK_HABILITADO = false`. Variável de ambiente não liga esse caminho. Esta fase não alterou essa constante e não conectou o ambiente isolado a nenhum serviço externo.

## 3. Procedimento de login definitivo

O primeiro acesso que a tela oferece é este:

1. O administrador da instalação cria o titular inicial, uma única vez, no banco novo e vazio. O procedimento está na seção 4.
2. O proprietário abre `/entrar`.
3. Informa o e-mail e a senha definidos nesse cadastro.
4. O servidor confere a senha, a situação e a versão da sessão, e grava o cookie.
5. A tela segue para o painel.

O que seria necessário se alguém quisesse ligar o OAuth, e que esta fase não fez:

- Mudar a constante que hoje recusa o retorno.
- Informar o endereço do servidor OAuth, o portal, o identificador da aplicação e o segredo.
- Cadastrar o endereço de retorno `${origem}/api/oauth/callback`.
- Tratar o fato de que um usuário nascido só pelo OAuth entra sem papel e sem titular.

Como a tela real não depende desse serviço, o login definitivo comprovado aqui é o de e-mail e senha, exercitado no ambiente isolado equivalente. O caminho OAuth permanece desligado e não está homologado.

## 4. Procedimento do primeiro titular

O script `scripts/criar-titular-inicial.ts` só corre com duas travas explícitas: `FD_CRIAR_TITULAR_INICIAL=1` e o argumento `--confirmo-banco-novo`.

Ele recusa banco vazio de nome, recusa o nome do banco antigo e recusa uma segunda execução quando já existe um principal. A senha vem do ambiente, é gravada como hash e não entra na auditoria nem na mensagem impressa. O vínculo `titularUserId` aponta para o próprio registro. A auditoria guarda papel e e-mail, com a operação `titular.inicial`.

No banco descartável desta fase o script rodou uma vez com identidade artificial e respondeu que o titular inicial foi criado, id 1. A segunda execução foi recusada. O titular real não foi cadastrado.

O cadastro público da tela de entrada continua sem criar usuário. Não foi aberta inscrição livre.

## 5. Administração de funcionários

A regra continua no servidor, nos serviços que já existiam. A tela nova, em `/conta/acessos`, só chama esses serviços. O navegador não envia titular nem executor como autoridade. O servidor usa a pessoa da sessão.

Pela tela, o titular:

- cria um usuário comum ou secundário da própria conta
- define a senha inicial
- concede e revoga fazenda
- concede e revoga permissão
- inativa o usuário

Quem não é o titular vê o aviso de que só o titular administra os acessos. Funcionário não concede permissão a si mesmo: o servidor recusa. Usuário de outro titular também é recusado. Essas duas recusas foram comprovadas na suíte isolada da administração, com dados artificiais, e não por um segundo titular na tela.

## 6. Concessão e revogação de permissões

Conceder fazenda grava `usuario_fazendas`. Conceder permissão grava `usuario_permissoes`. As duas coisas são necessárias para o funcionário operar. Só o vínculo da fazenda não abre a lista.

Revogar, trocar senha ou inativar aumenta a `sessionVersion` da pessoa alvo. O cookie antigo deixa de valer.

Na tela, a revogação de `animais.visualizar` respondeu “Permissão revogada.” A sessão que o funcionário já tinha aberta, ao recarregar, caiu em `/entrar`.

## 7. Correções realizadas

Duas falhas apareceram ao clicar e foram corrigidas no menor ponto:

1. Os botões “Conceder” e “Revogar” eram os dois do tipo enviar. O formulário lia um campo que o navegador não inclui, então Revogar disparava uma nova concessão. A tela passou a ler qual botão foi clicado. A regra de conceder ou revogar continua no servidor.
2. A entrada de estoque que não é compra exige uma chave de operação. O formulário de movimentação não enviava essa chave, e o ajuste de entrada parava com erro de campo ausente. Cada linha passou a levar uma chave estável, reaproveitada se a mesma gravação for repetida. O servidor continua dono da idempotência.

Também entrou a tela `/conta/acessos`, a porta `acesso` no roteador e o procedimento do primeiro titular. Nenhuma regra comercial já homologada foi reaberta. Venda por arroba, estorno de recebimento e exclusão física de animal continuam indisponíveis. O censo de 252 rotas não foi alterado: 223 homologadas e 25 bloqueadas.

## 8. Resultado do navegador

A aplicação isolada ficou em `http://127.0.0.1:3019`. O banco descartável ficou em `127.0.0.1:3417`, banco `fd_h4cj_aceite`, container `fd-h4cj-aceite`, imagem `mysql:8.4`.

O navegador foi o Edge sem janela, conduzido pelo Playwright instalado fora dos dois projetos. A espera da página usou o carregamento do documento. A rede do Vite não fica ociosa, então “rede parada” não serve como sinal.

O login artificial do titular passou da página de entrada para o painel. Os quatro fluxos abaixo foram clicados. Chamada direta de API não foi contada como clique. A repetição do fornecimento é a única exceção registrada: a mesma solicitação já enviada pela tela foi reenviada pela sessão do navegador, porque o botão trava enquanto grava e a página sai depois do primeiro sucesso.

## 9. Fluxo de Rebanho

Pela tela, com o titular artificial:

1. Entrou em `/entrar`.
2. A fazenda única “Fazenda Artificial CJ” ficou selecionada.
3. Cadastrou o animal de brinco CJ-1, macho, categoria Bezerro, entrada em 24/11/2026.
4. A lista de animais, depois de escolher a fazenda, mostrou CJ-1.
5. Em Manejo, registro de pesagem, gravou 180 kg para CJ-1.
6. No MySQL isolado: animal id 1, brinco CJ-1, status ativo, fazenda 5. Pesagem id 1, animal 1, peso 180.00.

## 10. Fluxo de Compras e Vendas

Pela tela:

1. Cadastrou o fornecedor artificial e a compra de 1 animal, 180 kg, R$/kg, fazenda 5. A compra id 1 ficou concluída.
2. Em Receber / Identificar animais, confirmou o brinco CJ-REC-1.
3. O animal recebido é o id 2, ativo na fazenda 5 no momento do recebimento. Recebimento id 1, status confirmado.
4. Cadastrou o comprador artificial. Na venda nova, forma R$/cabeça, condição à vista, valor R$ 3.500,00, animal CJ-REC-1. O botão chegou a “Salvando” e a venda foi gravada.
5. A tela da venda 1 mostra status Concluída, comprador artificial, fazenda artificial, CJ-REC-1 e total R$ 3.500,00.
6. Em Contas a Receber, novembro de 2026, aparece o título à vista de R$ 3.500,00, em aberto, origem da venda.

No MySQL isolado: venda id 1, status concluido, forma cabeca, fazenda 5. Animal 2 com status vendido. Baixa id 1, tipo venda, status ativa, ligada à venda 1. Título id 1, tipo receber, estado ativo, origem `venda_animais`, origem 1, valor 3500.00.

A rota antiga de confirmação de venda não foi usada. O estorno de recebimento não foi habilitado. A forma arroba não foi gravada.

Uma segunda compra, id 2, também ficou concluída, sem recebimento. Ela nasceu de uma repetição do clique enquanto a primeira já existia. O recebimento aceito é o da compra 1.

## 11. Fluxo de Estoque e Nutrição

Pela tela:

1. Cadastrou o produto “Milho Artificial CJ”, categoria Nutricionais, unidade quilograma, vinculado à fazenda, com controle de saldo.
2. Na movimentação, operação Ajuste, motivo Ajuste de entrada, quantidade 100. Depois da correção da chave, a gravação saiu da tela de nova movimentação.
3. A lista de produtos da fazenda mostrou 100 kg.
4. Criou o lote “Lote Artificial CJ” e confirmou o fornecimento de 10 kg do milho para esse lote. A prévia mostrava saldo 100 kg e saldo após 90 kg. A lista de fornecimentos mostra 10 kg, status confirmado, em 24/11/2026.
5. A mesma solicitação, reenviada pela sessão do navegador, voltou `repetido: true` e status confirmado.
6. A lista de produtos ficou em 90 kg. Não houve segunda baixa.

No MySQL isolado: estoque quantidade 90.00. Movimento id 1, ajuste de entrada, +100. Movimento id 2, consumo interno, -10, ligado ao fornecimento 1. Fornecimento id 1, status confirmado, 10 kg. Um único consumo.

O lote estava vazio de animais. A tela avisou que a confirmação é permitida e que não há kg por cabeça. O custo ficou incompleto porque a entrada não tinha valor unitário. A baixa de quantidade ocorreu assim mesmo.

## 12. Fluxo de Funcionários

Pela tela `/conta/acessos`, com o titular:

1. Cadastrou o funcionário artificial, papel comum, da mesma conta.
2. Definiu a senha inicial pela própria tela. A senha não foi impressa nem auditada em claro.
3. Concedeu a fazenda 5.
4. Concedeu `fazendas.visualizar` e `animais.visualizar`.
5. Entrou com o funcionário. A lista de animais da fazenda mostrou CJ-1.
6. Depois da revogação de `animais.visualizar`, um novo acesso do funcionário abriu a mesma fazenda e a lista veio vazia: “Nenhum animal cadastrado ainda”, 0 animais. O animal continuava no banco.
7. A revogação respondeu “Permissão revogada.”
8. A sessão que já estava aberta, ao recarregar, foi para `/entrar`.

A preparação da senha é um passo da tela do titular, não um cadastro público. O servidor confere quem executa, o alvo e o tamanho da senha antes de gravar o hash.

## 13. Evidências de persistência

Tudo abaixo foi lido no MySQL descartável depois dos cliques. Nenhum dado veio do banco da fazenda.

| Registro | O que ficou |
| --- | --- |
| Animal 1 | CJ-1, ativo, fazenda 5 |
| Pesagem 1 | animal 1, 180 kg |
| Compra 1 | concluída, fazenda 5, 1 animal, R$/kg |
| Recebimento 1 | compra 1, animal 2, brinco CJ-REC-1, confirmado |
| Animal 2 | CJ-REC-1, vendido, fazenda 5 |
| Venda 1 | concluída, fazenda 5, R$/cabeça |
| Baixa 1 | animal 2, venda 1, tipo venda, ativa |
| Título 1 | a receber, ativo, origem da venda 1, 3500.00 |
| Estoque | Milho Artificial CJ, 90 kg |
| Movimentos | +100 de ajuste e -10 de consumo do fornecimento 1 |
| Fornecimento 1 | confirmado, 10 kg |

A compra 2 permanece concluída e sem recebimento, como resíduo do clique repetido.

## 14. Testes de autorização

| Prova | Onde | Resultado |
| --- | --- | --- |
| Titular administra a própria conta | Tela `/conta/acessos` | Criou o funcionário, definiu senha, concedeu fazenda e permissão |
| Funcionário sem a permissão não vê o rebanho | Tela, depois da revogação | Fazenda visível, lista de animais vazia |
| Concessão permite a operação | Tela, antes da revogação | O funcionário viu CJ-1 |
| Revogação impede a sessão antiga | Tela | Recarregar levou a `/entrar` |
| Funcionário não concede a si mesmo | Suíte isolada da administração | Recusado por falta de permissão |
| Outro titular não alcança o registro | Suíte isolada da administração | Recusado como outra conta |
| Sessão desatualizada perde o acesso | Tela e regra de versão | A revogação mudou a versão e o cookie antigo caiu |

As duas linhas marcadas como suíte isolada não foram um segundo clique de outro titular. Foram o serviço real, no MySQL descartável da própria suíte, com pessoas artificiais.

## 15. Testes novos

Contados só os `it` que esta fase acrescentou. Teste antigo reexecutado não entra de novo.

- `server/titularInicial.test.ts`: 2
- `server/administracao.isolado.test.ts`: 2 (definição de senha sem vazar o segredo, e recusa do nome do banco antigo no caminho da aplicação)
- `server/administracao.test.ts`: 1 (a tela lê o botão clicado e a movimentação envia a chave)

Os 38 testes que já existiam em `administracao.test.ts` continuam os mesmos e não foram somados outra vez. O teste de menu foi ajustado para o item “Acessos da conta” e segue com 4 provas, sem `it` novo.

## 16. Regressão

A lista fechada de 424 testes não está nomeada no repositório. Não inventei esse número.

Uma passagem larga, fora dos arquivos isolados e dos arquivos de MySQL, com a URL de banco fechada de propósito na porta 9, tinha 20 falhas. Elas foram recusa de conexão nessa porta fechada, arquivo local ausente na cópia, ou expectativa antiga que já falhava no commit da H4-CI. Não foram tratadas como regressão desta fase e não entram no total único.

Depois das correções de produção, com a mesma URL fechada, rodaram de novo:

- titular inicial: 2
- administração: 39
- menu: 4
- operações de estoque: 14

59 provas, todas aprovadas. A suíte isolada da administração já tinha aprovado as provas de senha e de recusa do banco antigo antes dos ajustes só de tela.

## 17. Total único acumulado

1067 da H4-CI, mais 2, mais 2, mais 1.

**1072**

## 18. Dependências externas

O login da tela não depende de OAuth nem de Forge. Esses serviços seguem desligados.

A lista de municípios da fazenda consulta o serviço público do IBGE, só leitura. Foi o mesmo caminho já usado ao cadastrar a fazenda artificial. Nenhuma integração com efeito real foi ligada. O ambiente isolado não foi apontado para serviço operacional.

## 19. Impedimentos restantes

Nenhum impedimento concreto restante para pedir autorização de implantação.

Ficam registrados, sem bloquear o aceite:

- O caminho OAuth continua desligado de propósito e não foi homologado.
- A compra 2 ficou sem recebimento, por clique repetido. O fluxo aceito é a compra 1.
- Não foi criada conta de caixa. O título a receber aparece mesmo assim. O aviso da tela pede a conta só para registrar o pagamento depois.
- O custo do fornecimento ficou incompleto porque a entrada de estoque não tinha preço. A quantidade baixou uma vez só.

## 20. Arquivos modificados

- `auditoria/h4cj-desbloqueio-interface-autenticacao.md`
- `client/src/App.tsx`
- `client/src/lib/data.ts`
- `client/src/lib/navegacaoRelatoriosRemovidos.test.ts`
- `client/src/pages/AcessoContaPage.tsx`
- `client/src/pages/InsumosNovaMovimentacaoPage.tsx`
- `scripts/criar-titular-inicial.ts`
- `server/acessoContaRouter.ts`
- `server/administracao.ts`
- `server/administracaoConsultaDb.ts`
- `server/administracaoDb.ts`
- `server/administracao.test.ts`
- `server/administracao.isolado.test.ts`
- `server/routers.ts`
- `server/titularInicial.ts`
- `server/titularInicial.test.ts`

Os roteiros de navegação e o arquivo de sessão ficaram fora do repositório e foram apagados no encerramento.

## 21. Commit local

O commit local fecha esta fase, em cima de `78b3fcbbc7e30fc8d4fbdc685a609fdaa9495b03`.

O hash fica na resposta do chat, porque este arquivo faz parte do próprio commit.

Não houve push.

## 22. Estado do Git

- Branch: `feat/h4-rebanho-sanidade-estoque`
- Depois do commit, a árvore fica limpa e dois commits à frente do remoto `409bc2b`
- Sem merge, rebase, reset ou push

## 23. Preservação do ambiente oficial

- O projeto oficial, em `C:\Users\Pedro Neto\Documents\Fazenda Digital`, não foi editado
- A porta 3000 não foi usada
- A porta 3306 não recebeu o ensaio
- No início, `fazenda-digital-mysql` estava saudável, com cerca de uma hora no ar
- No encerramento, o mesmo container seguia saudável, com cerca de duas horas no ar
- O tempo no ar avançou. Esta fase não reiniciou o MySQL oficial
- Só o container `fd-h4cj-aceite` foi removido, junto com a aplicação da porta 3019
- O titular real não foi cadastrado e o banco operacional novo não foi criado

## 24. Próxima ação recomendada

Pedir autorização de implantação quando o responsável quiser. Na implantação, o primeiro passo administrativo é o script do titular inicial, uma vez, no banco novo e vazio, com a senha fora do código. O OAuth permanece desligado até uma decisão própria.

## Classificação

**APTO PARA SOLICITAR AUTORIZAÇÃO DE IMPLANTAÇÃO**
