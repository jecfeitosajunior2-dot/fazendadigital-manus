# H4-CH — Banco definitivo vazio

Homologação da alternativa B, só em ambiente isolado.

O Fazenda Digital sobe e grava num banco novo, vazio e estruturalmente completo. Não depende dos registros antigos de teste.

O banco da fazenda não foi alterado. O banco operacional novo não foi criado. O servidor da porta 3000 não foi reiniciado. O titular real não foi cadastrado. A implantação não foi executada.

## 1. Situação inicial do Git

- Diretório de trabalho: `C:\Users\Pedro Neto\Documents\fazenda-digital-h4k-cadastro-animal`
- Branch: `feat/h4-rebanho-sanidade-estoque`
- HEAD no início: `d511b8b6f8b16981e9c700fbdfa382b929b0f549`
- A branch estava 17 commits à frente do remoto, sem push.
- A árvore estava limpa, com um único arquivo fora do Git: `auditoria/h4cg-estrategia-implantacao.md`
- O repositório oficial, em `C:\Users\Pedro Neto\Documents\Fazenda Digital`, permaneceu em `1f2dfe9`, branch `cursor/at05-web-serial-poc`. Nenhum arquivo de lá foi editado.

## 2. Tratamento do relatório H4-CG

O relatório da H4-CG existia e ainda não tinha commit. Foi preservado e entra neste commit local, junto com a homologação.

A recomendação dele continua de pé: operação real em banco novo e vazio; `fazenda_digital` fica como arquivo dos testes.

## 3. Ambiente MySQL descartável

- Imagem: MySQL 8.4
- Versão lida: `8.4.11`
- Container: `fd-h4ch-vazio`
- Porta no computador: `3413`, só em `127.0.0.1`
- Banco: `fd_h4ch_vazio`
- Volume próprio do container, sem ligar no volume da fazenda
- Credencial exclusiva, gerada na hora e não gravada
- Removido ao final com `docker rm -f fd-h4ch-vazio`

O container `fazenda-digital-mysql` continuou saudável na porta 3306. O tempo no ar dele não foi zerado.

## 4. Resultado da criação das 62 tabelas

Mecanismo: o instalador recusa a porta 3306, o banco `fazenda_digital` e o container `fazenda-digital-mysql`. Em seguida conta as tabelas. Se já existir alguma, para. Se o Drizzle pedir para apagar dado, a confirmação não é dada e o processo é interrompido. Só então o `drizzle-kit push` cria o modelo de `drizzle/schema.ts` no banco vazio.

A cadeia 0000–0001 não foi usada.

Resultado, antes das propostas:

- 62 tabelas
- `reproducao_operacoes` presente (0067 já nasce no modelo)
- `semen_entrada_operacoes` presente (0068 já nasce no modelo)
- índice `semen_partidas_uq` presente (0069 já nasce no modelo)
- índice `manutencoes_chave_operacao_uq` presente (0060 já nasce no modelo)
- coluna `animais.brinco_ativo_chave` ausente
- tabela `estoque_movimentacao_chaves` ausente

0060, 0067, 0068 e 0069 não foram reaplicadas.

## 5. Propostas aplicadas

Somente estas, nesta ordem, pelo executor que já recusa o banco da fazenda:

| Proposta | Situação | SHA-256 |
| --- | --- | --- |
| 0071 | concluída | `4c5542e41c525828d78c1d6eab2396e4c8baf859b06a37e9ace9fa7b9c69884e` |
| 0072 | concluída | `b62885f30bb422ee6ff8a7a289106d450f7a262af07f265d999ae14bb73437d8` |
| 0073 | concluída | `4b996048788d5657fe12624102b1e743438eadabb07b270d670c9eaad716cf18` |
| 0074 | concluída | `3d1293bf7ba8f28454af1901517bfe75d3cdec83d77ef7c8f057d0c7414e64d2` |
| 0075 | concluída | `479ba68b4e8a3d5fc858ba871d3bff1ea20654a8123ad5a6deb2d5d4dfad7ff7` |
| 0076 | concluída | `77f34c8b27623d4488691a2a881d0d659b800f4f92a1a2181ba3b1cdda1e05b0` |

