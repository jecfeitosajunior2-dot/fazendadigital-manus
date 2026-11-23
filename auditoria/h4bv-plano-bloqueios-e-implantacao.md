# H4-BV — Plano das rotas bloqueadas e da implantação

Fase de diagnóstico. Nenhuma migração foi aplicada. Nenhum dado foi apagado. O inventário global permanece em 223 homologadas, 0 parciais, 0 legadas, 25 bloqueadas e 4 não aplicáveis. Total 252. Percentual 88,49%.

O banco operacional não foi consultado. Onde o texto diz NÃO VERIFICADO, a situação real das tabelas da fazenda continua desconhecida.

## 1. Matriz das 25 rotas bloqueadas

Categoria: A proteção definitiva, B substituída, C essencial ainda indisponível, D depende de estrutura, E regra comercial pendente. Cada rota tem uma categoria principal.

| Id | Rota | Permissão | Categoria | Motivo | Alternativa que já existe | Recomendação |
| --- | --- | --- | --- | --- | --- | --- |
| R087 | animais.delete | animais.inativar | A | Apagar o animal apaga o histórico sanitário, de peso, reprodução e compra. | Manejo, baixa. | Permanecer bloqueada. |
| R108 | lotes.excluir | lotes.inativar | A | A exclusão física apaga o histórico do lote. | Inativar o lote quando não houver animal ativo. | Permanecer bloqueada. |
| R113 | lotes.excluirMovimentacao | lotes.inativar | A | Apaga o histórico de movimentação. | Consultar o histórico. A mudança de pasto é outra rota. | Permanecer bloqueada. |
| R114 | lotes.cancelarEstadiaSinteticaLote | lotes.editar | A | Correção direta reescreve a estadia. | Movimentar o lote. | Permanecer bloqueada. |
| R142 | abastecimentos.delete | abastecimentos.inativar | A | O abastecimento é histórico de consumo. | Estornar, quando a operação já permite. | Permanecer bloqueada. |
| R149 | manutencoes.delete | manutencoes.inativar | A | A ordem concluída ou estornada guarda peça, estoque e custo. | Estornar a manutenção. | Permanecer bloqueada. |
| R153 | pesagens.delete | pesagens.inativar | A | Apagar a linha deixa peso, desmama, nascimento ou compra sem histórico. | Registrar outra pesagem. | Permanecer bloqueada. |
| R155 | nutricao.createBatida | nutricao.criar | B | Cadastro antigo, sem a fazenda e sem a chave da batida nova. | nutricaoBatidas.confirmar. | Permanecer bloqueada. A batida nova ainda depende da proposta 0073 no banco. |
| R156 | nutricao.deleteBatida | nutricao.inativar | A | A exclusão antiga apagaria o histórico. | nutricaoBatidas.estornar. | Permanecer bloqueada. |
| R162 | benfeitorias.delete | benfeitorias.inativar | A | A linha é o único registro patrimonial e guarda as fotos. | Editar a situação para inativo. | Permanecer bloqueada. |
| R171 | estoque.delete | estoque.inativar | A | Apagar o produto deixa saldo e histórico sem rastreio. | Inativar o produto e lançar movimento ou estorno. | Permanecer bloqueada. |
| R183 | estoque.deleteMovimentacao | estoque.inativar | A | Apagar o movimento diverge do saldo. | Estornar e lançar um movimento novo. | Permanecer bloqueada. |
| R185 | estoque.deleteAllMovimentacoesByProduto | estoque.inativar | A | Apagaria o histórico inteiro do produto. | Estorno pontual. | Permanecer bloqueada. |
| R187 | financeiro.listContas | financeiro.visualizar | B | Módulo antigo desativado. | financeiroV2.contasList. | Permanecer bloqueada. |
| R188 | financeiro.createConta | financeiro.criar | B | Módulo antigo desativado. | financeiroV2.contasCreate. | Permanecer bloqueada. |
| R189 | financeiro.listMovimentacoes | financeiro.visualizar | B | Módulo antigo desativado. | financeiroV2.movimentosExtrato. | Permanecer bloqueada. |
| R190 | financeiro.createMovimentacao | financeiro.criar | B | Módulo antigo desativado. | Lançamento e liquidação do V2. | Permanecer bloqueada. |
| R191 | financeiro.deleteMovimentacao | financeiro.inativar | B | Apagar movimento antigo. O V2 estorna, não apaga. | Estorno no V2. | Permanecer bloqueada. |
| R192 | financeiro.summary | financeiro.editar | B | Resumo antigo. | financeiroV2.relatorioFinanceiro. | Permanecer bloqueada. |
| R199 | compras.create | compras.criar | B | O cadastro antigo não informa a fazenda. Nada é gravado. | compras.confirmarNaoIdentificados e a compra de insumos. | Permanecer bloqueada. |
| R204 | compras.desfazerRecebimento | compras.editar | C | O estorno do animal recebido está recusado por segurança. A tela ainda chama a rota. | Não há estorno seguro equivalente. Cancelar a compra inteira não desfaz o animal já recebido. | Manter bloqueada até existir estorno que preserve compra, animal e estoque. |
| R216 | vendas.create | vendas.criar | B | O cadastro antigo não informa a fazenda. Nada é gravado. | A tela Nova Venda usa confirmar ou confirmarIntegrada, conforme a constante. | Permanecer bloqueada. A escolha entre os dois caminhos novos é decisão P0, descrita abaixo. |
| R223 | fazendas.delete | fazendas.inativar | A | Pasto, animal, lote, máquina e benfeitoria não têm chave estrangeira. Um vínculo pode entrar no mesmo instante. | Não há coluna de inativação. A conferência deleteCheck continua informando vínculos. | Permanecer bloqueada. Não reativar a exclusão física. |
| R228 | pastos.delete | pastos.inativar | A | O pasto se liga a lote, animal e histórico. | Editar a situação do pasto. | Permanecer bloqueada. |
| R233 | brincos.deletar | brincos.inativar | A | Apagar o histórico perderia a identificação anterior. | Consultar o histórico. A troca do brinco ativo é o manejo, e depende da 0071. | Permanecer bloqueada. |

