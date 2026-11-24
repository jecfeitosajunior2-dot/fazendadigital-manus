# H4-CL — Troca e recuperação segura de senha

O titular passa a trocar a própria senha em Minha conta. Quem esquece a senha depende de um comando no computador da instalação, não de um e-mail simulado. O ensaio usou só banco descartável. A porta 3000 e a 3306 não entraram nos testes. O titular real não foi cadastrado. O banco da fazenda não foi alterado.

## 1. Autenticação existente

A entrada continua em `/entrar`, pelo procedimento `auth.login`, com e-mail e senha. O cookie `session` leva a versão da sessão. Cada pedido protegido compara essa versão com a do banco. Se a versão divergir, a sessão morre. O logout limpa o cookie.

O cadastro de funcionário, a senha inicial do funcionário e a revogação continuam no caminho administrativo já homologado. Esse caminho recusa alterar o titular (`alvo_protegido`) e recusa o funcionário comum (`sem_permissao` ou `alvo_protegido`, conforme o alvo). Essa trava foi mantida. A troca da própria senha é outro caminho e usa só o identificador de quem já está na sessão.

O retorno do OAuth continua desligado.

## 2. Algoritmo de senha

O hash segue o que o login já confere: bcrypt, custo 10, no formato que `senhaConfereComHash` aceita. A senha em claro não é gravada. Não foi criado um segundo método de senha e não se usou SHA-256 simples.

A política continua a mesma: de 8 a 80 caracteres. A troca ainda exige que a nova seja diferente da atual.

## 3. Alterações realizadas

- Tela Minha conta, no menu e na rota `/conta/minha`.
- Procedimento `acesso.alterarMinhaSenha`, sem identificador de usuário vindo do navegador.
- Comando local `scripts/recuperar-acesso.ts`.
- O botão Recuperar acesso explica o procedimento real. Não envia e-mail e não consulta se a conta existe.
- Depois da recuperação, a sessão indica que a senha precisa ser trocada em Minha conta. Não foi criada coluna nova no banco.

Rebanho, Compras, Vendas, Estoque e Financeiro não mudaram de regra.

## 4. Funcionamento de Minha conta

O menu abre Minha conta logo depois do Painel de Controle. O formulário pede senha atual, nova senha e confirmação. No sucesso, a sessão é encerrada e a tela volta para entrar. A senha antiga deixa de autenticar. A nova entra.

## 5. Procedimento de troca de senha

1. A sessão precisa ser válida. A versão do cookie tem de ser a do banco.
2. O servidor usa o usuário dessa sessão. O formulário não escolhe outra conta.
3. A senha atual é conferida com o bcrypt já gravado.
4. A confirmação tem de ser igual à nova senha.
5. A nova senha tem de ter entre 8 e 80 caracteres e ser diferente da atual.
6. O hash é trocado e a versão da sessão sobe uma unidade, na mesma transação.
7. A auditoria registra `acesso.trocar` sem a senha.

Senha atual errada, senha fora da política, confirmação diferente, senha repetida ou sessão velha: o banco fica como estava.

## 6. Procedimento de recuperação administrativa

Não há rota pública para redefinir senha. O funcionário, no navegador, não alcança esse comando.

No computador da instalação, o operador:

1. Confirma, fora do sistema, que o titular pediu a recuperação.
2. Aponta `DATABASE_URL` para o banco da instalação.
3. Liga `FD_RECUPERAR_ACESSO` e `FD_RECUPERAR_AUTORIZACAO_TITULAR`.
4. Informa o e-mail e a credencial nova só no ambiente, nunca na linha de comando.
5. Executa `scripts/recuperar-acesso.ts` com `--confirmo-recuperacao`.

O comando localiza a conta pelo e-mail, grava só o hash, sobe a versão da sessão e registra `acesso.recuperar`. A saída diz para o titular entrar e trocar a senha em Minha conta. Não mostra a credencial.

O comando recusa o banco de nome `fazenda_digital`. Recusa a porta 3306, a menos que o operador também ligue `FD_RECUPERAR_BANCO_NOVO`, para um banco novo nessa porta. Nesta fase essa confirmação não foi usada. O arquivo antigo da fazenda continua fora do comando.

Se faltar autorização, se a senha vier na linha de comando ou se o banco for o da fazenda, o comando para antes de gravar.

Não há coluna de “troca obrigatória”. O aviso usa a auditoria: enquanto o último evento da conta for a recuperação, a aplicação manda o titular para Minha conta. A troca própria grava `acesso.trocar` e o aviso some. Uma segunda recuperação não devolve vida às sessões anteriores.

## 7. Proteção das credenciais

A senha não vai para argumento, log do comando nem arquivo versionado. A auditoria passa pelo filtro que tira campos de senha, token e segredo. O texto gravado é só a marca `acessoPreparado`. A prova leu a auditoria e não encontrou a credencial.

A tela de recuperação não diz se o e-mail está cadastrado.

O comando, no ensaio, conseguiu gravar com uma conta de banco que só tinha leitura e atualização de `users` e leitura e inclusão em `auditoria_eventos`. É o mesmo tipo de escrita que a aplicação já faz ao definir a senha de um funcionário. Nenhum privilégio novo foi concedido no banco da fazenda.

## 8. Invalidação de sessões

A troca e a recuperação fazem `sessionVersion = sessionVersion + 1` só se a versão lida ainda for a mesma. A sessão antiga falha em `decidirSessao`. A segunda recuperação sobe a versão de novo: nem a sessão original nem a da primeira recuperação voltam a valer.

## 9. Testes de titularidade

No MySQL descartável, porta 3319, banco `fd_h4cl`, container próprio, já removido:

