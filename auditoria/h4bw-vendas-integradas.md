# H4-BW — Vendas integradas no MySQL descartável

A tela Nova Venda usa `vendas.confirmarIntegrada`.

A constante executada em `shared/vendaIntegracao.ts` é `ESTADO_CONFIRMACAO_VENDA_PRODUCAO = "integrado"` e `INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true`. O comentário antigo dizia que a produção continuava comercial. O comentário foi alinhado ao código. A constante não foi invertida.

`vendas.confirmar` recusa enquanto esse modo estiver ligado. `vendas.create` continua bloqueada e a tela não a chama.

## O que a prova gravou

Arquivo: `server/vendaConfirmacaoIntegrada.isolado.test.ts`.

Banco descartável, porta 3407, sem ligação com o MySQL da fazenda. Dados artificiais.

O funcionário com `vendas.confirmar` e fazenda concedida confirma. O dono da venda, da baixa e do título é o titular. O nome de quem clicou fica na baixa. O animal passa a vendido. O lote não muda; a venda só guarda o nome do lote. Nasce um título a receber, uma parcela e o documento `VENDA-<id>`.

Vários animais entram na mesma operação, com um título e a soma dos valores. Animal de outra fazenda recusa a operação inteira. Outra conta, sessão revogada, permissão retirada e fazenda retirada não gravam nada.

Falha no meio do título desfaz venda, itens, baixa e situação do animal. A mesma chave reenviada, inclusive em duas conexões, deixa uma venda e um título. A mesma chave com outro animal não cria a segunda venda. Dois pedidos diferentes no mesmo animal deixam uma venda só.

O cancelamento devolve o animal, estorna a baixa e cancela o título. A venda permanece no banco. A mesma chave não confirma de novo. Título já recebido não é apagado e a venda continua concluída.

Banco fora do ar responde indisponível. Não há gravação em arquivo local. A venda de animais não mexe no estoque.

## O que não foi feito

Não houve teste de navegador. O servidor da porta 3000 não foi aberto. O MySQL da porta 3306 não foi usado. Nenhuma migração foi aplicada. O inventário permanece 223 homologadas, 0 parciais, 0 legadas, 25 bloqueadas e 4 não aplicáveis.
