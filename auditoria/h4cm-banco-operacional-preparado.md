# H4-CM — Banco operacional preparado

O banco novo e vazio `fazenda_digital_prod` foi criado no MySQL que já estava no ar. A estrutura definitiva foi instalada nele. A conta da aplicação ficou restrita a esse banco. O arquivo `fazenda_digital` não foi modificado. O aplicativo oficial não foi ligado a esse banco e não foi reiniciado.

## 1. Banco antigo preservado

`fazenda_digital` continua o arquivo dos registros históricos de teste.

Antes e depois da preparação, a leitura estrutural deu o mesmo selo:

| Conferência | Valor |
| --- | --- |
| Tabelas | 60 |
| Índices | 193 |
| Chaves estrangeiras | 50 |
| Colunas | 921 |
| Selo das tabelas | `ac48d768cdb76d6bfd8c1a05723597b814805bc1f89993635d8e5ce958656c78` |
| Selo das colunas | `2fe7993878f4782d0b620a22904f2830cb63dafc58f5b1c47d256386de4b9e24` |
| Selo dos índices | `ca096e39dce4fd2cb2e18c9fa0f2b3ac05c2250aaf1d0bba03cf44714790c920` |
| Selo das chaves | `1fd82ac78b74fff236bdff9127442433d08e6c0801af9f47982bab681bd98b7a` |

Não houve DROP, TRUNCATE, DELETE, UPDATE, ALTER nem migração nesse banco. A conta `fazenda` e a conta `fd_auditoria_ro` seguem como estavam. Os outros bancos já existentes no mesmo servidor também mantiveram a contagem de tabelas.

Esse arquivo não tem a forma do banco novo. São 60 tabelas, não 64. Isso é o esperado: ele guarda o histórico de teste e não foi convertido.

## 2. Banco novo criado

`fazenda_digital_prod` não existia. Foi criado vazio, com conjunto de caracteres `utf8mb4` e colação `utf8mb4_0900_ai_ci`. Nenhum banco existente foi reutilizado nem sobrescrito.

## 3. Identificação do servidor

- Container: `fazenda-digital-mysql`
- Nome interno: `2abe5e2f8653`
- Identificador do servidor: `58f9d0fd-b421-11f1-abfe-5e8cb0973c31`
- Porta publicada: `3306`
- Imagem: `mysql:8.4`
- Banco antigo confirmado: `fazenda_digital`
- Banco novo, antes da criação: ausente

A porta e a configuração global do container não foram alteradas. Não foi criado outro container permanente.

## 4. Versão do MySQL

`8.4.11`, MySQL Community Server.

## 5. Conta de aplicação criada

`fd_app_prod`, somente no host `172.18.0.1`.

Essa origem foi lida numa conexão real deste computador com `127.0.0.1:3306`. O MySQL enxerga essa origem como `172.18.0.1`. É o mesmo host já usado pela conta de auditoria somente leitura. Não foi usado `%`.

## 6. Privilégios efetivos

A conta entrou como `fd_app_prod@172.18.0.1` no banco `fazenda_digital_prod`.

Privilégios no banco novo: SELECT, INSERT, UPDATE e DELETE.

No servidor, o MySQL registra `USAGE` em `*.*`. Isso só marca que a conta existe. Não há leitura, escrita, criação de estrutura nem administração global.

Não há GRANT OPTION. Não há privilégio sobre `fazenda_digital`. Uma leitura de tabela do banco antigo, feita com essa conta, foi recusada. Não houve teste de escrita só para medir permissão.

A estrutura foi carregada por uma conexão administrativa separada, encerrada ao final. O uso cotidiano fica com a conta restrita.

## 7. Proteção das credenciais

A senha foi gerada na hora. Foi guardada cifrada no cofre do usuário do Windows, em `%LOCALAPPDATA%\FazendaDigital\fd_app_prod.clixml`. Não entrou no Git, no relatório nem na tela. As credenciais atuais do aplicativo oficial não foram modificadas.

## 8. Procedimento de instalação utilizado

O `db:push` seguro continua recusando a porta 3306, o banco `fazenda_digital` e o container operacional. Essa proteção não foi afrouxada.

A instalação repetiu a sequência homologada na H4-CH, num MySQL temporário, porta `3421`, banco `fd_h4cm_modelo`, container `fd-h4cm-modelo`, removido ao final:

1. Modelo de `drizzle/schema.ts`, 147 comandos de criação, sem a cadeia 0000–0001.
2. `drizzle/complemento-restricoes-boot.sql`, 42 comandos, nenhum já existia.
3. As propostas 0071, 0072, 0073, 0074, 0075 e 0076, nessa ordem.

O resultado tinha 64 tabelas, 195 índices e 41 chaves. Só então a estrutura, sem dados comerciais e sem DROP, foi carregada em `fazenda_digital_prod`. O arquivo carregado não cita o banco antigo. O hash SHA-256 desse arquivo de estrutura é `954a507fb28b4bd7212b77254edaafc4836ee9bbe85e684d194a029a4465abdf`.

