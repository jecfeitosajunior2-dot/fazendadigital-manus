# H4-CE — Preparação das migrações

Ensaio feito em 23 de novembro de 2026, no worktree `fazenda-digital-h4k-cadastro-animal`, branch `feat/h4-rebanho-sanidade-estoque`.

O banco da fazenda não recebeu migração. Nenhuma cópia completa dos dados foi gerada. O container de ensaio `fd-h4ce-ensaio` foi removido ao final. Permanece só `fazenda-digital-mysql` na porta 3306.

A base desta fase é a leitura da H4-CD, em `auditoria/h4cd-diagnostico-operacional.md`. O ponto de partida do Git é `c4fe81ae606bdbd0f898e336872dfc927b002633`.

## 1. Diagnóstico estrutural utilizado

Leitura operacional já feita, só consulta:

- MySQL 8.4.11, banco `fazenda_digital`, porta 3306, container `fazenda-digital-mysql`.
- 60 tabelas no banco, 62 no modelo. Faltam apenas `reproducao_operacoes` e `semen_entrada_operacoes`.
- Não há tabela extra.
- A tabela `__drizzle_migrations` não existe. O journal do repositório continua só com `0000_omniscient_jigsaw`.
- A comparação cobre as onze peças pedidas, a lista de tabelas e as chaves estrangeiras. Não é uma conferência coluna a coluna das 60 tabelas.

Fotografia usada, sem tratar ausência como migração interrompida:

| Peça | Leitura da fazenda |
| --- | --- |
| 0060 | Compatível. Coluna e índice único já existem. 0 grupos de chave repetida. |
| 0067 | Tabela ausente. |
| 0068 | Tabela ausente. |
| 0069 | Identidade da partida presente e sem nulo. Índice `semen_partidas_uq` ausente. 0 grupos. |
| 0071 | Tabela `animais` presente. Coluna gerada e índice por fazenda ausentes. Índice da 0070 ausente. 0 grupos de brinco ativo. |
| 0072 | Tabela ausente. |
| 0073 | Fornecimento e batida presentes. Chave, resumo e índices ausentes. Não é uma 0073 parada no meio. |
| 0074 | Leitura de cocho presente. Chave, resumo e índice ausentes. |
| 0075 | `manutencoes.fazendaId` ausente. |
| 0076 | `abastecimentos.chaveOperacao` e o índice ausentes. |
| 0077 | `conteudoOriginal` ausente nas duas tabelas. |

Nenhuma peça conferida estava incompatível.

## 2. Migração 0060 dispensada

A 0060 não entra no executor. O arquivo permanece no repositório e não foi reaplicado. O journal operacional não foi alterado para fingir essa aplicação.

No ensaio, a manutenção artificial já nasceu com `chaveOperacao` e com `manutencoes_chave_operacao_uq (userId, chaveOperacao)`. Depois das nove, o índice continuava com as duas colunas.

## 3. Proposta 0070 rejeitada

A 0070 continua rejeitada. O executor recusa o arquivo e não cria `animais_user_brinco_ativo_uq`. A 0071 também recusa seguir se esse índice aparecer.

## 4. Proposta 0077 opcional

A 0077 guardaria o retrato do primeiro pedido de manutenção e de abastecimento, para o reenvio continuar batendo depois de uma edição. Nos cenários já homologados ela não se mostrou necessária para impedir lançamento econômico duplicado.

Fica fora do conjunto mínimo. O executor recusa o arquivo. No ensaio, `conteudoOriginal` continuou ausente.

## 5. Nove alterações potencialmente necessárias

1. `0067_reproducao_operacoes.sql` — cria `reproducao_operacoes` e o único `(userId, chave)`.
2. `0068_semen_entrada_operacoes.sql` — cria `semen_entrada_operacoes` e o único `(userId, chave)`.
3. `0069_semen_partidas_indice_unico.sql` — cria `semen_partidas_uq` se a identidade estiver limpa.
4. `0072_estoque_movimentacao_chaves.sql` — cria `estoque_movimentacao_chaves` e o único `(titular_user_id, chave)`.
5. `0071_animais_brinco_ativo_fazenda_uq.sql` — cria a coluna gerada e o único por fazenda.
6. `0073_nutricao_idempotencia.sql` — chave e resumo em fornecimento e batida, com um único em cada tabela.
7. `0074_nutricao_leitura_idempotencia.sql` — chave e resumo na leitura de cocho, com um único.
8. `0075_manutencao_fazenda.sql` — `manutencoes.fazendaId` nulo e índice comum `(userId, fazendaId)`.
9. `0076_abastecimento_chave_operacao.sql` — `abastecimentos.chaveOperacao` nulo e único `(userId, chaveOperacao)`.

