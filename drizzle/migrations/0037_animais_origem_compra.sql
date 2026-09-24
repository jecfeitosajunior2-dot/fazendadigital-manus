-- Origem comercial do animal. Nullable. Sem backfill. Sem CASCADE.

ALTER TABLE `animais`
  ADD COLUMN `compraId` INT NULL,
  ADD COLUMN `compraGrupoId` INT NULL;

CREATE INDEX `animais_compra_idx` ON `animais` (`compraId`);
CREATE INDEX `animais_compra_grupo_idx` ON `animais` (`compraGrupoId`);
