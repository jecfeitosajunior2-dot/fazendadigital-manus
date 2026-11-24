# H4-CF — Cópia fiel e ensaio das nove migrações

Ensaio concluído em 23 de novembro de 2026, no worktree `fazenda-digital-h4k-cadastro-animal`, branch `feat/h4-rebanho-sanidade-estoque`.

A senha da conta de leitura foi redefinida. O privilégio não mudou. As nove migrações rodaram só numa cópia descartável. O banco da fazenda não recebeu migração, limpeza nem mudança de dado comercial.

**O ensaio na cópia foi aprovado.** Isso não autoriza aplicar as mesmas alterações no original.

## 1. Redefinição da senha

A conta conferida antes da troca era uma só: `fd_auditoria_ro@172.18.0.1`.

A sessão administrativa fez apenas `ALTER USER ... IDENTIFIED BY`. Não houve `GRANT`, `REVOKE`, usuário novo, troca de endereço, troca da senha de `root` nem da conta `fazenda`. O plugin de autenticação permaneceu o mesmo. A sessão administrativa foi encerrada em seguida e não leu registro comercial.

A primeira tentativa de guardar a senha falhou antes da troca. O arquivo incompleto foi apagado. A segunda tentativa gravou e conferiu a leitura de volta, e só então a senha foi aplicada.

## 2. Conta de auditoria

Depois da troca, a própria conta entrou e informou:

- Usuário: `fd_auditoria_ro@172.18.0.1`
- Banco: `fazenda_digital`
- Origem vista pelo MySQL: `172.18.0.1`
- Versão: 8.4.11

## 3. Privilégios efetivos

`SHOW GRANTS` na própria conta, antes e depois da senha:

- `USAGE` em `*.*`
- `SELECT` em `fazenda_digital.*`

Nada além disso. Não foi feito teste de escrita.

## 4. Armazenamento da credencial

A senha nova ficou fora do Git, em dois lugares do usuário local:

- Arquivo cifrado com DPAPI, em `AppData\Roaming\FazendaDigital\fd_auditoria_ro.dpapi`, com permissão só deste usuário.
- Gerenciador de Credenciais do Windows, alvo `FazendaDigital:fd_auditoria_ro`.

A senha não entrou no relatório, no repositório, em argumento de comando visível nem no histórico do PowerShell. A credencial foi conservada depois da limpeza do ensaio.

## 5. Autenticação

A entrada com a senha nova funcionou. Origem, banco e privilégio conferiram com o esperado.

## 6. Método de exportação

As 60 tabelas são InnoDB. Não há view, trigger, rotina nem event. Uma transação única, com leitura repetível e fotografia consistente, cobre o banco inteiro. O `SELECT` da conta de leitura basta. Não faltou privilégio.

O programa `mysqldump` existe só dentro do container. Dali a conexão aparece como `localhost`, e esta conta não aceita esse endereço. A cópia foi lida a partir desta máquina, na porta 3306, com `fd_auditoria_ro`, no mesmo tipo de fotografia que o `mysqldump --single-transaction` usa. `root` e a conta `fazenda` não exportaram dados.

Não houve alteração estrutural concorrente: a restauração reproduziu as 60 tabelas e todas as contagens da fotografia.

## 7. Integridade do backup

Arquivo temporário de 150.234 bytes. SHA-256 do arquivo: `725fecd9ecf12422c0800fb7b3d30eeb277a399052e0926e04b1e55734eb02a9`.

Conjunto de caracteres `utf8mb4`, collation `utf8mb4_0900_ai_ci`. O arquivo foi apagado depois da conferência. Não foi commitado nem enviado para fora.

## 8. Tabelas exportadas

60 tabelas, o mesmo número da H4-CD. A restauração devolveu 60 tabelas e a mesma contagem em cada uma.

## 9. Objetos estruturais

Na fotografia, antes das migrações: 921 colunas, 232 entradas de índice e 52 participações de chave estrangeira. Views: 0. Triggers: 0. Rotinas: 0. Events: 0. Tudo InnoDB.

A restauração limpa, feita de novo depois da falha simulada, repetiu esse mesmo resumo.

## 10. Restauração

Container `fd-h4cf-copia`, porta 3412, bancos `fd_h4cf_copia`, `fd_h4cf_falha` e `fd_h4cf_recupera`. Volume próprio. Sem ligação com o volume do MySQL da fazenda. Nenhuma integração externa foi acionada.

A primeira restauração bateu com a fotografia, tabela por tabela. As migrações só começaram depois disso.

## 11. Contagens anteriores

Medidas na cópia, antes das nove:

| Grupo | Linhas |
| --- | --- |
| Animais | 37 |
| Pesagens | 50 |
| Compras | 4 |
| Vendas | 7 |
| Títulos financeiros | 11 |
| Estoque | 24 |
| Movimentos de estoque | 61 |
| Máquinas | 5 |
| Manutenções | 6 |
| Abastecimentos | 9 |
| Reprodução | 76 |
| Partidas de sêmen | 1 |
| Fornecimentos | 3 |
| Batidas | 0 |
| Leituras de cocho | 2 |
| Benfeitorias | 7 |

Abastecimentos sem fazenda: 5. Brincos ativos repetidos na mesma fazenda: 0. Partidas repetidas: 0. A contagem foi feita na hora, na cópia, antes de criar índice.

A 0060 já estava presente: índice `manutencoes_chave_operacao_uq` com as duas colunas.

## 12. As nove migrações

Todas no banco `fd_h4cf_copia`. Nenhuma na porta 3306.