As seis não dependem uma da outra. A numeração não é dependência. Cada uma foi conferida antes de escrever e pararia o conjunto se não ficasse concluída.

Fora deste conjunto:

- 0060, 0067, 0068 e 0069: já estavam no modelo
- 0070: rejeitada, não aplicada
- 0077: opcional, não aplicada

O modelo também não declara as chaves estrangeiras que o arranque já exige, nem o índice funcional de uma baixa ativa por animal. Isso foi acrescentado por `drizzle/complemento-restricoes-boot.sql`, com 41 chaves e 1 índice. Hash do arquivo: `cd6699b4e015a69847b783faea226544c6566f58f1137f11b682a580de4b9be7`.

## 6. Estruturas finais

- Brinco ativo por fazenda: coluna gerada `brinco_ativo_chave` e índice único `(userId, fazendaId, brinco_ativo_chave)`
- Estoque: tabela `estoque_movimentacao_chaves` e índice único `(titular_user_id, chave)`
- Nutrição: `chaveOperacao` e `conteudoHash` em fornecimento e batida, com índice único `(userId, chaveOperacao)` em cada uma
- Leitura de cocho: as mesmas colunas e o índice único próprio
- Manutenção: `fazendaId` nulo e índice não único `(userId, fazendaId)`
- Abastecimento: `chaveOperacao` nulo e índice único `(userId, chaveOperacao)`
- Livro `fd_livro_propostas`: só no descartável, com as seis propostas concluídas

## 7. Manifesto do esquema

- MySQL `8.4.11`
- Modelo: `drizzle/schema.ts` como estava em `d511b8b6f8b16981e9c700fbdfa382b929b0f549`. O arquivo do modelo não foi reescrito.
- Tabelas ao final: 64. São as 62 do modelo, mais `estoque_movimentacao_chaves`, mais o livro das propostas.
- Índices: 195
- Chaves estrangeiras: 41
- Complemento do arranque: 42 comandos, nenhum já existia, hash acima
- Propostas: as seis da tabela, com os hashes acima
- Verificação: o modelo nasceu sem as peças 0071–0076; depois da aplicação, a prontidão passou
- Estado final: esquema vazio, pronto para a instância isolada
- Senha: não registrada

## 8. Verificador de prontidão

O arranque de hoje chama `verifyDatabaseSchema`. Ele olha o modelo Drizzle. Coluna extra não impede a subida. As peças 0071–0076 não entram nessa lista. A limitação apontada na H4-CG permanece no caminho padrão.

A conferência nova está em `server/prontidaoDefinitiva.ts`. Ela lê a definição do índice: nome, ordem das colunas e se é único. Também confere tipo, tamanho, nulo, coluna gerada e colação do brinco. Não executa migração e não corrige diferença.

Ela entra no arranque só quando `FD_PRONTIDAO_DEFINITIVA=1`. Sem essa variável, o desenvolvimento continua como estava. Se a conferência falha, o processo sai antes de abrir o HTTP. O ambiente não é liberado.

## 9. Testes de estruturas ausentes

Os seis casos rodaram no MySQL descartável. Os casos quebrados usaram outro banco, não o esquema homologado.

1. Banco completo: pronto.
2. Coluna ausente: a mensagem cita `animais.brinco_ativo_chave`.
3. Índice ausente: a mensagem cita `animais_brinco_ativo_fazenda_uq`.
4. Índice incompatível: a mensagem mostra a definição esperada e a encontrada.
5. Estrutura parcial: a mensagem cita `nutricao_fornecimentos.conteudoHash` e o índice que falta.
6. Banco inacessível, na porta 9: a resposta é “Banco inacessível.” Nada foi alterado.

## 10. Proteção contra divergência do Drizzle

O modelo continua sendo a fonte das 62 tabelas. As peças que ele não expressa ficam em arquivos versionados: o complemento do arranque e as propostas 0071–0076.

`npm run db:push` agora chama `scripts/db-push-seguro.ts`. Esse caminho só cria o modelo num banco vazio, fora da porta 3306 e com outro nome. Banco que já tem tabela não recebe push. Se o Drizzle indicar perda de dados, a pergunta não é confirmada.

