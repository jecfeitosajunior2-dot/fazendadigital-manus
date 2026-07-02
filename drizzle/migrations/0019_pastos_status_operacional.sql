ALTER TABLE `pastos`
  MODIFY COLUMN `status` enum('ativo','descanso','vazio','reforma','interditado','reserva','sem_uso') DEFAULT 'ativo';
