# H4-BY — Estorno de recebimento de compra

A rota `compras.desfazerRecebimento` continua BLOQUEADA.

O serviço que desfaz o recebimento existe, mas apaga o animal, a pesagem de entrada e a movimentação de lote. Isso não é estorno. A rota não chama esse serviço. Depois de conferir titular, fazenda e a permissão `compras.desfazer_recebimento`, ela responde que nada foi alterado.

## O que o recebimento grava

`compras.receberAnimal` usa `compras.confirmar`. O titular vem da compra. O funcionário só executa.

Na mesma transação, quando dá certo:

- Cria o animal com status `ativo`, fazenda da compra, `compraId` e `compraGrupoId`.
- Cria `compra_recebimentos` com status `confirmado`. O `animal_id` é único. O funcionário fica em `recebido_por_user_id`.
- Se houver peso, cria a pesagem com `compraRecebimentoId`.
- Se houver lote, cria a movimentação de lote com `compraRecebimentoId`.
- Não cria título, parcela nem pagamento.

A vaga do grupo é contada pelos animais que ainda apontam para a compra. Marcar o recebimento como `estornado` e deixar o animal no lugar não devolve a vaga.

## Por que o estorno seguro não cabe hoje

O animal só tem as situações `ativo`, `vendido`, `morto` e `transferido`. Não há situação que tire a entrada do rebanho sem apagar a linha.

Apagar a linha devolve a vaga, mas apaga o animal. Limpar o vínculo da compra devolve a vaga e deixa o animal ativo, como se a entrada nunca tivesse acontecido.

A pesagem e a movimentação de entrada já guardam o recebimento que as criou. Uma pesagem ou um manejo posteriores não usam essa mesma trava. No isolamento atual, outra operação pode entrar no meio. O mesmo motivo já manteve `fazendas.delete` bloqueada.

Não foi criada coluna nova. Não foi aplicada migração. O journal não foi alterado.

## Tela

O aviso do modal não promete mais apagar o animal. O botão de confirmar fica desligado. A mensagem é a mesma da rota: nenhum animal, compra ou recebimento foi alterado.

## Inventário

Classificação da rota: BLOQUEADA. Contagem global inalterada: 223 homologadas, 25 bloqueadas, 0 parciais, 0 legadas, 4 não aplicáveis, 252 no total.

As permissões escritas no inventário de Compras foram alinhadas ao catálogo. Nenhuma permissão nova foi criada. Nenhuma outra rota mudou de classe.