## 6. Ordem confirmada

A ordem do ensaio foi 0067, 0068, 0069, 0072, 0071, 0073, 0074, 0075, 0076.

A numeração sozinha não é dependência. A leitura dos arquivos mostra que nenhuma das nove consome estrutura criada por outra das nove:

- 0068 não exige a 0067 nem o índice da partida. O comentário cita `semen_partidas_uq`; o SQL não usa esse índice.
- 0069 não exige a 0068.
- 0072 não exige as anteriores.
- 0071 não exige a 0072. Exige as colunas já existentes do animal e recusa a 0070.
- 0074 não exige a 0073.
- 0075 não exige a 0074 e não copia fazenda da máquina.
- 0076 não exige a 0075 e não preenche fazenda, custo nem quantidade.

A ordem foi mantida porque é segura. Pode parar no primeiro arquivo que não conclui, sem deixar um arquivo seguinte dependendo de um anterior pela metade.

## 7. Pré-verificações

A pré-verificação ocorre antes do primeiro comando estrutural. Se a decisão não for aplicar, o SQL não roda.

| Arquivo | Exige antes | Ausente na fazenda | Interrompe se |
| --- | --- | --- | --- |
| 0067 | Nada além do MySQL descartável | Tabela e índice | A tabela existe sem o único `(userId, chave)` |
| 0068 | Nada da 0067 | Tabela e índice | A tabela existe sem o único `(userId, chave)` |
| 0069 | `semen_partidas` com `user_id`, `fazenda_id`, `reprodutor_key`, `partida`, todas NOT NULL | `semen_partidas_uq` | Nulo na identidade, grupo duplicado, ou índice de outro formato |
| 0072 | Nada | Tabela e `estoque_mov_chave_uq` | Tabela presente com índice diferente |
| 0071 | `animais.userId`, `fazendaId`, `brinco`, `status` | `brinco_ativo_chave` e `animais_brinco_ativo_fazenda_uq` | Índice da 0070, brinco ativo repetido na mesma fazenda, coluna gerada diferente, índice de outro formato |
| 0073 | `nutricao_fornecimentos` e `nutricao_batidas` | As duas colunas e os dois únicos | Mistura de peça presente e ausente, tipo diferente, ou chave não nula repetida |
| 0074 | `nutricao_cocho_leituras` | As duas colunas e o único | Mistura ou índice diferente de `(userId, chaveOperacao)` |
| 0075 | `manutencoes` | `fazendaId` int nulo e índice comum | Coluna de outro tipo, ou índice único no lugar do índice comum |
| 0076 | `abastecimentos` | `chaveOperacao` varchar(80) nulo e único | Coluna de outro tipo, ou índice com outro nome de colunas ou sem unicidade |

Índice compatível significa o mesmo nome, a mesma ordem de colunas e a mesma regra de único ou comum. Nome igual com outra forma é incompatível.

Estrutura já completa, sem linha concluída no livro, é registrada como concluída e o arquivo não roda de novo.

## 8. Aplicação no descartável

Container `fd-h4ce-ensaio`, imagem `mysql:8.4`, porta do host 3411, banco de ensaio `fd_h4ce_nove`. A porta 3306 não entrou nos testes. A conta `fd_auditoria_ro` não foi usada.

O esquema de ensaio não é cópia da fazenda. Ele separa quatro coisas:

- Comprovado pela leitura: as peças novas estão ausentes; a 0060 já cabe; a 0070 não está; a base de partida, animal, nutrição, manutenção e abastecimento existe.
- Reconstruído por inferência: só as colunas que estes arquivos tocam. A fazenda não teve comparação coluna a coluna das 60 tabelas.
- Artificial: uma manutenção com chave nula e cinco abastecimentos com fazenda nula. No caminho limpo, um brinco ativo distinto e uma partida distinta.
- Limitação: não há saldo, custo, compra, venda nem o restante das colunas reais.

Os arquivos com `DELIMITER` (0069, 0071 e 0072) foram pelo cliente `mysql` do container descartável, só depois da pré-verificação. Os outros foram comando a comando. O nome `fazenda-digital-mysql` é recusado.

## 9. Resultado por arquivo