| Ordem | Arquivo | Resultado | Tempo |
| --- | --- | --- | --- |
| 0067 | Reprodução | concluída | 274 ms |
| 0068 | Entrada de sêmen | concluída | 159 ms |
| 0069 | Índice da partida | concluída | 554 ms |
| 0072 | Chave de estoque | concluída | 1.338 ms |
| 0071 | Brinco por fazenda | concluída | 943 ms |
| 0073 | Nutrição | concluída | 513 ms |
| 0074 | Leitura de cocho | concluída | 352 ms |
| 0075 | Fazenda da manutenção | concluída | 243 ms |
| 0076 | Chave do abastecimento | concluída | 313 ms |

A 0060 não foi reaplicada. A 0070 não foi aplicada. A 0077 não foi aplicada.

Cada arquivo foi conferido de novo depois de rodar. O estado `em_andamento` não foi aceito como fim.

## 13. Estruturas posteriores

Na cópia migrada:

- `reproducao_operacoes` e o índice único existem.
- `semen_entrada_operacoes` e o índice único existem.
- `semen_partidas_uq` existe, com as quatro colunas da identidade.
- `estoque_movimentacao_chaves` e `estoque_mov_chave_uq` existem.
- `animais.brinco_ativo_chave` existe, com `animais_brinco_ativo_fazenda_uq`.
- Fornecimento e batida têm `chaveOperacao`.
- A leitura de cocho tem `chaveOperacao`.
- `manutencoes.fazendaId` existe.
- `abastecimentos.chaveOperacao` existe.
- `conteudoOriginal` não existe.
- O índice da 0070 não existe.
- O índice da 0060 continua no lugar.

## 14. Contagens posteriores

Nenhuma tabela que já existia mudou de quantidade. As únicas tabelas novas são as de operação da reprodução, da entrada de sêmen, da chave de estoque e o livro do ensaio. Elas não substituem cadastro antigo.

## 15. Históricos

Os ensaios de duplicidade rodaram dentro de transação e foram desfeitos. A contagem de todas as tabelas da cópia migrada ficou igual antes e depois desses ensaios. Nenhum registro antigo foi apagado. Nenhuma titularidade foi trocada.

## 16. Cinco abastecimentos

Continuaram 5 abastecimentos sem fazenda depois da 0076. A fazenda da máquina não foi copiada. A chave nova desses registros antigos não foi preenchida.

## 17. Testes funcionais

Na cópia migrada, com desfazimento no fim:

- A mesma chave de reprodução foi recusada.
- A mesma chave de entrada de sêmen foi recusada.
- A mesma chave de estoque foi recusada.
- O mesmo brinco ativo na mesma fazenda foi recusado.
- O mesmo brinco em outra fazenda foi aceito.
- A mesma partida de sêmen foi recusada.
- A mesma chave de abastecimento foi recusada.
- A manutenção de ensaio ficou com fazenda nula.
- Fornecimento e leitura de cocho continuaram com a chave antiga vazia. O índice único dessas duas existe; o ensaio não gravou chave nelas.

Nenhum serviço externo foi chamado.

## 18. Regressões

Os 424 testes principais não foram repetidos. Nenhum código de rota ou regra comercial foi alterado. Os 84 testes MySQL antigos não entram de novo na conta.

## 19. Falhas

Não houve falha na cópia principal. A falha foi só a simulação, num segundo banco restaurado do mesmo arquivo.

## 20. Teste de recuperação

No banco `fd_h4cf_falha`, a primeira coluna da 0073 foi criada de propósito antes da sequência. O executor aplicou 0067, 0068, 0069, 0072 e 0071, parou na 0073 com estado `interrompida` e não criou a coluna da leitura de cocho. O livro guardou a interrupção. A sequência não continuou sozinha.

## 21. Restauração depois da falha

O banco parcial foi descartado. O mesmo arquivo foi restaurado em `fd_h4cf_recupera`. As contagens voltaram às da fotografia. O resumo de colunas, índices e chaves ficou idêntico ao da cópia antes das migrações. `reproducao_operacoes` não estava nessa restauração limpa. `ROLLBACK` não foi usado para desfazer estrutura.

## 22. Testes novos

Nenhum teste permanente foi adicionado. As conferências desta fase não entram como testes novos do conjunto acumulado.

## 23. Total acumulado

Permanece **1.057**.

## 24. Limpeza

Removidos nesta fase:

- O container `fd-h4cf-copia` e os três bancos de ensaio.
- O arquivo da cópia.

Conservados de propósito:

- A credencial cifrada da conta de leitura.
- A entrada no Gerenciador de Credenciais.
- O container `fazenda-digital-mysql` e o volume dele.
- Os bundles Git anteriores.

## 25. Arquivos modificados

- `auditoria/h4cf-ensaio-copia-real.md`

O executor, os SQL e o journal não foram editados.

## 26. Commit local

O commit deste relatório entra na branch isolada, com pai `19775e3fbbb4e7f1257a29bedb7d32598597e143`. Sem push.

## 27. Git

Antes deste relatório a árvore estava limpa em `19775e3`, 16 commits à frente da origem. O bundle `fazenda-digital-h4cf-historico.bundle` já continha esse commit. Sem merge, reset, rebase ou deploy.

## 28. Banco operacional

Preservado. A única mudança administrativa foi a senha de `fd_auditoria_ro@172.18.0.1`. Não houve SQL de estrutura nem de dado comercial na porta 3306. O container segue saudável, sem reinício. A porta 3000 não foi reiniciada. O projeto oficial não foi modificado.

## 29. Próxima ação

Parar aqui. As nove mudanças estão provadas na cópia, que já foi apagada. Aplicar isso no banco da fazenda precisa de uma autorização nova, só para o original, e de repetir a contagem de brinco e de partida na hora. Esta fase não inclui essa aplicação nem a implantação.