- Senha atual correta: hash trocado.
- Senha atual incorreta: nada mudou.
- Senha curta: nada mudou.
- Confirmação diferente: nada mudou.
- Repetir a senha atual: nada mudou.
- Outro titular troca a própria senha e não mexe na conta alheia.
- Sessão com versão errada: nada mudou.
- Senha antiga deixa de conferir e a nova confere.
- A versão anterior da sessão deixa de ser aceita.
- Funcionário comum, pelo caminho administrativo, recebe `alvo_protegido` ao mirar o titular. O hash do titular não muda.

## 10. Testes de recuperação

No mesmo banco descartável:

- A recuperação troca a credencial, a senha anterior deixa de conferir e a sessão antiga morre.
- A segunda recuperação não reativa a sessão do meio nem a primeira senha recuperada.
- Sem autorização, o hash, a versão e a auditoria ficam intocados.
- A auditoria não contém a credencial.
- O comando local conclui, a saída não contém a senha nem a senha do banco de teste, e a versão sobe.
- O comando recusa `fazenda_digital` na porta 3306 sem abrir conexão.
- A conta estreita de banco conseguiu a gravação sem privilégio além de atualizar usuário e incluir auditoria.

Usuários artificiais. Nenhum dado da fazenda.

## 11. Testes de navegador

Aplicação isolada na porta 3019, MySQL descartável na porta 3419. O titular artificial entrou, abriu Minha conta, trocou a senha e voltou para `/entrar`. A senha antiga mostrou “Usuário ou senha inválidos.” A senha nova entrou de novo no painel.

Em seguida, Recuperar acesso mostrou o texto do procedimento: não envia e-mail, não consulta se a conta existe, e a recuperação é o comando administrativo no computador do servidor, seguido da troca em Minha conta. Não havia botão de enviar instruções.

## 12. Regressão

A suíte larga, de novo com o banco apontado para `127.0.0.1:9` e sem os arquivos isolados, ficou em 16 falhas e 4346 aprovações, em 9 arquivos. São as mesmas falhas já classificadas na H4-CK como infraestrutura ou contrato de texto antigo: estoque por categoria, filtro de manutenção, saldo de manutenção, importação local, detalhe da compra, perfis, RFID, lista da compra e recebimento. Nenhuma falha nova.

As quatro que saíram desta contagem eram o menu e as três planilhas de sêmen, já classificadas como infraestrutura na H4-CK. O menu foi alinhado ao item Minha conta. As planilhas passaram nesta execução. Não entram de novo no total único e não foram misturadas com as 16 que continuam vermelhas sem MySQL descartável.

Contratos de acesso e de menu: 54 provas aprovadas, já contadas antes.

## 13. Testes novos

27 provas novas, contadas uma vez:

- 11 em `server/senhaConta.test.ts` (plano, tela, roteador e recusa do banco da fazenda).
- 16 em `server/senhaConta.isolado.test.ts` (troca, sessão, titularidade, recuperação e comando).

## 14. Total acumulado

1072 da H4-CK, mais 27 desta fase. Total único: **1099**.

A suíte larga não foi somada de novo.

## 15. Pendências

A recuperação automática por e-mail não existe. O caminho é o comando administrativo.

O comando não aceita o banco chamado `fazenda_digital`. No dia da implantação o banco novo precisa de outro nome, como já está na estratégia de arquivo. Se esse banco novo ficar na porta 3306, o operador liga `FD_RECUPERAR_BANCO_NOVO` além das outras confirmações. Isso não foi executado aqui.

Não há coluna que tranque o restante da API até a troca. A tela leva o titular para Minha conta enquanto a recuperação for o último evento.

As 16 falhas antigas de infraestrutura e de texto de teste continuam fora desta decisão. O OAuth continua desligado de propósito.

## 16. Arquivos modificados

- `client/src/pages/MinhaContaPage.tsx`
- `client/src/pages/LoginPage.tsx`
- `client/src/App.tsx`
- `client/src/components/AppLayout.tsx`
- `client/src/lib/data.ts`
- `client/src/lib/navegacaoRelatoriosRemovidos.test.ts`
- `server/acessoContaRouter.ts`
- `server/routers.ts`
- `server/senhaConta.ts`
- `server/senhaContaDb.ts`
- `server/senhaConta.test.ts`
- `server/senhaConta.isolado.test.ts`
- `scripts/recuperar-acesso.ts`
- `auditoria/h4cl-recuperacao-senha.md`

## 17. Commit local

Commit local desta fase, filho de `491a3bd65fd36756ce2ac5f2d3feb6f7ee341595`. Sem push, sem merge, sem reset e sem rebase. O identificador completo fica no Git e na mensagem que acompanha este parecer.

## 18. Estado do Git

Branch `feat/h4-rebanho-sanidade-estoque`. O histórico anterior permanece. Depois deste commit, a branch fica quatro commits à frente de `409bc2bc7b9fcd50d0e9a41ab97e89e125cf283c` (H4-CI, H4-CJ, H4-CK e H4-CL).

## 19. Ambiente oficial

O projeto oficial não foi editado. O banco `fazenda_digital` não foi alterado. O container `fazenda-digital-mysql` seguia no ar, saudável, com o mesmo tempo de atividade de antes do ensaio. Não foi reiniciado. A porta 3000 não estava em escuta. O MySQL e a aplicação usados aqui foram descartados ao final. O titular real não foi cadastrado. Nada foi implantado.

## Decisão

**VERDE — APTO PARA SOLICITAR AUTORIZAÇÃO DE IMPLANTAÇÃO**

A troca da própria senha e o procedimento administrativo de recuperação foram executados e conferidos, com a sessão antiga invalidada e sem falha crítica de credencial ou de autorização.