Caminho limpo, conferido de novo depois de cada arquivo. Os nove ficaram `concluida`. A segunda rodada ficou `repetida` e o SQL não rodou outra vez. O livro permaneceu com nove linhas concluídas.

| Arquivo | SHA-256 | Dependência real | Resultado no caminho limpo |
| --- | --- | --- | --- |
| 0067 | `3a219ec09b9157b0321b214fa8b8e1f6559810077b8ebc5e9ddab2d0d3d52927` | Nenhuma | Concluída. Repetição não recria a tabela. |
| 0068 | `6e61ee00056c1f1dd20c65be7ed6ded648808ed086640a1d259d3c3b83fc3cd6` | Não depende da 0067 | Concluída. |
| 0069 | `d5bf1ce6ec2fefe685e86c7b29779d47efcf2c48d75576da019cbc26908ea32f` | Identidade sem nulo e sem grupo repetido | Concluída no caminho limpo. Duplicidade interrompe. |
| 0072 | `b62885f30bb422ee6ff8a7a289106d450f7a262af07f265d999ae14bb73437d8` | Nenhuma | Concluída. |
| 0071 | `4c5542e41c525828d78c1d6eab2396e4c8baf859b06a37e9ace9fa7b9c69884e` | Colunas do animal. Recusa a 0070. | Concluída no caminho limpo. Duplicidade interrompe. |
| 0073 | `4b996048788d5657fe12624102b1e743438eadabb07b270d670c9eaad716cf18` | As duas tabelas de nutrição | Concluída no caminho limpo. Metade interrompe o conjunto. |
| 0074 | `3d1293bf7ba8f28454af1901517bfe75d3cdec83d77ef7c8f057d0c7414e64d2` | Tabela de leitura. Não depende da 0073. | Concluída no caminho limpo. Não chegou a rodar quando a 0073 parou. |
| 0075 | `479ba68b4e8a3d5fc858ba871d3bff1ea20654a8123ad5a6deb2d5d4dfad7ff7` | Tabela `manutencoes` | Concluída. A linha antiga ficou com fazenda nula. |
| 0076 | `77f34c8b27623d4488691a2a881d0d659b800f4f92a1a2181ba3b1cdda1e05b0` | Tabela `abastecimentos` | Concluída no caminho limpo. Índice incompatível interrompe. |

Hashes de referência, fora do mínimo:

- 0060 `74c5ce3b1b19f8e30b531bb04e002d0ec3b0ab26810edbdeb90afcf283714f77` — dispensada.
- 0070 `15b432f3e99d4f0a7a939ef727df813b0539291ba10da8c4ec029b70dc15b5ea` — rejeitada.
- 0077 `76a55e56f91cfd55aaf46fe9f030acaa0f4e86232a4051e43a40b820b38c624b` — opcional.

Testes do arquivo: `server/executorNovePropostas.isolado.test.ts`. Oito testes novos, todos aprovados.

## 10. Estruturas anteriores e posteriores

No ensaio, antes das nove:

- Sem `reproducao_operacoes`, `semen_entrada_operacoes` e `estoque_movimentacao_chaves`.
- `semen_partidas` sem `semen_partidas_uq`.
- `animais` sem `brinco_ativo_chave` e sem os índices da 0070 e da 0071.
- Nutrição sem chave e sem resumo.
- `manutencoes` com a 0060 e sem `fazendaId`.
- `abastecimentos` sem `chaveOperacao`.
- Sem `conteudoOriginal`.

Depois do caminho limpo, a conferência viu a estrutura completa das nove. Continuaram ausentes a coluna da 0077 e o índice da 0070. A 0060 continuou no lugar.

## 11. Duplicidades

Fotografia da fazenda, preservada e não remedida nesta fase:

- Brinco ativo na mesma fazenda: 0 grupos.
- Partida de sêmen: 0 grupos.
- Chave de manutenção: 0 grupos.
- Chave de abastecimento e chave de estoque: não contadas, porque a estrutura não existia.

No ensaio limpo, os dados artificiais também nasceram sem grupo repetido. A repetição foi plantada só nos testes de recusa.

Antes de uma aplicação futura, a contagem de brinco e de partida precisa ser feita de novo. O zero de hoje pode mudar.

## 12. Dados históricos

A fazenda tem cinco abastecimentos sem fazenda. Eles não foram preenchidos e a fazenda da máquina não foi usada como palpite.