Uma instalação nova repete a mesma sequência: banco vazio, push do modelo, complemento, seis propostas, prontidão. Uma atualização futura não usa sincronização destrutiva no banco da fazenda. O journal antigo não foi reescrito para fingir que as propostas já tinham sido aplicadas.

## 11. Instância isolada da aplicação

- Código desta branch
- Porta `3017`
- `DATABASE_URL` só do MySQL descartável
- `FD_PRONTIDAO_DEFINITIVA=1`
- `NODE_ENV=production`
- OAuth e Forge com endereço vazio
- Segredo de sessão gerado na hora e não gravado
- A configuração do servidor oficial não foi editada

## 12. Resultado da inicialização

A aplicação conectou, passou a validação do modelo e a prontidão definitiva, e abriu o HTTP. `/api/health` respondeu ok.

## 13. Autenticação e sessões

Foi criado um titular artificial: `titular.ensaio.h4ch@exemplo.invalid`, papel principal, situação ativa. O login devolveu sessão. A consulta da sessão identificou o titular 1. A senha não foi registrada.

Nenhum usuário do banco de testes foi copiado.

## 14. Procedimento de criação do titular

O script `scripts/create-user.ts` grava o usuário local, mas não define papel nem o vínculo do titular consigo mesmo. Sem isso, o login recusa a entrada.

No banco vazio, o primeiro titular precisa nascer assim:

- login local
- papel `principal`
- `titularUserId` igual ao próprio id
- papel administrativo da conta
- situação `ativo`
- senha só no cofre de quem for operar, nunca no Git

Funcionário entra depois, com papel comum, `titularUserId` apontando para o titular, fazenda concedida em `usuario_fazendas` e permissão explícita. O principal não depende da tabela de fazendas.

Esse procedimento foi ensaiado só com identidades artificiais. O titular real continua esperando autorização e não foi criado no banco da fazenda.

## 15. Permissões

O titular criou a fazenda e a enxergou na lista.

O funcionário artificial, antes da concessão, recebeu “Sem permissão para esta operação de fazenda.”

Depois do vínculo da fazenda e da permissão `fazendas.visualizar`, a lista passou.

## 16. Fluxos operacionais testados

Pela API da instância isolada, com dados artificiais:

- Fazenda: criar, listar e atualizar
- Animal: criar, atualizar e listar
- Pessoa funcionário e fornecedor
- Lote
- Compra com recebimento de grupo não identificado, e listagem
- Reprodução: diagnóstico criado e listado
- Venda integrada à vista, por cabeça, e listagem
- Financeiro V2: conta caixa criada e listada
- Estoque: produto criado e listado
- Sêmen: entrada externa e listagem
- Máquina
- Abastecimento: criar e listar
- Manutenção: criar e listar

A confirmação de nutrição chegou na regra de saldo: “Saldo insuficiente para confirmar o fornecimento.” A estrutura de idempotência estava presente. Não havia quantidade no estoque, então o fornecimento não foi gravado. A listagem de nutrição abriu.

## 17. Testes de interface realizados

Nenhuma tela foi aberta. Não há ferramenta de navegador nesta sessão. O que foi visto foi a resposta HTTP da API, não o desenho da tela.

## 18. Testes não realizados

- Abertura visual das telas
- Entrada de quantidade no estoque e, por isso, a confirmação completa da nutrição
- Leitura de cocho gravada
- Estorno de recebimento de compra
- Exclusão física
- A regressão principal de 424 testes
- As suítes MySQL antigas de 84 testes

## 19. Limitações comerciais

Continuam fechadas:

- Venda por arroba. A confirmação antiga não grava enquanto a integração financeira está ligada. A confirmação integrada só aceita quilo ou cabeça. A arroba foi recusada antes de gravar.
- Estorno do recebimento de compras. Não foi implementado.
- Exclusões físicas consideradas inseguras. Não foram liberadas.

Nenhuma rota foi reaberta para aumentar a porcentagem homologada. O censo segue 252 rotas: 223 homologadas, 25 bloqueadas, 4 não aplicáveis.

## 20. Regressão

A regressão principal de 424 testes não foi reexecutada. O caminho padrão de arranque não chama a prontidão nova. A variável precisa estar ligada, e os testes que substituem o verificador continuam no comportamento anterior.

