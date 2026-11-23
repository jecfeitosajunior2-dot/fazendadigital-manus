# H4-BZ — Ensaio das migrações no MySQL descartável

Esquema reconstruído a partir do repositório. Compatibilidade com o banco operacional ainda não verificada.

Nada foi aplicado em `fazenda_digital`. O journal continua só com `0000_omniscient_jigsaw`. A rota `compras.desfazerRecebimento` continua bloqueada. A proposta 0070 não foi usada.

O ensaio rodou no MySQL 8.4.11, container `fd-h4bz-mig`, porta publicada 3408, banco `fd_h4bz`. O container foi removido ao final.

## 1. Arquivos reais

| Arquivo | Onde está | O que faz | Segunda execução |
| --- | --- | --- | --- |
| 0067 | `drizzle/migrations` | Cria `reproducao_operacoes` | Falha: tabela já existe. A primeira fica no lugar. |
| 0068 | `drizzle/migrations` | Cria `semen_entrada_operacoes` | Falha: tabela já existe. |
| 0069 | `drizzle/migrations` | Garante `semen_partidas_uq` em `semen_partidas` | Confere e sai. Não cria índice duplicado. |
| 0071 | `drizzle/propostas` | Coluna gerada `brinco_ativo_chave` e índice `animais_brinco_ativo_fazenda_uq` | Confere e sai. |
| 0072 | `drizzle/propostas` | Cria `estoque_movimentacao_chaves` | Confere o índice e sai. |
| 0073 | `drizzle/propostas` | `chaveOperacao` e `conteudoHash` em fornecimento e batida | Falha na coluna repetida. |
| 0074 | `drizzle/propostas` | `chaveOperacao` e `conteudoHash` em leitura de cocho | Falha na coluna repetida. |
| 0060 | `drizzle/migrations` | `manutencoes.chaveOperacao` e índice único | Falha na coluna repetida. |
| 0075 | `drizzle/propostas` | `manutencoes.fazendaId` nulo e índice | Falha na coluna repetida. |
| 0076 | `drizzle/propostas` | `abastecimentos.chaveOperacao` e índice único | Falha na coluna repetida. |
| 0077 | `drizzle/propostas` | `conteudoOriginal` em manutenção e abastecimento | Falha na coluna repetida. |

A 0069 não usa nenhuma estrutura da 0068. Ela olha `semen_partidas`, que já nasce com o índice na migração 0027 e no modelo do Drizzle.

## 2. Ordem que o ensaio seguiu

1. 0067 e 0068, tabelas novas, sem depender uma da outra.
2. 0069, só se `semen_partidas` já existir.
3. 0072, tabela nova.
4. 0071, depois de `animais` ter `userId`, `fazendaId`, `brinco` e `status`.
5. 0073, depois das tabelas de fornecimento e batida.
6. 0074, independente da 0073.
7. 0060, 0075 e 0076, colunas novas em tabelas que já existem.
8. 0077 por último. O SQL não exige a chave da 0060 nem da 0076, mas a fotografia só faz sentido depois delas.

Não aplicar índice antes da coluna. A 0071 cria a coluna e o índice no mesmo `ALTER` quando a coluna ainda não existe.

## 3. Journal

O journal do repositório isolado tem uma entrada: `0000_omniscient_jigsaw`. Os arquivos SQL existem e não estão aplicados por esse journal.

Estratégia futura: não empilhar esses arquivos no journal do Drizzle enquanto ele só conhece o 0000. `drizzle migrate` tentaria recriar o começo. O corte autorizado deve usar um livro próprio, com nome do arquivo e conferência do conteúdo, e recusar a segunda execução dos arquivos de uso único. Esse livro não foi criado nesta fase.

## 4. Esquema-base

A cadeia numérica não sobe sozinha. O `0000` cria o desenho antigo. O `0001` altera `fazendas`, e essa tabela não é criada em arquivo SQL nenhum. A primeira aplicação parou aí, com a tabela ausente. Os arquivos seguintes não foram forçados.

O esquema usado no ensaio veio do modelo atual, `drizzle/schema.ts`, enviado ao banco descartável. Nasceram 62 tabelas. Isso não é cópia do banco da fazenda.

## 5. Diferença entre o modelo e as propostas