No ensaio, os cinco abastecimentos artificiais continuaram com fazenda nula e com chave nula depois da 0076. A manutenção antiga continuou com fazenda nula depois da 0075.

Nenhuma limpeza foi feita. A decisão de preservar ou limpar esses cinco registros fica para outra autorização. Manutenções sem fazenda na fazenda continuam não verificadas, porque a coluna ainda não existe lá.

## 13. Controle de execução

Um livro só, o mesmo `fd_livro_propostas` da H4-CA. Não há nove controles separados. O `aplicar0073` antigo não foi modificado.

Colunas: arquivo, hash, dependências, estado, pré-verificação, início, conclusão, erro, estado posterior e último comando.

Estados usados: `em_andamento`, `concluida`, `interrompida`. `em_andamento` não é sucesso. Conclusão só depois de a estrutura conferir de novo.

O executor não tem opção de escrita operacional. Recusa porta 3306, banco `fazenda_digital`, container `fazenda-digital-mysql`, host diferente de `127.0.0.1` e usuário `fd_auditoria_ro`.

## 14. Falhas parciais

Ensaiadas no descartável:

- Arquivo já concluído no livro: a segunda rodada volta `repetida` e não executa o SQL.
- Coluna parcial da 0073: o conjunto para na 0073. Batida e leitura de cocho ficam sem a coluna nova.
- Índice da 0076 com o nome certo e a forma errada: para, e a coluna não é criada.
- Duas partidas iguais: a 0069 para e as duas linhas ficam.
- Dois brincos ativos iguais na mesma fazenda: a 0071 para, os dois animais ficam e a coluna gerada não nasce.
- Porta 9: a conexão falha antes de concluir o livro.
- Destino da fazenda e conta de auditoria: recusa antes de escrever.

O conjunto não segue para o arquivo seguinte quando o atual não fica `concluida` nem `repetida`.

## 15. Recuperação

`ALTER` e `CREATE` gravam na hora. `ROLLBACK` não desfaz esse tipo de comando.

Se um arquivo falhar no meio:

1. Parar. Não chamar o próximo arquivo.
2. Guardar a linha do livro, com erro e último comando. `em_andamento` ou `interrompida` não autoriza continuar.
3. Não rodar o mesmo arquivo de novo só porque ele existe. A pré-verificação decide.
4. Para um ensaio posterior, restaurar um backup conferido numa cópia nova e descartável.
5. Não restaurar nada por cima do banco da fazenda.

A 0073 pela metade é o caso já visto: a primeira coluna pode existir e o restante não. A retomada correta é restaurar a cópia, não seguir do comando seguinte.

## 16. Testes funcionais

No caminho limpo, depois da estrutura conferida:

- A mesma chave de reprodução no mesmo titular gera duplicidade.
- A mesma chave de entrada de sêmen no mesmo titular gera duplicidade.
- A mesma identidade de partida gera duplicidade.
- O mesmo brinco ativo na mesma fazenda gera duplicidade.
- O mesmo brinco ativo em outra fazenda é aceito.
- Os cinco abastecimentos seguem sem fazenda e sem chave.
- A manutenção antiga segue sem fazenda.
- A 0077 não aparece.

Não houve nova auditoria completa de reprodução, sêmen, brinco, estoque, nutrição, cocho, manutenção ou abastecimento. A tela não foi aberta: esta fase não mudou página, rota nem estado do cliente. A prova foi o MySQL descartável.

## 17. Regressão

A regressão principal de 424 testes não foi repetida. O executor novo não entra nas rotas e não muda regra comercial. Os 39 arquivos da regressão principal não foram alterados.

Os 84 testes MySQL da rodada paralela da H4-CA não foram rodados de novo e não entram na conta.

## 18. Novos testes

Oito testes novos, todos aprovados em `server/executorNovePropostas.isolado.test.ts`:

1. Nove arquivos no esquema observado, histórico artificial preservado, segunda rodada repetida.
2. 0073 pela metade interrompe o conjunto.
3. Índice incompatível de abastecimento.
4. Partida duplicada.
5. Brinco ativo duplicado.
6. Conexão na porta 9.
7. Porta 3306, banco da fazenda, container operacional e conta de auditoria.
8. 0060, 0070 e 0077 recusadas.

## 19. Total acumulado

A base única continua 1.049. Estes oito são novos. O acumulado único fica em **1.057**.

Ignorado não é aprovado. Nenhum módulo foi declarado verde. O censo de 252 rotas não foi reaberto. `compras.desfazerRecebimento` continua bloqueada.