Nenhuma dessas 25 foi reclassificada no inventário.

## 2. O que deve permanecer bloqueado

Todas as exclusões físicas da tabela acima. O financeiro legado inteiro. O cadastro antigo de compra, de venda e de batida. A exclusão antiga de batida.

Desbloquear qualquer uma dessas rotas para “fazer a tela voltar a apagar” reabre perda de histórico.

## 3. Bloqueio comercial que ainda impede uma correção

`compras.desfazerRecebimento` é o único bloqueio da lista cuja alternativa segura ainda não existe. A tela de recebimento oferece desfazer. O servidor responde que o estorno está indisponível e não altera animal, compra nem recebimento. Isso não impede registrar uma compra nova. Impede corrigir um animal recebido por engano.

## 4. Vendas

`vendas.create` continua recusando, com a frase de que o cadastro antigo não informa a fazenda. A lista de vendas não chama essa rota. A tela Nova Venda chama `vendas.confirmar` ou `vendas.confirmarIntegrada`, conforme a constante lida do servidor.

Nesta fase, `server/vendaOperacaoAutorizado.isolado.test.ts` rodou de novo no MySQL descartável, porta do container diferente de 3306. Quatro testes já existentes passaram: confirmação de um e de vários animais, recusa de quem não pode, rollback sem baixa parcial, cancelamento que preserva morte e título liquidado, e concorrência sem duplicar baixa. Esses quatro não entram de novo na conta única.

A constante em `shared/vendaIntegracao.ts` está `ESTADO_CONFIRMACAO_VENDA_PRODUCAO = "integrado"` e `INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true`. O comentário do mesmo arquivo ainda diz que a produção permanece comercial e que a integração está desligada. Com a constante atual, a rota comercial é recusada e a tela segue o caminho integrado.

As seis falhas antigas foram executadas de novo, com o banco apontado para uma porta fechada, sem usar o MySQL da fazenda. Continuam seis:

- a constante de produção não está falsa, em dois arquivos;
- o teste da rota integrada com loja falsa não encontra `findVendaPorIdempotency` e devolve erro interno, em vez da frase de integração desligada.

Não foram tratadas como irrelevantes. Elas mostram que o contrato antigo “integração desligada” não é mais o código. Não há teste descartável com o nome da confirmação integrada financeira. O serviço `confirmarVendaFinanceiro` tem testes de memória. Isso não substitui o MySQL descartável do caminho que a tela usa quando a constante está integrada.