Foi reexecutado o teste de arranque que já existia, junto com os testes novos: 3 arquivos, 19 testes aprovados. Desses, 9 já faziam parte da suíte de arranque e não entram na conta de testes novos.

## 21. Testes novos

10 testes novos, todos aprovados:

- 4 em `server/pushDrizzleSeguro.test.ts`
- 6 em `server/prontidaoDefinitiva.isolado.test.ts`

## 22. Total acumulado

1.057 + 10 = **1.067** testes únicos aprovados acumulados.

Os 84 testes MySQL antigos não foram somados de novo.

## 23. Plano futuro de implantação

Não executar agora. A sequência, quando houver autorização explícita:

1. Backup novo e consistente do banco atual.
2. Restaurar esse backup num lugar isolado e conferir.
3. Manter `fazenda_digital` como arquivo dos testes. Não apagar.
4. Criar o banco novo só com autorização.
5. Criar a estrutura: modelo no banco vazio, complemento do arranque, propostas 0071–0076.
6. Rodar a prontidão com `FD_PRONTIDAO_DEFINITIVA=1`. Se falhar, não abrir o sistema.
7. Cadastrar o titular real, com autorização, pelo procedimento da seção 14.
8. Preparar a credencial da aplicação fora do Git.
9. Conferir permissões e a fazenda inicial.
10. Preparar o código desta linha, sem misturar com o servidor que está no ar.
11. Interromper as gravações de forma controlada.
12. Trocar a conexão só com autorização.
13. Subir a aplicação.
14. Repetir os testes operacionais mínimos.
15. Liberar os usuários.
16. Acompanhar o primeiro período.

## 24. Plano de recuperação

Antes da primeira gravação real: dá para interromper a entrada e voltar a conexão anterior. O banco antigo não terá sido modificado. Os usuários ainda não terão feito operação real.

Depois da primeira gravação real: não voltar automaticamente para o banco antigo. Os registros reais ficam. A recuperação usa backup, logs e a integridade do banco novo. Registro real não é descartado para retornar ao ambiente de teste.

## 25. Bloqueios restantes

- Venda por arroba
- Estorno do recebimento de compras
- Exclusões físicas inseguras
- Proposta 0077, opcional, fora do mínimo
- Proposta 0070, rejeitada
- Titular real ainda não autorizado
- Banco operacional novo ainda não autorizado

## 26. Arquivos modificados

- `auditoria/h4cg-estrategia-implantacao.md` (já existia, agora entra no commit)
- `auditoria/h4ch-banco-definitivo.md`
- `drizzle/complemento-restricoes-boot.sql`
- `package.json`
- `scripts/db-push-seguro.ts`
- `server/esquemaDefinitivo.ts`
- `server/prepareDatabaseBoot.ts`
- `server/prontidaoDefinitiva.ts`
- `server/prontidaoDefinitiva.isolado.test.ts`
- `server/pushDrizzleSeguro.ts`
- `server/pushDrizzleSeguro.test.ts`

O roteiro descartável do ensaio não entra no commit.

## 27. Commit local

Commit local nesta branch, acima de `d511b8b6f8b16981e9c700fbdfa382b929b0f549`. Sem push, sem merge, sem rebase.

O hash completo está na resposta desta fase, porque este arquivo faz parte do próprio commit.

## 28. Estado final do Git

A conferência do estado final fica logo após o commit e é registrada na resposta desta fase.

## 29. Confirmação de preservação do ambiente oficial

- Container `fazenda-digital-mysql` permaneceu na porta 3306, saudável, sem reinício.
- Porta 3000 não foi reiniciada por esta fase.
- Nenhum registro do banco da fazenda foi limpo ou apagado.
- O banco novo operacional não foi criado.
- O worktree oficial não recebeu estes arquivos.
- Não houve push, merge, reset, rebase nem implantação.

## 30. Próxima decisão necessária do proprietário

Autorizar, numa fase separada, três coisas que esta fase não fez:

1. Criar o banco novo da operação real.
2. Cadastrar o titular real.
3. Trocar a conexão da aplicação e reiniciar o servidor oficial, na janela combinada.

Enquanto essa autorização não existir, o banco da fazenda continua como está e o esquema definitivo fica demonstrado apenas no ensaio.