## 20. Limitações do ensaio

- O banco descartável não é a fazenda e não é uma cópia fiel.
- As colunas de apoio foram inferidas. O restante de cada tabela real não foi reproduzido.
- Os cinco abastecimentos sem fazenda do ensaio são artificiais, no mesmo número da leitura.
- O zero de duplicidade do ensaio foi plantado. O zero da fazenda é a fotografia da H4-CD e pode mudar.
- O livro existe só no descartável. A fazenda não recebeu `fd_livro_propostas`.
- Comando estrutural não volta atrás com transação.

## 21. Procedimento de cópia fiel

Não executado nesta fase. A autorização anterior cobriu consulta estrutural e contagem, não a exportação dos registros.

Quando houver autorização específica, o caminho previsto é:

1. Backup com `mysqldump` em transação única do InnoDB (`--single-transaction`), sem o esquema de sistema do MySQL e sem rotina que peça privilégio novo. O arquivo fica fora do Git.
2. Consistência: o instantâneo do InnoDB no momento do dump. Não escrever no original durante a extração se a autorização assim exigir.
3. Proteção do arquivo: pasta local restrita, fora do repositório, sem senha no nome e sem incluir o arquivo em commit.
4. Restauração num container novo, em porta diferente de 3306, com nome de container diferente de `fazenda-digital-mysql`.
5. O banco restaurado precisa de um nome diferente de `fazenda_digital`. O executor recusa esse nome em qualquer porta, para não haver confusão com o original.
6. Preservar a estrutura observada. Não usar sincronização integral do Drizzle por cima da cópia.
7. Validar contagens: 60 tabelas, as duas tabelas ainda ausentes, cinco abastecimentos sem fazenda, e a contagem nova de brinco e de partida imediatamente antes da 0071 e da 0069.
8. Credencial só na memória da sessão. Não gravar senha no repositório nem neste relatório.
9. Depois da autorização de encerramento, apagar o arquivo de backup e remover o container descartável. O original permanece.

## 22. Autorizações ainda necessárias

Antes de migrar uma cópia real, falta autorização expressa para:

- gerar a cópia;
- guardá-la por tempo limitado;
- restaurá-la no ambiente isolado;
- executar as nove alterações só nessa cópia.

Essa autorização não inclui aplicar nada no banco original.

Também ficam em aberto, e fora desta fase:

- repetir a contagem de duplicidade na hora da aplicação;
- decidir o que fazer com os cinco abastecimentos sem fazenda, sem preenchimento automático;
- decidir a 0077 à parte, se um dia ela entrar;
- definir outra senha da conta de auditoria, se uma leitura nova for necessária, sem ampliar o `GRANT`.

## 23. Arquivos modificados

- `server/executorNovePropostas.ts`
- `server/executorNovePropostas.isolado.test.ts`
- `auditoria/h4ce-preparacao-migracoes.md`

Nenhum SQL de migração foi editado. O journal não foi editado. O projeto oficial, no worktree `Fazenda Digital` e no commit `1f2dfe9`, não foi modificado.

## 24. Commit local

O commit desta fase entra depois deste relatório, na branch `feat/h4-rebanho-sanidade-estoque`, com pai `c4fe81ae`. Não há push.

## 25. Estado do Git

Antes do commit desta fase: `c4fe81ae`, branch 14 commits à frente da origem, sem push. O bundle novo, gerado depois do commit, passa a incluir `c4fe81ae` e o commit desta fase. Os bundles anteriores permanecem.

Não houve merge, reset, rebase nem deploy.

## 26. Próxima etapa recomendada

Parar aqui. O próximo passo útil é a autorização da cópia fiel, seguida do ensaio das mesmas nove alterações só nessa cópia, com a contagem de duplicidade repetida na hora. A 0060 continua de fora. A 0077 continua opcional. A 0070 continua rejeitada. O original continua intacto.

## 27. Preservação do ambiente oficial

- Nenhuma migração no banco `fazenda_digital`.
- Nenhuma exportação completa.
- Nenhum registro apagado ou preenchido.
- Nenhum usuário MySQL criado ou alterado nesta fase.
- Nenhum serviço reiniciado.
- A porta 3000 não foi reiniciada.
- O container `fazenda-digital-mysql` segue na porta 3306.
- O container `fd-h4ce-ensaio` foi removido.
- O worktree oficial permanece em `1f2dfe9`, branch `cursor/at05-web-serial-poc`.
