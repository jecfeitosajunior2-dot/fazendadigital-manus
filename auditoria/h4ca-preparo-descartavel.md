# H4-CA — Preparo reproduzível e recuperação da 0073

O esquema deste ensaio é gerado a partir do modelo atual do Drizzle. Não é reprodução comprovada do banco operacional. Situação operacional: **NÃO VERIFICADO NO OPERACIONAL.**

## Cadeia histórica

O arquivo `0000_omniscient_jigsaw.sql` cria 17 tabelas antigas: abastecimentos, animais, batidas, benfeitorias, categorias financeiras, cochos, contas financeiras, dietas, estoque, lotes, manutenções, máquinas, movimentações, pesagens, reprodução, saúde e users. Não cria `fazendas`.

O `0001_extend_fazendas.sql` altera `fazendas`. A tabela não nasce em nenhum arquivo SQL. A cadeia para aí. Não foi inventada migração histórica e o journal continua só com `0000_omniscient_jigsaw`.

O mecanismo que gera as tabelas atuais é o modelo `drizzle/schema.ts`, aplicado com o envio do Drizzle para um banco vazio. O journal do Drizzle não acompanha esse modelo.

## Procedimento do descartável

1. Subir um MySQL 8 em porta diferente de 3306 e com nome de container diferente de `fazenda-digital-mysql`.
2. Criar o banco modelo e enviar `drizzle/schema.ts`. Essa é a origem do esquema-base. Classificação: **gerado a partir do modelo atual**.
3. Cada suíte antiga abre um banco próprio, copia as tabelas do modelo e falha na hora se a cópia ou o complemento do esquema não fechar. Não há mais caminho que ignore o arquivo.
4. A proposta 0073 só entra no banco do ensaio dela, depois da pré-verificação.
5. Conferir tabelas, colunas e índices.
6. Rodar os testes.
7. Remover o container.

Não há opção de escrita no banco da fazenda.

## Manifesto do ensaio

- MySQL 8.4, porta publicada 3409, container `fd-h4ca-prep`, banco modelo `fd_h4ca_modelo`.
- Origem: modelo Drizzle atual. 62 tabelas no modelo da fase anterior, reenviadas neste ensaio.
- Arquivos conferidos pelo começo do hash:
  - 0000 `367ddf3f41f0`
  - 0001 `20158b7c2473`
  - 0060 `74c5ce3b1b19`
  - 0067 `3a219ec09b91`
  - 0068 `6e61ee00056c`
  - 0073 `4b996048788d`
  - 0074 `3d1293bf7ba8`
  - 0075 `479ba68b4e8a`
  - 0076 `77f34c8b2762`
  - 0077 `76a55e56f91c`
- A 0073 limpa concluiu. A segunda execução foi recusada pelo livro. A retomada no meio foi interrompida. Índice incompatível e chave repetida foram recusados, com as duas linhas preservadas. Conexão na porta 9 não gravou livro.

## 0073

Quatro comandos, nesta ordem: duas colunas no fornecimento, duas na batida, índice único do fornecimento, índice único da batida. A pré-verificação só lê o catálogo. Se falta um pedaço e outro já existe, a decisão é interromper e restaurar a cópia conferida. O executor não continua do comando seguinte. O `ALTER` do MySQL não volta atrás com `ROLLBACK`.

O livro `fd_livro_propostas` fica só no banco descartável. Guarda arquivo, hash, dependência, estado, pré-verificação, início, conclusão, erro e estado posterior. Arquivo encontrado no disco não conta como concluído.

Os arquivos 0060, 0067, 0068, 0074, 0075, 0076 e 0077 continuam de uso único. O livro impede a repetição quando o mesmo hash já está concluído. Eles não foram reescritos para virar idempotentes.

## Testes antigos

Oito arquivos `*.mysql.test.ts`. Em paralelo, 75 testes antigos aprovados e 0 ignorados. Os 13 do financeiro passaram com o escopo do titular da própria conta, o mesmo contrato da suíte do núcleo. Outro titular recebe “Registro não encontrado.” Sessão com versão diferente não abre conta. Funcionário sem permissão recebe recusa. Três contas e oito lançamentos sintéticos permanecem depois da suíte.

A transferência passou a usar o banco da própria suíte. O serviço padrão da aplicação continua no banco configurado.

## Leitura futura e implantação

O roteiro de leitura só tem `SELECT`. Ele recusa a porta 3306. Não foi apontado para a fazenda.

Quando houver autorização: auditar o esquema, listar duplicata, fazer backup, restaurar em cópia, parar gravação, aplicar com o livro, validar cada comando, testar, e interromper restaurando o backup se a pré-verificação não estiver limpa. Nada disso foi executado.
