# H4-CI — Aceite operacional

Conferência do que ficou pendente na H4-CH. Tudo neste ensaio rodou na cópia isolada do projeto.

O banco definitivo vazio foi montado de novo, a aplicação isolada subiu com o verificador ligado, e os fluxos essenciais foram gravados e relidos no banco descartável.

A tela foi aberta só até a entrada. Os quatro fluxos prioritários não foram clicados. Por isso esta fase não declara homologação visual e não fecha o aceite para pedir a implantação.

O banco da fazenda não foi alterado. O banco operacional novo não foi criado. O servidor da porta 3000 não foi reiniciado. O titular real não foi cadastrado. Não houve push, merge nem implantação.

## 1. Banco isolado utilizado

- Diretório: `C:\Users\Pedro Neto\Documents\fazenda-digital-h4k-cadastro-animal`
- Imagem: `mysql:8.4`
- Container: `fd-h4ci-aceite`
- Porta no computador: `3415`, somente em `127.0.0.1`
- Banco: `fd_h4ci_aceite`
- Volume próprio do container
- Credencial gerada na hora e descartada com o container
- Nenhum registro antigo de teste foi copiado
- Removido ao final

A porta 3306 e o container `fazenda-digital-mysql` não entraram neste ensaio.

## 2. Resultado da prontidão estrutural

`FD_PRONTIDAO_DEFINITIVA=1` ficou ligado na aplicação isolada.

Ordem aplicada no banco vazio:

1. Modelo do `drizzle/schema.ts`: 147 comandos. Nasceram as 62 tabelas do modelo.
2. Complemento de boot: 42 comandos, nenhum já existia. São as 41 chaves estrangeiras e o índice funcional `animal_baixas_animal_ativa_uq`.
3. Propostas 0071, 0072, 0073, 0074, 0075 e 0076, cada uma com estado `concluida` no livro `fd_livro_propostas`.

Contagem final:

- 64 tabelas (62 do modelo, mais `estoque_movimentacao_chaves` e o livro)
- 195 índices
- 41 chaves estrangeiras

O verificador aceitou essa estrutura, sem faltas. A aplicação passou a escutar na porta 3018 e `/api/health` respondeu 200.

Num segundo banco, vazio, com a mesma flag, a aplicação encerrou antes de escutar. O log nomeou tabelas obrigatórias ausentes, começando por `abastecimentos` e `animais`.

O arranque padrão, sem a flag, não foi alterado.

## 3. Conferência das chaves estrangeiras

O banco novo tem 41 chaves estrangeiras. Os 41 nomes são os mesmos exigidos por `server/databaseSchemaRequirements.ts` e os mesmos 41 `ADD CONSTRAINT` do complemento de boot.

Nenhuma exigida ficou de fora. Nenhuma chave extra apareceu na instalação nova.

A H4-CD leu 50 nomes distintos no banco antigo de teste. Esta fase não reabriu a porta 3306, então esses nomes não foram listados de novo. A diferença numérica não é uma falta da instalação nova. O conjunto necessário é o das 41, e ele está completo.

## 4. Configuração de autenticação

Há dois caminhos no código.

O caminho que a tela de entrada usa hoje é login local: e-mail e senha. A sessão volta no cookie `session`. Neste ensaio esse caminho funcionou com duas identidades artificiais, `@exemplo.invalid`. A sessão do titular respondeu o próprio id 1.

O botão de solicitar cadastro na tela só mostra o texto local "Solicitação de cadastro registrada." Ele não grava usuário.

O outro caminho chama um serviço externo quando `OAUTH_SERVER_URL` está preenchido. Nesta instância os endereços de OAuth e do Forge ficaram vazios. Esse serviço não foi chamado. A autenticação externa permanece pendente.

O processo isolado recebeu um segredo de sessão próprio, gerado na hora. A operação real precisa do segredo dela configurado. O valor de desenvolvimento não foi usado aqui.

Esta fase não declara a autenticação de implantação como comprovada.

## 5. Procedimento do titular inicial

O titular real não foi cadastrado.

O procedimento ensaiado, só no banco descartável, foi inserção direta:

- login local
- papel `principal`
- `titularUserId` igual ao próprio id
- papel de sistema `admin`
- situação `ativo`

O script `scripts/create-user.ts` não preenche papel nem `titularUserId`. Sozinho, ele não deixa o primeiro titular pronto para entrar.

Não há, no roteador da aplicação, uma função para criar o login de um funcionário nem para conceder permissão. O cadastro de pessoa do tipo funcionário grava a pessoa. Não abre sessão.

## 6. Testes pela interface

A aplicação isolada ficou em `http://127.0.0.1:3018`, em modo de desenvolvimento, para a página existir.

O Edge sem janela abriu `/entrar`. O documento desenhado tinha cerca de 300 KB e continha a tela de entrada.

Os quatro fluxos prioritários não foram clicados. Não há homologação visual.

O que segue foi comprovado pela API e conferido nas tabelas do banco isolado.

## 7. Resultados de Rebanho

Identidade artificial do titular.

- Fazenda "Fazenda Ensaio CI", id 1
- Animal `CI-1`, macho, id 1, `fazendaId` 1, status `ativo`
- A consulta do animal respondeu com sucesso
- Pesagem id 1, animal 1, peso 180,00, data civil 24/11/2026

## 8. Resultados de Compras e Vendas

- Fornecedor artificial e compra `CI-COMPRA-1`, fazenda 1, status `concluido`
- Recebimento do brinco `CI-REC-1`, animal id 2, status `confirmado`
- O animal 2 ficou na fazenda 1
- Venda integrada à vista, por cabeça, chave `ven-h4ci-0001`
- O animal 2 passou a `vendido`
- Baixa id 1, tipo `venda`, status `ativa`, fazenda 1, `vendaId` 1
- Título financeiro id 1, tipo `receber`, origem `venda_animais`, fazenda 1, valor 2500,00