Decisão pendente, antes de implantar a tela de venda: confirmar se a produção deve mesmo seguir o caminho integrado. Esta fase não troca a constante e não desbloqueia `vendas.create`.

A venda confirmada mexe no animal (baixa), pode gerar título e não é cancelada se já houver recebimento efetivo. O financeiro legado não recebe esse lançamento. O V2 é o destino quando o caminho integrado grava título.

## 5. Financeiro legado

As seis rotas `financeiro.*` bloqueadas respondem que o financeiro legado está desativado e que se deve usar o V2. As telas atuais de contas, extrato, contas a pagar, contas a receber e relatório chamam `financeiroV2`. Testes de página conferem que essas telas não chamam `trpc.financeiro.`.

O V2 cobre conta, título, parcela, liquidação, estorno de liquidação, transferência e relatório. Compras de insumos e a confirmação de venda autorizada já geram título no fluxo testado no descartável em fases anteriores. Manutenção e abastecimento têm proposta de título a pagar; a transação única com a chave 0060 está descrita como proposta e não como migração aplicada.

Não reativar o legado. Função que o legado apagava (`deleteMovimentacao`) não deve voltar: no V2 a correção é estorno.

## 6. Compras

`compras.create` não grava. A tela de listagem não chama essa rota. O caminho atual é a confirmação da compra de animais não identificados e a compra de insumos, ambas com fazenda.

`compras.desfazerRecebimento` está bloqueada de propósito. Impacto no estoque: o animal recebido e os movimentos exclusivos daquele recebimento não são desfeitos por esta rota. Impacto financeiro: um título já nascido da compra não é estornado por esta rota. Correção necessária no futuro: um estorno que devolva a quantidade pendente, retire só o que nasceu naquele recebimento e recuse se o animal já tiver manejo, venda ou pagamento. Não foi implementado nesta fase.

## 7. Exclusão de fazendas

Chave estrangeira encontrada nos arquivos SQL, não conferida no banco da fazenda:

- `usuario_fazendas.fazendaId`
- `auditoria_eventos.fazendaId`
- `financeiro_centros_custo.fazenda_id`
- `financeiro_titulos.fazenda_origem_id`
- `financeiro_apropriacoes.fazenda_id`

Sem chave estrangeira nos arquivos vistos, e por isso dependem da contagem no código: pastos, animais, lotes, máquinas, benfeitorias, estoque, compras, vendas e nutrição. A contagem não trava a linha que ainda não existe. Dois serviços podem inserir um pasto enquanto a fazenda está só bloqueada na própria tabela.

Não existe coluna de situação inativa em fazendas. A tela ainda pergunta se quer excluir. O servidor recusa e o cadastro fica.

Recomendação de integridade, só para uma janela futura e autorizada: chave estrangeira das tabelas operacionais para `fazendas`, ou uma situação inativa sem apagar a linha. Não criar essa migração agora. Não reativar a exclusão física.

## 8. Exclusão de benfeitorias

A edição para `inativo` conserva nome, fazenda, dono e as três fotos. Isso atende tirar o cadastro da lida do dia. Não atende quem quiser apagar uma foto ou um cadastro lançado por engano sem histórico. Para esse caso, o comportamento futuro seria ocultar ou substituir a foto na edição, sem apagar a linha. A exclusão física permanece bloqueada.

## 9. Inventário SQL

O journal `drizzle/migrations/meta/_journal.json` tem uma única entrada: `0000_omniscient_jigsaw`. Os arquivos abaixo existem no repositório e não estão no journal. A presença no desenho Drizzle não prova que a coluna existe no banco da fazenda. Situação operacional de todos: NÃO VERIFICADO.

