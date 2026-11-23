# H4-BX — Venda por arroba

A venda por arroba não é uma modalidade gravável no contrato atual.

A fórmula existe e já é testada. A gravação foi desligada de propósito, porque a coluna `forma_precificacao` do MySQL só aceita `kg` e `cabeca`. Não há migração autorizada para incluir `arroba`. Esta fase não criou essa migração e não ligou a gravação.

## Regra que a tela já calcula

Peso de carcaça = peso vivo × rendimento %.
Arrobas = carcaça em kg ÷ 15.
Valor do animal = arrobas × preço da arroba.
O rendimento é obrigatório e fica entre 0 e 100. Não há desconto nessa conta. Peso vivo e peso de carcaça não são a mesma coisa.

Exemplo já coberto no teste da fórmula: 350 kg vivos, rendimento 48%, carcaça 168 kg, 11,2 arrobas.

## O que acontece na prática

A Nova Venda mostra a opção R$/@ de carcaça e o aviso de que a gravação aguarda atualização do banco. O botão de confirmar para antes de chamar o servidor e mostra a mensagem de que o banco ainda não aceita essa forma.

A rota integrada só aceita quilo e cabeça. Se alguém enviar arroba direto ao serviço, a recusa acontece antes de gravar venda, baixa, animal ou título. Isso foi conferido no MySQL descartável.

As modalidades que gravam hoje são R$/kg vivo e R$/cabeça, pelo mesmo fluxo integrado da H4-BW.

## Permissões do inventário

O catálogo não tem `vendas.editar`. Os rótulos do inventário foram alinhados ao código. A classificação das rotas não mudou.

- Consultar, abrir e buscar por animal: `vendas.visualizar`.
- Confirmar e confirmar integrada: `vendas.confirmar`.
- Cancelar: `vendas.cancelar`.
- Anexar ou tirar documento: `vendas.criar`.
- Apagar rascunho sem efeito: `vendas.inativar`.
- Perguntar o modo da confirmação: sessão autenticada, sem permissão de vendas.
- `vendas.create`: continua bloqueada e recusa antes de checar permissão.