## 9. Tabelas criadas

64. São as 62 do modelo, mais `estoque_movimentacao_chaves`, mais `fd_livro_propostas`.

## 10. Índices criados

195, conferidos pelo nome, pela ordem das colunas e pela unicidade na verificação de prontidão.

## 11. Chaves estrangeiras

41, as do complemento de arranque.

## 12. Resultado das seis propostas

| Proposta | Estado | SHA-256 |
| --- | --- | --- |
| 0071 Brinco ativo por fazenda | concluída | `4c5542e41c525828d78c1d6eab2396e4c8baf859b06a37e9ace9fa7b9c69884e` |
| 0072 Idempotência do Estoque | concluída | `b62885f30bb422ee6ff8a7a289106d450f7a262af07f265d999ae14bb73437d8` |
| 0073 Nutrição | concluída | `4b996048788d5657fe12624102b1e743438eadabb07b270d670c9eaad716cf18` |
| 0074 Leitura de cocho | concluída | `3d1293bf7ba8f28454af1901517bfe75d3cdec83d77ef7c8f057d0c7414e64d2` |
| 0075 Fazenda histórica de manutenções | concluída | `479ba68b4e8a3d5fc858ba871d3bff1ea20654a8123ad5a6deb2d5d4dfad7ff7` |
| 0076 Idempotência de abastecimentos | concluída | `77f34c8b27623d4488691a2a881d0d659b800f4f92a1a2181ba3b1cdda1e05b0` |

Não foram aplicadas 0060, 0067, 0068, 0069, 0070 nem 0077.

## 13. Resultado do complemento estrutural

O complemento do arranque entrou inteiro no banco temporário e, com ele, as 41 chaves e o índice de baixa ativa. A prontidão do banco novo encontrou essas restrições. O hash do arquivo versionado continua `cd6699b4e015a69847b783faea226544c6566f58f1137f11b682a580de4b9be7`.

## 14. Livro de propostas

`fd_livro_propostas` tem seis linhas, todas `concluida`, com os arquivos e os hashes da tabela acima. Não há proposta interrompida.

## 15. Verificação de prontidão

A verificação homologada, só de leitura, rodou com o banco novo selecionado. O modelo Drizzle passou. As peças 0071–0076 passaram. Não houve incompatibilidade.

O arranque oficial, quando for autorizado, precisa de `FD_PRONTIDAO_DEFINITIVA=1`. Nesta fase o servidor oficial não foi iniciado e a aplicação não foi ligada ao banco novo.

## 16. Banco sem registros comerciais

Contagem zero em `animais`, `compras`, `vendas`, `pessoas`, `users`, `financeiro_titulos` e `estoque`.

Não foi criado animal, compra, venda, funcionário nem o titular real. As tabelas de autenticação existem: `passwordHash`, `sessionVersion`, `papel`, `titularUserId`, `situacao` e `email`. Também existem `usuario_permissoes`, `usuario_fazendas`, `perfis_acesso` e `auditoria_eventos`.

## 17. Conferência do banco antigo antes e depois

Os quatro selos e as contagens da seção 1 são iguais antes e depois. A lista de contas do servidor ganhou somente `fd_app_prod@172.18.0.1`.

## 18. Erros ou incompatibilidades

Nenhum. A carga não precisou ser desfeita.

## 19. Pendências

O sistema ainda não está ativado. Falta autorização para apontar a aplicação ao banco novo, criar o titular real e abrir o uso. A conta `fd_app_prod` não altera estrutura. Uma mudança futura de tabela continua dependendo de uma conexão administrativa explícita, não do uso cotidiano.

## 20. Arquivos modificados

Somente `auditoria/h4cm-banco-operacional-preparado.md`. Os montadores temporários foram apagados e não entram no Git. O projeto oficial não foi editado.

## 21. Commit local

Commit local desta fase, filho de `50ff158ba064207b071badb44d3e2697fee13877`. O identificador completo fica no Git e na mensagem que acompanha este parecer.

## 22. Estado do Git

Branch `feat/h4-rebanho-sanidade-estoque`. O histórico anterior permanece. Depois deste commit, a branch fica cinco commits à frente de `409bc2bc7b9fcd50d0e9a41ab97e89e125cf283c`.

## 23. Ausência de push

Não houve push, merge, reset nem rebase.

## 24. Servidor oficial

`fazenda-digital-mysql` seguia no ar, saudável, com o mesmo tempo de atividade de antes da preparação. Não foi reiniciado. A porta não mudou. A porta 3000 não foi reiniciada. A aplicação oficial não foi apontada para o banco novo.

## 25. Próxima ação recomendada

Parar aqui. O banco está pronto e vazio. A próxima decisão, se o proprietário autorizar, é ativar uma instância com `FD_PRONTIDAO_DEFINITIVA=1`, a conta `fd_app_prod` e a criação do titular real. Isso não faz parte desta fase.

## Decisão

**VERDE — BANCO OPERACIONAL PREPARADO, AGUARDANDO ATIVAÇÃO**