| Arquivo | Onde está | O que pede | Depende de | Pode esperar | Risco se aplicar com dado antigo |
| --- | --- | --- | --- | --- | --- |
| 0060_manutencoes_chave_operacao.sql | migrations, fora do journal | `manutencoes.chaveOperacao` e índice único `(userId, chaveOperacao)` | tabela manutencoes | A OS antiga fica com chave nula. Vários nulos são permitidos. | Baixo se não houver backfill. DDL não desfaz com rollback. |
| 0067_reproducao_operacoes.sql | migrations, fora do journal | tabela nova `reproducao_operacoes` | nenhuma tabela antiga alterada | Sim, até a estação de monta precisar da chave. | Baixo: não mexe no registro antigo. |
| 0068_semen_entrada_operacoes.sql | migrations, fora do journal | tabela nova de entrada | 0027 já descreve a identidade da partida | Sim, até a entrada nova exigir a chave. | Baixo se a tabela ainda não existir. |
| 0069_semen_partidas_indice_unico.sql | migrations, fora do journal | garante `semen_partidas_uq` | partidas já gravadas | Só depois de listar duplicidade. A rotina recusa se achar duplicata. | Partida repetida impede o índice. Não funde sozinha. |
| 0071 | propostas | brinco ativo único por titular e fazenda | animais.status, brinco, fazendaId | Antes de trocar brinco ativo na produção. | Brinco ativo repetido na mesma fazenda impede o índice. Animal sem fazenda não entra na chave. |
| 0072 | propostas | tabela `estoque_movimentacao_chaves` | movimentação manual | Antes da movimentação manual com chave. | Não apaga saldo. Recusa índice incompatível. |
| 0073 | propostas | chave e resumo em fornecimento e batida | tabelas de nutrição | Antes de confirmar batida e fornecimento novos. | Linhas antigas ficam com chave nula. |
| 0074 | propostas | chave em leitura de cocho | tabela de leitura, independente da 0073 | Antes da leitura nova. | Não preenche leitura antiga. |
| 0075 | propostas | `manutencoes.fazendaId` nulo | manutencoes | Antes de filtrar OS antiga por fazenda da época. | Não copia a fazenda atual da máquina. |
| 0076 | propostas | `abastecimentos.chaveOperacao` | abastecimentos | Antes do reenvio seguro do abastecimento. | Não copia custo nem quantidade. |
| 0077 | propostas | `conteudoOriginal` em manutenção e abastecimento | 0060 e 0076 já úteis sem ela | Pode esperar. | Não preenche com o custo atual. |

A proposta 0070 permanece rejeitada. Ela unique o brinco ativo na conta inteira, inclusive entre fazendas. Não aplicar. Não recolocar no journal.

Ordem sugerida, só depois de backup e autorização, e só para o que o proprietário escolher:

1. Conferir o catálogo real. Não aplicar arquivo cujo objeto já exista com outro formato.
2. 0069, se o diagnóstico de partida duplicada vier limpo.
3. 0067 e 0068, tabelas novas.
4. 0072, 0073 e 0074, chaves de estoque e nutrição.
5. 0060, 0075 e 0076, manutenção e abastecimento.
6. 0071, depois de listar brinco ativo repetido na mesma fazenda.
7. 0077 por último, se a recusa do reenvio depois da edição incomodar na prática.

Rollback de DDL não é transação. Cada arquivo traz o DROP correspondente, e o DROP também é definitivo. Backup verificável vem antes do primeiro ALTER.

## 10. Proposta 0071

O teste da H4-BU, repetido naquela fase no descartável, mostrou: sem o índice a troca recusa; com o índice a troca do funcionário grava no titular; brinco repetido na mesma fazenda não duplica; histórico permanece.

Conflito possível, NÃO VERIFICADO no banco da fazenda: dois animais ativos, do mesmo titular, na mesma fazenda, com o mesmo brinco depois de tirar espaço e ignorar maiúscula. Zeros à esquerda e acentos continuam diferentes. Animal inativo, brinco vazio e animal sem fazenda não entram na chave. Histórico de brinco não é reescrito.

Recomendação: na janela autorizada, rodar só o diagnóstico da proposta. Se houver duplicata, o proprietário escolhe qual animal fica com o brinco antes do ALTER. Sem essa lista limpa, não criar o índice.

## 11. Proposta 0077

Hoje, se a ordem ou o abastecimento for editado, o reenvio do pedido original não bate com o conteúdo gravado e é recusado. A recusa não abre um segundo consumo. Isso é aceitável para a operação. O risco econômico residual é a pessoa achar que a segunda tentativa não valeu e lançar outra chave, criando outro consumo. A fotografia do primeiro pedido melhoraria o reenvio, exige duas colunas e pode esperar. É melhoria, não correção obrigatória.

## 12. Históricos no identificador do funcionário

O código novo grava o titular. Linhas antigas não foram lidas no banco da fazenda e não foram transferidas. Não presumir que toda linha antiga com `userId` de funcionário pertence ao titular de hoje.