## 9. Resultados de Estoque e Nutrição

- Produto "Milho Ensaio", ligado à fazenda 1, com controle de saldo
- Entrada de 100 kg. O saldo lido no banco ficou 100,00
- Fornecimento de 10 kg no lote da fazenda 1. Uma linha em `nutricao_fornecimentos`
- O saldo passou a 90,00
- A mesma solicitação, com a mesma chave, voltou como repetida
- O saldo continuou 90,00. Não houve segunda baixa

## 10. Autorizações testadas

Funcionário artificial, papel `comum`, ligado ao titular.

- Sem fazenda concedida e sem permissão, a lista de animais respondeu: "Sem permissão para consultar os animais."
- Depois da concessão da fazenda 1 e da permissão `animais.visualizar`, a lista abriu
- A tentativa de cadastrar produto, sem permissão de estoque, respondeu: "Sem permissão para movimentar o estoque."

A concessão não passou por uma tela. Foi gravada em `usuario_fazendas` e `usuario_permissoes`, que é o que a aplicação lê.

A pessoa do tipo funcionário também foi gravada. Ela é o cadastro da pessoa, separado do login.

## 11. Testes não executados

- Clique dos quatro fluxos na interface
- Autenticação no serviço externo
- Cadastro do titular real
- Regressão principal das 424 provas. O arranque padrão não mudou
- Recontagem das 252 rotas
- Qualquer leitura ou escrita na porta 3306

## 12. Problemas encontrados

- Os fluxos da interface não foram operados. A página de entrada foi desenhada; o restante do aceite visual ficou pendente.
- Não há procedimento na aplicação para criar o primeiro titular nem para conceder permissão a um login. O ensaio usou gravação direta.
- A autenticação externa não pôde ser exercitada com o endereço vazio.
- Na bateria dos seis testes já existentes da prontidão, o caso "coluna ausente é nomeada" falhou uma vez. Repetido sozinho, no mesmo tipo de MySQL descartável, ele passou. O banco completo foi aceito antes e depois disso. O teste não foi alterado e não entra de novo na contagem.

## 13. Testes novos

Nenhum `it()` novo. A suíte da prontidão foi só reexecutada.

## 14. Total acumulado

1.067 testes únicos. A reexecução não soma de novo.

## 15. Condições para implantação

Nenhuma destas ações foi feita no ambiente oficial. Elas continuam como condição para o dia da operação real:

- Banco novo criado e validado
- Conta da aplicação com privilégios limitados a esse banco
- Estrutura definitiva completa, com as 62 tabelas, o complemento e as propostas 0071–0076
- Verificador de prontidão habilitado
- Primeiro titular cadastrado pelo procedimento do papel principal, com `titularUserId` no próprio id
- Configuração de autenticação comprovada, inclusive a decisão sobre o serviço externo
- Segredo de sessão próprio na operação real
- Backup verificável do banco antigo
- Banco antigo preservado
- Aplicação apontando para o banco novo
- Testes operacionais aprovados, agora com as telas incluídas
- Plano de recuperação definido

## 16. Bloqueios remanescentes

Permanecem, e não foram implementados:

- Venda por arroba. A confirmação antiga respondeu que não pode ser usada enquanto a integração com o Financeiro estiver ligada. A confirmação integrada só aceita `kg` ou `cabeca`.
- Estorno de recebimento de Compras. A resposta foi: "O estorno do recebimento está temporariamente indisponível por segurança. Nenhum animal, compra ou recebimento foi alterado."
- Exclusão física de animal. A resposta foi: "Exclusão física de animais temporariamente indisponível por segurança."

O inventário de 252 rotas não foi alterado. Seguem 223 homologadas e 25 bloqueadas.

## 17. Arquivos modificados

- `auditoria/h4ci-aceite-operacional.md`

Nenhum código de produção foi alterado. O ensaio usou roteiros locais que não entram no commit.

## 18. Commit local

O commit local fecha esta fase, em cima de `409bc2bc7b9fcd50d0e9a41ab97e89e125cf283c`.

O hash fica na resposta do chat, porque este arquivo faz parte do próprio commit.

Não houve push.

## 19. Estado do Git

- Branch: `feat/h4-rebanho-sanidade-estoque`
- Depois do commit, a árvore fica limpa e um commit à frente do remoto
- Sem merge e sem push

## 20. Confirmação de preservação do ambiente oficial

- Projeto oficial, em `C:\Users\Pedro Neto\Documents\Fazenda Digital`, não foi editado
- Porta 3000 não foi usada
- Porta 3306 não foi usada para o ensaio
- No início da execução que produziu estes resultados, `fazenda-digital-mysql` estava saudável na 3306, com cerca de 18 minutos no ar
- No fim, o mesmo container seguia saudável na 3306, com cerca de 21 minutos no ar
- O tempo no ar avançou. Esta fase não reiniciou o MySQL oficial
- Os containers `fd-h4ci-aceite` e `fd-h4ci-teste` foram removidos
- Nenhum dado operacional foi copiado, apagado ou migrado

## Classificação

**NÃO APTO — INFORMAR IMPEDIMENTOS.**

Impedimentos:

1. Os quatro fluxos prioritários não foram operados na interface. A comprovação deles é de API e de banco, e isso não substitui a tela.
2. A autenticação da implantação não está comprovada. O login local artificial funcionou. Falta o procedimento de tela para o titular e para as concessões, e o serviço externo não foi exercitado.
