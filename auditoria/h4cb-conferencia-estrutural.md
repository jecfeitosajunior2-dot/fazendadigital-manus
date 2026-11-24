# H4-CB — Conferência estrutural preparada, ainda sem o banco da fazenda

A leitura do banco da fazenda não foi feita. Toda observação operacional permanece **NÃO VERIFICADO NO OPERACIONAL**.

## Leitor que já existia

`server/leituraEsquema.ts` declara cinco consultas: versão, tabelas, colunas, índices e chaves estrangeiras. A função que roda no ensaio executa só versão e tabelas. Ela recusa a porta 3306, o banco `fazenda_digital`, o container `fazenda-digital-mysql` e qualquer host que não seja `127.0.0.1`. O resultado sempre volta com a marca de não verificado. Esse bloqueio foi preservado.

## Leitura autorizada

O procedimento novo fica em `server/leituraAutorizada.ts`. Ele não lê variável de ambiente e não aceita a credencial `root`. Pede a frase de autorização, o destino, a confirmação igual ao destino, uma credencial com papel `leitura` e um limite de consultas.

Nesta fase o interruptor operacional está desligado. Porta 3306, banco da fazenda, container da fazenda ou host fora do ensaio local são recusados antes de abrir conexão. Não há `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `TRUNCATE`, `SELECT FOR UPDATE` nem trava de tabela. As contagens não disparam sozinhas na leitura do esquema.

## O que o código espera

O modelo atual já descreve 0060, 0067, 0068 e 0069. As propostas 0071, 0072, 0073, 0074, 0075, 0076 e 0077 ainda não estão no modelo. A 0070 continua rejeitada e fora da execução.

O comparador olha tabela, coluna, tipo, nulidade, coluna gerada, ordem do índice e se ele é único. Nome de índice igual com colunas diferentes fica incompatível. Uma coluna presente não libera o restante da migração. Arquivo fora do journal não vira ordem de aplicar.

## Ensaio

MySQL descartável, porta publicada 3410, container `fd-h4cb-leitura`. Dezesseis testes aprovados. O recorte completo ficou compatível. Coluna ausente, índice ausente, índice incompatível, 0073 pela metade e tabela ausente foram separados. Brinco ativo repetido na mesma fazenda contou um grupo e as quatro linhas ficaram. Partida repetida contou um grupo só na fazenda em que havia par; a outra fazenda não entrou. O journal com uma entrada não autorizou aplicação. Credencial administrativa, falta da frase, destino diferente, porta fechada e porta 3306 foram recusados sem consulta.

As contagens de pesagem, máquina, manutenção, abastecimento, estoque, compra, venda e benfeitoria estão prontas e só rodam se a tabela e a coluna existirem. Neste recorte a pesagem estava ausente e a contagem não rodou. Nenhuma lista nome, e-mail ou brinco.

## Backup

O histórico da branch, até `92341df`, está no bundle local `C:\Users\Pedro Neto\Documents\fazenda-digital-h4cb-historico.bundle`. A verificação do Git confirmou história completa. O arquivo não entra no commit.