| Tabela | Campo | Fazenda na própria linha | Evidência | Risco de associar errado | Critério para reconciliar |
| --- | --- | --- | --- | --- | --- |
| benfeitorias | userId | fazendaId, pode ser nulo | Teste descartável: a linha do funcionário não aparece na lista do titular | Alto se o funcionário tiver atendido outra conta | Cruzar fazenda, data e quem concedeu a fazenda na época |
| historico_brincos | userId | não | A listagem acha pelo animal, não pelo dono da linha | Médio: o animal já aponta o titular | Só mover se o animal da mesma linha for do titular |
| animais | userId | fazendaId, pode ser nulo | Código novo grava o titular. Banco real NÃO VERIFICADO | Alto | Não mover em massa |
| pesagens | userId | não tem fazenda própria | A fazenda sai do animal na consulta | Alto | Só junto com o animal, e mesmo assim com lista conferida |
| fazendas, pastos, lotes, maquinas, estoque, compras, vendas | userId | varia | Código novo grava o titular. Banco real NÃO VERIFICADO | Alto | Lista manual, uma tabela por vez |

## 13. Histórico sem fazenda comprovada

Podem ficar sem fazenda da época: pesagem, histórico de brinco, pessoa (o cadastro é da conta), benfeitoria antiga com fazenda nula, manutenção antes da 0075, venda antiga com fazenda nula.

Não usar a fazenda atual da máquina, do animal ou do lote para preencher o passado.

Consulta administrativa: o titular pode ver a linha sem fazenda da própria conta. O funcionário não. Operação nova que altere brinco, peso ou venda deve continuar recusando fazenda que não foi concedida. Não inventar acesso a histórico de outra conta.

## 14. Dados de teste e transição

Os registros do banco operacional são dados de teste, e a limpeza não foi autorizada. Nenhum DELETE, TRUNCATE, DROP ou reset foi executado.

Plano futuro, não executado: backup, exportar o que o proprietário quiser guardar, subir um banco vazio com o esquema conferido, criar o titular e as fazendas reais, e só então importar animal e estoque por planilha conferida. O banco atual permanece até essa autorização.

## 15. Duplicidade de benfeitorias

Dois currais podem ter o mesmo nome. Não criar índice único de nome.

Uma chave de operação da importação distinguiria reenvio da mesma planilha de um segundo galpão de verdade. Custo: uma coluna e um índice, como nas outras chaves. Benefício: o reenvio depois de uma resposta perdida não cria outra linha. Complexidade média. Sem a chave, o comportamento atual é o correto para duas construções diferentes e para uma importação nova. A duplicata por clique repetido continua possível. Recomendação: adiar a chave até a importação entrar no uso diário. Não criar a migração agora.

## 16. Imagens órfãs

`resolveImageSlots` grava o arquivo em `client/public/manus-storage` antes da transação do MySQL. Não há pasta temporária, nem rotina que apague o arquivo se o banco recusar. A referência que vale é o texto `imagem1`, `imagem2` ou `imagem3` na linha. Foto antiga não é apagada quando a exclusão é recusada nem quando a situação vai para inativo.

Menor correção futura: gravar o arquivo só depois do commit, ou guardar o caminho novo e só publicar a referência na mesma transação. Não apagar arquivo existente. Não ligar limpeza automática.

## 17. Testes MySQL ainda não executados

A regressão principal de 424 não foi repetida nesta fase porque o código de produção não mudou.

Suítes `*.mysql.test.ts` de manutenção, financeiro núcleo, estoque capital, transferência, compra de insumos e sanidade usam `openFinanceiroMysqlHarness`. Sem `DATABASE_URL` de um banco descartável, o harness não abre e a suíte fica de fora. Apontar essas suítes para a porta 3306 está proibido. Elas não foram executadas aqui.

Para um descartável completo faltam, no mínimo, as tabelas que esses harnesses criam por `ensure*Schema`: núcleo financeiro, operações de estoque, capital, sanidade e manutenção com peças. A coluna `chaveOperacao` de manutenção continua de fora até a 0060. Não declarar cobertura completa desses módulos.

Os quatro testes de venda autorizada foram repetidos e passaram. Isso não cria teste novo.

## 18. Testes de interface

Não foi iniciado servidor. A porta 3000 permanece a do ambiente oficial.

