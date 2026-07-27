-- Tipo de medidor e data de aquisição no cadastro de máquinas
ALTER TABLE `maquinas`
  ADD COLUMN `tipoMedidor` varchar(30) NULL AFTER `horimetro`,
  ADD COLUMN `dataAquisicao` date NULL AFTER `anoAquisicao`;