O modelo já traz `reproducao_operacoes`, `semen_entrada_operacoes`, `manutencoes.chaveOperacao` e `semen_partidas_uq`.

O modelo ainda não traz:

- `animais.brinco_ativo_chave`
- `estoque_movimentacao_chaves`
- chave e resumo de fornecimento, batida e leitura
- `manutencoes.fazendaId`
- `abastecimentos.chaveOperacao`
- `conteudoOriginal`

Por isso a 0067, a 0068 e a 0060 falham se forem jogadas em cima do modelo sem antes retirar a estrutura. No ensaio, essas estruturas foram retiradas só na cópia `fd_h4bz_primeira`, e a primeira aplicação passou. No banco da fazenda isso não foi feito e não deve ser feito por este relatório.

## 6. Primeira aplicação

Todas as onze passaram na cópia limpa, nesta ordem, com o MySQL 8.4.11:

| Arquivo | Resultado | Tempo aproximado |
| --- | --- | --- |
| 0067 | tabela criada | 343 ms |
| 0068 | tabela criada | 396 ms |
| 0069 | índice já conferido, não criou outro | 386 ms |
| 0072 | tabela criada | 392 ms |
| 0071 | coluna e índice criados | 494 ms |
| 0073 | colunas e índices criados | 676 ms |
| 0074 | colunas e índice criados | 414 ms |
| 0060 | coluna e índice criados | 375 ms |
| 0075 | coluna e índice criados | 404 ms |
| 0076 | coluna e índice criados | 428 ms |
| 0077 | colunas criadas | 488 ms |

## 7. Duplicidade

Brinco ativo repetido na mesma fazenda, `abc` e ` ABC `. A 0071 recusou, listou os dois animais e não criou a coluna. Os dois registros continuaram.

Partida repetida, depois de retirar o índice só na cópia de ensaio. A 0069 recusou um grupo duplicado, listou as duas linhas e não criou o índice. As duas partidas continuaram.

Chave repetida, depois da 0073. Duas linhas com a mesma `chaveOperacao` foram recusadas. Duas linhas com chave nula conviveram.

OS antiga gravada com o usuário do funcionário. A 0075 deixou `fazendaId` nulo. A fazenda atual da máquina não foi copiada. O `userId` do funcionário permaneceu.

Nenhum registro foi escolhido como o verdadeiro. Nenhum foi apagado.

## 8. Estrutura pela metade

A coluna `chaveOperacao` foi colocada no fornecimento, sem o resumo e sem o índice. A 0073 parou no primeiro `ALTER`. A batida não ganhou coluna. O índice não nasceu. Rodar o arquivo de novo não completa o que faltou.

Cada `ALTER` do MySQL se confirma sozinho. Se a luz cair entre um comando e outro, o banco fica no meio. A recuperação é restaurar a cópia conferida, não inventar um reparo automático.

O índice `semen_partidas_uq` já estava no modelo e não está no journal. A 0069 reconheceu o índice e não criou outro.

## 9. Testes MySQL antigos

Os oito arquivos `*.mysql.test.ts` apontaram para a porta 3408. Em paralelo, o preparo compartilhado engoliu o erro e vários arquivos foram ignorados. Em fila, o preparo abriu.

Aprovados em fila: saúde 8, manutenção completa 9, oficina 8, manutenção com estoque 10, capital 6, transferência 6, e a parte do financeiro e da compra de insumos que não depende da consulta nova. No total da fila: 62 aprovados e 13 reprovados.

Os 13 reprovados pedem o escopo autorizado da consulta financeira. O serviço atual recusa sem esse escopo. A expectativa antiga não foi alterada. Isso é diferença de comportamento, não tabela faltando.

Dois fechamentos de suíte esperavam 3 contas e 8 movimentos legados. O esquema reconstruído está vazio. A contagem deu 0. Não foi inventado dado antigo para a conta fechar.

O importador local, em funções puras, teve 8 aprovados. Ele não abre banco.

Ignorados não entram como aprovados. Estes testes antigos não entram de novo no acumulado de 1.024.

## 10. Matriz

Situação operacional de todas as linhas: **NÃO VERIFICADO NO OPERACIONAL.**

