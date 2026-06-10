-- Migration: adiciona fazendaId e pastoId na tabela animais
ALTER TABLE `animais` ADD COLUMN `fazendaId` int;
ALTER TABLE `animais` ADD COLUMN `pastoId` int;