Plano, para uma cópia isolada futura:

- outro diretório e outra porta, nunca 3000;
- MySQL descartável, nunca 3306;
- titular, funcionário com concessão parcial e uma conta alheia;
- uma fazenda concedida e outra sem concessão.

Ordem mínima: login, escolha da fazenda, permissão do funcionário, animal, manejo que não troca brinco, estoque em leitura, compra que confirma, venda no caminho que a constante realmente usar, financeiro V2, nutrição só se a 0073 estiver no descartável, máquina, manutenção e abastecimento só se 0060, 0075 e 0076 estiverem no descartável.

Impedimento atual: a constante de venda integrada não tem prova descartável do caminho que a tela escolhe. Até essa prova, o ensaio de ponta a ponta da venda fica incompleto.

## 19. Matriz P0 a P3

P0, impede implantar o conjunto:

- Decidir e provar o caminho de confirmação de venda. A constante diz integrado. O comentário e os seis testes dizem comercial desligado. A tela segue a constante.
- Não aplicar migração com o journal ainda em `0000` e o catálogo operacional NÃO VERIFICADO.
- Não desbloquear exclusão física.
- Não aplicar a 0070.

P1, corrigir antes de usar o módulo:

- 0071 antes da troca de brinco ativo.
- 0072 antes da movimentação manual com chave.
- 0073 e 0074 antes de confirmar nutrição nova e leitura de cocho.
- 0060, 0075 e 0076 antes de manutenção e abastecimento com fazenda da época e reenvio.
- 0067, 0068 e 0069 antes da estação, da entrada de sêmen e do índice, se o diagnóstico estiver limpo.
- Estorno seguro de `compras.desfazerRecebimento`.
- Reconciliação manual das linhas antigas no identificador do funcionário, sem script automático.

P2, sem perda imediata:

- Chave de importação de benfeitoria.
- Gravar a foto da benfeitoria só depois do commit.
- A tela de fazenda ainda oferece excluir e o servidor recusa. Ajustar o texto quando a exclusão continuar bloqueada.
- Suíte descartável completa de manutenção.

P3, pode esperar:

- Proposta 0077, fotografia do pedido original.
- Inativação de fazenda, se um dia for preferível à exclusão que permanece bloqueada.

## 20. Fluxos

Prontos no código, ainda não implantados, e dependentes do esquema real NÃO VERIFICADO:

- Login, fazenda, pessoa, animal, lote, pasto em consulta e edição, visão do rebanho, brinco em consulta, estoque em consulta, financeiro V2, máquina.

Disponíveis com ressalva:

- Venda: o serviço autorizado passou no descartável. A tela pode chamar o outro caminho por causa da constante.
- Compra: confirmar e receber funcionam no desenho atual. Desfazer o recebimento não.
- Nutrição, manutenção e abastecimento: homologados no código e recusam gravar se a coluna da chave não existir.

Indisponíveis de propósito:

- Qualquer exclusão física da lista das 25.
- Financeiro legado.
- Cadastro antigo de compra, venda e batida.

## 21. Plano de implantação futura

Não executado.

1. O proprietário autoriza por escrito a janela e a lista de propostas.
2. Backup verificável, restaurado numa cópia, antes de qualquer ALTER.
3. Conferir o esquema real. Comparar com o journal, que hoje só tem `0000`.
4. Diagnosticar duplicidade de brinco ativo, de partida de sêmen e de chave já gravada.
5. Aplicar só a ordem da seção 9, um arquivo por vez, no banco autorizado.
6. Não preencher fazenda nem titular em linha antiga.
7. Não apagar dado de teste nesta etapa.
8. Repetir os testes descartáveis dos módulos tocados e, depois, o ensaio de interface na cópia isolada.
9. Rollback é restaurar o backup. DROP de índice é segunda escolha e também definitivo.
10. Parar se o diagnóstico achar duplicidade, se o backup não restaurar, ou se um teste posterior falhar.
11. Registrar o que foi aplicado e o que ficou de fora.
12. Sem a autorização do proprietário, nada disso começa.

## 22. Contas

Testes novos nesta fase: nenhum. Total único permanece 1.009. Regressão principal de 424 não foi repetida. As seis falhas de venda foram repetidas e continuam seis. Os quatro testes já existentes da confirmação autorizada passaram de novo no descartável e não foram somados outra vez.