| Estrutura | Arquivo | Depende de | Pré-verificação | Descartável | Risco histórico | Autorização |
| --- | --- | --- | --- | --- | --- | --- |
| Estação e cobertura | 0067 | nenhuma tabela antiga | tabela ausente | criada | não mexe no lançamento antigo | sim, no corte |
| Entrada de sêmen | 0068 | partida já existente, não da 0067 | tabela ausente | criada | não mexe na partida antiga | sim |
| Índice da partida | 0069 | `semen_partidas` | duplicata e coluna nula | conferido; recusa duplicata | não funde partida | sim, depois da lista |
| Chave do estoque | 0072 | nenhuma | índice com as duas colunas | criada | não apaga saldo | sim |
| Brinco ativo por fazenda | 0071 | animais | brinco ativo repetido | criada; recusa repetido | não escolhe qual animal fica | sim, depois da lista |
| Chave da nutrição | 0073 | fornecimento e batida | coluna já pela metade | criada; segunda falha | chave antiga fica nula | sim |
| Chave da leitura | 0074 | leitura de cocho | independente da 0073 | criada; segunda falha | leitura antiga fica nula | sim |
| Chave da OS | 0060 | manutenções | coluna ausente | criada no modelo e no ensaio | OS antiga fica com chave nula | sim |
| Fazenda da época | 0075 | manutenções | não copiar a fazenda da máquina | criada; nulo permanece | histórico sem fazenda | sim |
| Chave do abastecimento | 0076 | abastecimentos | coluna ausente | criada | lançamento antigo fica nulo | sim |
| Fotografia | 0077 | as duas tabelas | depois da chave, no plano | criada | não preenche com o valor de hoje | sim, pode esperar |

## 11. Backup futuro

1. Parar as gravações da fazenda.
2. Gerar um backup consistente do MySQL.
3. Conferir o arquivo e o tamanho.
4. Restaurar em outra cópia, nunca por cima do operacional na primeira vez.
5. Conferir tabelas, uma amostra de animais, compras, vendas e títulos.
6. Anotar o ponto de recuperação antes de qualquer arquivo novo.

Este backup não foi executado.

## 12. Rollback futuro

O `ALTER` e o `CREATE` do MySQL não desfazem com `ROLLBACK`. Se um arquivo falhar no meio, o que já passou permanece.

Interromper quando a pré-verificação achar duplicata, coluna pela metade ou versão diferente de 8. Restaurar a cópia conferida. Não soltar o aplicativo novo em cima do esquema antigo, nem o aplicativo antigo em cima de uma coluna que ele não conhece. A janela é sem gravação. Entre um arquivo e outro, se houver falha, parar e restaurar. Não apagar duplicata para “passar”.

## 13. Histórico

Há lançamento que pode estar no `userId` do funcionário. O ensaio deixou esse número como estava. Não se descobre o dono pelo nome. Não se descobre a fazenda da época pela fazenda atual da máquina ou do animal.

Quando houver autorização, a lista sai de uma cópia restaurada: usuário que não é o principal, manutenção com fazenda nula, brinco ativo repetido, partida repetida. A lista não escolhe vencedor e não apaga linha. Esvaziar o banco para começar a operação é outra decisão, com autorização própria. Não há script de limpeza.

## 14. Estorno de compra, só no papel

A rota continua bloqueada. O serviço que apaga o animal continua desligado.

Para um estorno futuro, sem fazer isso agora:

- O recebimento precisa estar `confirmado` e passar a `estornado` uma vez só.
- Falta uma situação do animal que tire a entrada do rebanho sem apagar a linha. Ela não foi criada.
- A vaga do grupo só volta se o animal deixar de contar na compra. Tirar o `compraId` não serve: some a origem.
- A pesagem e a movimentação de entrada permanecem, com o recebimento que as criou.
- Venda, morte, transferência, pesagem posterior, manejo, sanidade e reprodução impedem o estorno.
- A trava do animal tem de ser a mesma usada por essas operações.
- O recebimento do animal não cria título. Pagamento confirmado da compra não se cancela daqui.
- Dois cliques não podem estornar duas vezes.

## 15. Inventário

252 rotas. 223 homologadas. 25 bloqueadas. 0 parciais. 0 legadas. 4 não aplicáveis. Nenhuma rota mudou de classe porque o ensaio passou no descartável.
