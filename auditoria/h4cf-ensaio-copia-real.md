# H4-CF — Cópia fiel do MySQL operacional

Ensaio de 23 de novembro de 2026, no worktree `fazenda-digital-h4k-cadastro-animal`, branch `feat/h4-rebanho-sanidade-estoque`.

**A fase não está aprovada.** A cópia não foi gerada. Nenhuma migração rodou, nem na fazenda nem num descartável.

O motivo é a credencial. A conta `fd_auditoria_ro` existe, com leitura apenas, mas a senha da H4-CD não foi guardada. Esta fase não redefine senha e não troca para `root` nem para a conta `fazenda`.

## Conferência antes de qualquer acesso

| Conferência | Resultado |
| --- | --- |
| Branch | `feat/h4-rebanho-sanidade-estoque` |
| Commit | `474010e6e568c447c7ffbfbeea606f4a17397532` |
| Pai | `c4fe81ae606bdbd0f898e336872dfc927b002633` |
| Árvore | limpa, 15 commits à frente da origem, sem push |
| Bundle | `C:\Users\Pedro Neto\Documents\fazenda-digital-h4ce-historico.bundle`, histórico completo, ponta `474010e` |
| H4-CD | `auditoria/h4cd-diagnostico-operacional.md` |
| H4-CE | `auditoria/h4ce-preparacao-migracoes.md` |
| Containers | só `fazenda-digital-mysql`, porta 3306, saudável |

O projeto oficial, worktree `Fazenda Digital` no commit `1f2dfe9`, não foi modificado. A porta 3000 não foi reiniciada. O container operacional não foi reiniciado.

## 1. Banco de origem

MySQL 8.4.11, container `fazenda-digital-mysql`, porta 3306, banco `fazenda_digital`. Identidade registrada na H4-CD. Nesta fase não houve nova conexão.

## 2. Conta utilizada

Nenhuma. A conta prevista era `fd_auditoria_ro@172.18.0.1`. Sem a senha, a sessão nem abriu.

## 3. Privilégios

O que a própria conta mostrou na H4-CD, e que esta fase não mediu de novo:

- `USAGE` em `*.*`.
- `SELECT` em `fazenda_digital.*`.

Sem `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP` e sem `GRANT OPTION`.

Uma exportação fiel ainda pode pedir, se o banco tiver esses objetos: `SHOW VIEW` para views, `TRIGGER` para triggers, `EVENT` para events e `SHOW_ROUTINE` para rotinas. Isso não foi conferido agora, porque a autenticação não ocorreu. Não houve `GRANT` novo.

## 4. Método de exportação

Não executado. O método previsto continua sendo `mysqldump` com transação única, só leitura, arquivo fora do Git. Ele não chegou a ser chamado.

## 5. Consistência do backup

Não há backup desta fase. Sem arquivo, não há consistência para declarar. A versão, o mecanismo de cada tabela, views, triggers, rotinas e events ficaram sem nova medição.

## 6. Integridade do arquivo

Não há arquivo. Nada foi enviado para fora da máquina. Nada foi commitado como dump.

## 7. Tabelas exportadas

Nenhuma. A referência da H4-CD segue sendo 60 tabelas. Esta fase não substituiu essa contagem por uma conferência nova.

## 8. Objetos estruturais incluídos

Nenhum. A H4-CD viu 50 chaves estrangeiras e não listou views, triggers, rotinas nem events. Sem login, esta fase não completa essa lista.

## 9. Ambiente descartável

Não criado. Não houve container novo, porta nova, banco novo nem credencial de ensaio.

## 10. Resultado da restauração

Não restaurado. O banco original não foi substituído.

## 11. Contagens anteriores

Não medidas nesta fase. A fotografia da H4-CD permanece: cinco abastecimentos sem fazenda, zero grupos de brinco ativo, zero grupos de partida de sêmen. Esses números não foram recontados hoje.

## 12. Estruturas anteriores

As da H4-CD, sem nova leitura. A 0060 compatível, a 0070 ausente, a 0077 ausente, e as nove peças do conjunto mínimo ainda por aplicar. O journal operacional não foi aberto nem alterado.

## 13. Resultado de cada migração

Nenhuma das nove rodou. A 0060 não foi reaplicada. A 0070 não foi aplicada. A 0077 ficou de fora.

## 14. Livro de aplicação

Não criado. `fd_livro_propostas` não foi escrito em lugar nenhum nesta fase.

## 15. Estruturas posteriores

Iguais às anteriores, porque não houve `ALTER`.

## 16. Contagens posteriores

Não há cópia migrada para comparar.

## 17. Integridade histórica

Nenhum registro comercial foi lido em detalhe, alterado ou apagado.

## 18. Cinco abastecimentos

Continuam sem fazenda, pelo que a H4-CD viu. Nada foi preenchido e a fazenda da máquina não foi copiada.

## 19. Duplicidades

Não recontadas. O ensaio não usou o zero antigo como autorização para criar índice.

## 20. Testes funcionais

Não executados. Reprodução, sêmen, brinco, estoque, nutrição, cocho, manutenção e abastecimento não foram exercitados sobre uma cópia.

## 21. Regressões

Não executadas. Os 424 testes principais e os 84 testes MySQL antigos não entram de novo na conta.

## 22. Testes novos

Nenhum.

## 23. Total único

Permanece **1.057**. Nada foi somado nesta fase.

## 24. Simulação de falha

Não feita. Não houve sequência de migração para interromper.

## 25. Recuperação

Não demonstrada. Não houve banco parcial para descartar nem backup para restaurar.

## 26. Diferenças identificadas

A diferença que impede a fase é operacional, não estrutural: a senha de `fd_auditoria_ro` não está disponível. O relatório da H4-CD já dizia que ela ficou só na memória daquela sessão.

## 27. Bloqueios restantes

- Exportar sem senha da conta de leitura.
- Conferir de novo privilégios, engines e objetos extras.
- Saber se o `SELECT` atual basta para uma cópia integral.
- Restaurar e migrar só depois dessa cópia existir e conferir.

O executor da H4-CE continua recusando porta 3306, banco `fazenda_digital`, container `fazenda-digital-mysql` e o usuário `fd_auditoria_ro`.

## 28. Prontidão para implantação

Não está pronta. Falta a cópia fiel, a restauração conferida, as nove migrações nessa cópia, a preservação comprovada dos históricos e a recuperação depois de uma falha. Implantar não foi autorizado e não foi feito.

## 29. Arquivos modificados

- `auditoria/h4cf-ensaio-copia-real.md`

Nenhum SQL, nenhum executor e nenhum journal foi editado.

## 30. Commit local

O commit deste relatório entra na branch isolada, sem push. O hash fica no histórico local depois do commit.

## 31. Estado do Git

Antes deste relatório: `474010e`, árvore limpa, bundle da H4-CE válido e com esse commit. Sem merge, reset, rebase ou deploy.

## 32. Banco operacional

Preservado. Não houve SQL de alteração na porta 3306. Não houve dump. Não houve usuário novo, senha redefinida nem privilégio ampliado. O container `fazenda-digital-mysql` segue o mesmo, na porta 3306. Nenhum arquivo temporário de cópia foi criado, então não houve limpeza de dump.

## O que destravaria a fase

Uma autorização nova e específica para definir outra senha de `fd_auditoria_ro@172.18.0.1`, sem mudar o `GRANT`. Com essa senha, a exportação volta a ser só leitura. Se na hora aparecer view, trigger, rotina, event ou tabela fora do InnoDB que o `SELECT` não cubra, a fase para de novo e lista o privilégio que falta, sem usar `root` e sem usar a conta da aplicação.
