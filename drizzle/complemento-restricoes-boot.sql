-- Complemento do banco definitivo.
-- O modelo Drizzle cria as 62 tabelas e não declara estas restrições.
-- O verificador de arranque já as exige. Este arquivo só acrescenta.
-- Não faz parte da cadeia 0000. Não reaplica 0060, 0067, 0068, 0069, 0070 nem 0077.

CREATE UNIQUE INDEX `animal_baixas_animal_ativa_uq`
  ON `animal_baixas` ((CASE WHEN `status` = 'ativa' THEN `animalId` END));

ALTER TABLE `compra_grupos`
  ADD CONSTRAINT `compra_grupos_compra_fk`
  FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `compra_recebimentos`
  ADD CONSTRAINT `compra_recebimentos_compra_fk`
  FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `compra_recebimentos`
  ADD CONSTRAINT `compra_recebimentos_grupo_fk`
  FOREIGN KEY (`compra_grupo_id`) REFERENCES `compra_grupos` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `pesagens`
  ADD CONSTRAINT `pesagens_compra_recebimento_fk`
  FOREIGN KEY (`compraRecebimentoId`) REFERENCES `compra_recebimentos` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `animal_lote_movimentacoes`
  ADD CONSTRAINT `animal_lote_mov_compra_recebimento_fk`
  FOREIGN KEY (`compraRecebimentoId`) REFERENCES `compra_recebimentos` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `estoque_movimentacoes`
  ADD CONSTRAINT `estoque_movimentacoes_operacao_fk`
  FOREIGN KEY (`operacao_id`) REFERENCES `estoque_operacoes` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_titulos`
  ADD CONSTRAINT `financeiro_titulos_pessoa_fk`
  FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_movimentos`
  ADD CONSTRAINT `financeiro_movimentos_pessoa_fk`
  FOREIGN KEY (`contraparte_pessoa_id`) REFERENCES `pessoas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_titulos`
  ADD CONSTRAINT `financeiro_titulos_fazenda_fk`
  FOREIGN KEY (`fazenda_origem_id`) REFERENCES `fazendas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_centros_custo`
  ADD CONSTRAINT `financeiro_centros_custo_fazenda_fk`
  FOREIGN KEY (`fazenda_id`) REFERENCES `fazendas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_apropriacoes`
  ADD CONSTRAINT `financeiro_apropriacoes_fazenda_fk`
  FOREIGN KEY (`fazenda_id`) REFERENCES `fazendas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_categorias`
  ADD CONSTRAINT `financeiro_categorias_pai_fk`
  FOREIGN KEY (`categoria_pai_id`) REFERENCES `financeiro_categorias` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_parcelas`
  ADD CONSTRAINT `financeiro_parcelas_titulo_fk`
  FOREIGN KEY (`titulo_id`) REFERENCES `financeiro_titulos` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_liquidacoes`
  ADD CONSTRAINT `financeiro_liquidacoes_conta_fk`
  FOREIGN KEY (`conta_id`) REFERENCES `financeiro_contas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_liquidacoes`
  ADD CONSTRAINT `financeiro_liquidacoes_original_fk`
  FOREIGN KEY (`liquidacao_original_id`) REFERENCES `financeiro_liquidacoes` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_liquidacao_alocacoes`
  ADD CONSTRAINT `financeiro_alocacoes_liquidacao_fk`
  FOREIGN KEY (`liquidacao_id`) REFERENCES `financeiro_liquidacoes` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_liquidacao_alocacoes`
  ADD CONSTRAINT `financeiro_alocacoes_parcela_fk`
  FOREIGN KEY (`parcela_id`) REFERENCES `financeiro_parcelas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_transferencias`
  ADD CONSTRAINT `financeiro_transferencias_origem_fk`
  FOREIGN KEY (`conta_origem_id`) REFERENCES `financeiro_contas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_transferencias`
  ADD CONSTRAINT `financeiro_transferencias_destino_fk`
  FOREIGN KEY (`conta_destino_id`) REFERENCES `financeiro_contas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_transferencias`
  ADD CONSTRAINT `financeiro_transferencias_original_fk`
  FOREIGN KEY (`transferencia_original_id`) REFERENCES `financeiro_transferencias` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_movimentos`
  ADD CONSTRAINT `financeiro_movimentos_conta_fk`
  FOREIGN KEY (`conta_id`) REFERENCES `financeiro_contas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_movimentos`
  ADD CONSTRAINT `financeiro_movimentos_liquidacao_fk`
  FOREIGN KEY (`liquidacao_id`) REFERENCES `financeiro_liquidacoes` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_movimentos`
  ADD CONSTRAINT `financeiro_movimentos_transf_fk`
  FOREIGN KEY (`transferencia_id`) REFERENCES `financeiro_transferencias` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_movimentos`
  ADD CONSTRAINT `financeiro_movimentos_original_fk`
  FOREIGN KEY (`movimento_original_id`) REFERENCES `financeiro_movimentos` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_apropriacoes`
  ADD CONSTRAINT `financeiro_apropriacoes_titulo_fk`
  FOREIGN KEY (`titulo_id`) REFERENCES `financeiro_titulos` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_apropriacoes`
  ADD CONSTRAINT `financeiro_apropriacoes_categoria_fk`
  FOREIGN KEY (`categoria_id`) REFERENCES `financeiro_categorias` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `financeiro_apropriacoes`
  ADD CONSTRAINT `financeiro_apropriacoes_centro_fk`
  FOREIGN KEY (`centro_custo_id`) REFERENCES `financeiro_centros_custo` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `usuario_fazendas`
  ADD CONSTRAINT `usuario_fazendas_user_fk`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `usuario_fazendas`
  ADD CONSTRAINT `usuario_fazendas_fazenda_fk`
  FOREIGN KEY (`fazendaId`) REFERENCES `fazendas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `usuario_fazendas`
  ADD CONSTRAINT `usuario_fazendas_concedido_fk`
  FOREIGN KEY (`concedidoPorUserId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `auditoria_eventos`
  ADD CONSTRAINT `auditoria_eventos_executor_fk`
  FOREIGN KEY (`executorUserId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `auditoria_eventos`
  ADD CONSTRAINT `auditoria_eventos_titular_fk`
  FOREIGN KEY (`titularUserId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `auditoria_eventos`
  ADD CONSTRAINT `auditoria_eventos_fazenda_fk`
  FOREIGN KEY (`fazendaId`) REFERENCES `fazendas` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `perfis_acesso`
  ADD CONSTRAINT `perfis_acesso_titular_fk`
  FOREIGN KEY (`titularUserId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `perfis_acesso`
  ADD CONSTRAINT `perfis_acesso_criado_por_fk`
  FOREIGN KEY (`criadoPorUserId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `perfil_permissoes`
  ADD CONSTRAINT `perfil_permissoes_perfil_fk`
  FOREIGN KEY (`perfilId`) REFERENCES `perfis_acesso` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `usuario_permissoes`
  ADD CONSTRAINT `usuario_permissoes_user_fk`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `usuario_permissoes`
  ADD CONSTRAINT `usuario_permissoes_usuario_titular_fk`
  FOREIGN KEY (`userId`, `titularUserId`) REFERENCES `users` (`id`, `titularUserId`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `usuario_permissoes`
  ADD CONSTRAINT `usuario_permissoes_concedido_fk`
  FOREIGN KEY (`concedidoPorUserId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `usuario_permissoes`
  ADD CONSTRAINT `usuario_permissoes_titular_fk`
  FOREIGN KEY (`titularUserId`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `usuario_permissoes`
  ADD CONSTRAINT `usuario_permissoes_origem_fk`
  FOREIGN KEY (`origemPerfilId`, `titularUserId`) REFERENCES `perfis_acesso` (`id`, `titularUserId`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
