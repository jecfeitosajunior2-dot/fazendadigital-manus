# H4-CD — Diagnóstico estrutural do MySQL operacional

Leitura feita em 23 de novembro de 2026. Nenhuma migração foi aplicada. Nenhum dado comercial foi alterado.

A criação da conta e as consultas são coisas separadas. A conta foi criada com uma conexão administrativa pontual. As contagens e os metadados foram lidos depois, só com `fd_auditoria_ro`.

## Conta de auditoria

A conta não existia. Foi criada como `fd_auditoria_ro@172.18.0.1`.

A origem `172.18.0.1` é o endereço em que o MySQL viu esta máquina, pela ponte do Docker. Não foi usado `%`.

Privilégios conferidos com `SHOW GRANTS` na própria conta:

- `USAGE` em `*.*`, que no MySQL significa ausência de privilégio global.
- `SELECT` em `fazenda_digital.*`.

Não há `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `GRANT OPTION` nem privilégio em outro banco. A senha não foi gravada no repositório, no relatório nem em arquivo. Ela ficou só na memória da sessão. Uma próxima entrada precisa de autorização nova para definir outra senha, sem mudar estes privilégios.

A conta da aplicação e o `root` não foram usados nas consultas de diagnóstico.

## Identidade do servidor

| Item | Observado |
| --- | --- |
| Versão | 8.4.11, lida com `VERSION()` |
| Banco | `fazenda_digital` |
| Porta do servidor | 3306 |
| Container | `fazenda-digital-mysql` |
| Hostname interno | coincidiu com o container antes da criação da conta |
| Usuário efetivo | `fd_auditoria_ro@172.18.0.1` |
| Consultas | 27, todas de leitura |
| Prazo | limitado a 90 segundos, 15 segundos por consulta, teto de 40 consultas |

O servidor da porta 3000 não foi reiniciado. O container não foi reiniciado.

## Tabelas

O modelo atual tem 62 tabelas. O banco tem 60.

Faltam no banco, e existem no modelo:

- `reproducao_operacoes`
- `semen_entrada_operacoes`

Não há tabela no banco que o modelo desconheça.

O comparador das onze migrações leu colunas, tipos, nulidade, índices e a ordem das colunas. Isso não é uma conferência coluna a coluna de todas as 60 tabelas contra o modelo.

## Chaves estrangeiras

Há 50 chaves estrangeiras, em 52 colunas participantes. Elas estão nas tabelas que já existem: pasto, compra, financeiro, permissão, pesagem e auditoria. Nenhuma foi criada nem removida nesta fase. As onze migrações pendentes não dependem de uma chave estrangeira nova.

## Journal

A tabela `__drizzle_migrations` não existe no banco. O journal do repositório continua só com `0000_omniscient_jigsaw`. Arquivo fora do journal não foi tratado como ordem de aplicar. A estrutura observada é que decide.

## As onze migrações

| Migração | Estado observado | O que isso significa | Duplicidade | Ação, sem executar |
| --- | --- | --- | --- | --- |
| 0060 | Existente e compatível | `manutencoes.chaveOperacao` e o índice único `(userId, chaveOperacao)` já estão certos | 0 grupos | Não reaplicar |
| 0067 | Ausente | A tabela `reproducao_operacoes` não existe | não se aplica | Não aplicar agora. É estrutura nova do código |
| 0068 | Ausente | A tabela `semen_entrada_operacoes` não existe | não se aplica | Não aplicar agora. Não depende da 0067 |
| 0069 | Parcial | A tabela e as colunas da identidade existem. O índice único `semen_partidas_uq` não existe | 0 grupos | Não aplicar agora. Repetir a contagem antes de criar o índice |
| 0071 | Parcial no comparador | A tabela `animais` existe. A coluna gerada e o índice por fazenda não existem | 0 grupos de brinco ativo | Não aplicar agora. A 0070 continua rejeitada e o índice dela não está no banco |
| 0072 | Ausente | A tabela `estoque_movimentacao_chaves` não existe | não rodou | Não aplicar agora |
| 0073 | Parcial no comparador | Fornecimento e batida existem. Chave, resumo e índices não existem | não se aplica | Não aplicar agora. Não é uma 0073 interrompida no meio |
| 0074 | Parcial no comparador | A leitura de cocho existe. Chave, resumo e índice não existem | não se aplica | Não aplicar agora. Não depende da 0073 |
| 0075 | Ausente | `manutencoes.fazendaId` não existe | fazenda da OS não verificável | Não preencher fazenda antiga pela máquina |
| 0076 | Ausente | `abastecimentos.chaveOperacao` e o índice não existem | não rodou | Não aplicar agora |
| 0077 | Ausente | `conteudoOriginal` não existe em manutenção nem em abastecimento | não se aplica | Não aplicar agora |

Nenhuma peça conferida ficou incompatível. Nenhuma migração foi declarada aplicada só porque a tabela base existe.

O rótulo parcial de 0071, 0073 e 0074 vem do comparador: a tabela base entra como peça encontrada e a coluna nova como peça ausente. Nesta sessão nenhum `ALTER` começou. Não há evidência de aplicação interrompida no meio.

## Duplicidades

- Brinco ativo, no mesmo titular e na mesma fazenda, depois de tirar espaço e caixa: **0 grupos**.
- Partida de sêmen na identidade da 0069: **0 grupos**.
- Chave de manutenção preenchida: **0 grupos**.
- Chave de abastecimento: **não verificada**, a coluna não existe.
- Chave de estoque: **não verificada**, a tabela não existe.
- Chave de nutrição: as colunas não existem, então não há chave repetida para contar.

Nenhuma linha foi escolhida nem apagada.

## Históricos

Contagens, sem nome e sem brinco:

| Consulta | Total |
| --- | --- |
| Animais sem fazenda | 0 |
| Animais ligados a usuário comum | 0 |
| Trocas de brinco ligadas a usuário comum | 0 |
| Pesagens ligadas a usuário comum | 0 |
| Máquinas sem fazenda | 0 |
| Máquinas ligadas a usuário comum | 0 |
| Manutenções ligadas a usuário comum | 0 |
| Manutenções sem fazenda | não verificada: a coluna não existe |
| Abastecimentos sem fazenda | 5 |
| Abastecimentos ligados a usuário comum | 0 |
| Estoque sem fazenda | 0 |
| Compras sem fazenda | 0 |
| Compras ligadas a usuário comum | 0 |
| Vendas sem fazenda | 0 |
| Vendas ligadas a usuário comum | 0 |
| Benfeitorias sem fazenda | 0 |
| Benfeitorias ligadas a usuário comum | 0 |

Pesagem não tem coluna de fazenda. O zero acima é só o vínculo com usuário comum.

Zero ligações com usuário comum não transfere titularidade e não prova a história de cada lançamento. Só diz que, nas tabelas contadas, nenhuma linha aponta para um usuário de papel comum.

Os cinco abastecimentos sem fazenda continuam sem fazenda. A fazenda atual da máquina não foi copiada.

## O que o código já espera e o banco ainda não tem

- Idempotência da estação e da cobertura coletiva: falta `reproducao_operacoes`.
- Idempotência da entrada de sêmen: falta `semen_entrada_operacoes`.
- Unicidade da partida: falta o índice. Hoje não há grupo repetido.
- Brinco ativo por fazenda: falta a coluna gerada e o índice. Hoje não há grupo repetido.
- Chave da movimentação manual de estoque: falta a tabela.
- Chave de fornecimento, batida e leitura de cocho: faltam colunas e índices.
- Fazenda da época na manutenção: falta a coluna.
- Chave e fotografia de abastecimento e de manutenção: faltam as colunas.

A chave de manutenção da 0060 já está compatível. Reaplicar esse arquivo quebraria na coluna existente.

## O que não deve ser reaplicado

- 0060.
- 0070, que permanece rejeitada e cujo índice não apareceu.
- Qualquer arquivo cujo pedaço já existe, sem uma pré-verificação nova na hora da aplicação.

## Riscos

O `ALTER` e o `CREATE INDEX` confirmam sozinhos. `ROLLBACK` não desfaz. Uma falha no meio deixa a estrutura pela metade.

A 0069 e a 0071 recusam duplicata e não apagam linha. A contagem de hoje está em zero. Isso pode mudar antes de uma aplicação futura. A contagem tem de ser repetida na hora.

Cinco abastecimentos sem fazenda não devem ser preenchidos por inferência. A fazenda histórica da manutenção nem pode ser contada ainda.

## Ordem sugerida para um ensaio em cópia restaurada

Não executar no banco da fazenda.

1. Backup e restauração comprovada numa cópia.
2. Não incluir a 0070.
3. Não reaplicar a 0060: nesta leitura ela já está compatível.
4. Na cópia, repetir as contagens de brinco e de partida.
5. Se continuarem em zero: 0067, 0068, 0069, 0072, 0071, 0073, 0074, 0075, 0076, 0077.
6. Parar se a pré-verificação achar pedaço pela metade, índice diferente ou duplicata. Restaurar a cópia. Não continuar do comando seguinte.

## Pendências para o proprietário

- Os cinco abastecimentos sem fazenda ficam nulos até uma decisão comercial. Não há preenchimento automático.
- A conta de auditoria existe, mas a senha desta sessão não foi guardada.
- Nenhuma migração entra na fazenda sem uma autorização nova, backup e ensaio na cópia.

## Limitações

A conferência não comparou cada coluna das 60 tabelas com o modelo. Comparou as peças das onze migrações e a lista de tabelas. Chave de abastecimento, chave de estoque e fazenda da manutenção não puderam ser contadas porque a estrutura não existe. O limite de 40 consultas não foi estourado: foram 27.

## Confirmações

- Escrita comercial: nenhuma.
- Migração: nenhuma.
- Journal: não modificado. A tabela dele nem está no banco.
- Servidor oficial e container: não reiniciados.
- Projeto oficial: não modificado.
- A trava geral de `server/leituraAutorizada.ts` continua fechada para a porta 3306. A leitura desta sessão passou por uma função à parte, que só aceita `fd_auditoria_ro` neste banco e neste container.

## Próxima ação

Guardar este diagnóstico. Na hora de implantar, autorizar em separado o ensaio numa cópia restaurada, com as contagens repetidas. Até lá, não aplicar arquivo nenhum.
