import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL!, connectionLimit: 1 });
  const db = drizzle(pool);
  
  await db.execute(sql`CREATE TABLE IF NOT EXISTS estoque (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    unidade VARCHAR(50),
    quantidade DECIMAL(10,2) NOT NULL DEFAULT 0,
    quantidade_minima DECIMAL(10,2),
    valor_unitario DECIMAL(10,2),
    localizacao VARCHAR(255),
    observacoes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  console.log("estoque created");
  
  await db.execute(sql`CREATE TABLE IF NOT EXISTS contas_financeiras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    tipo ENUM('corrente','poupanca','caixa','investimento') NOT NULL DEFAULT 'corrente',
    banco VARCHAR(255),
    saldo_inicial DECIMAL(15,2) NOT NULL DEFAULT 0,
    saldo_atual DECIMAL(15,2) NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("contas_financeiras created");
  
  await db.execute(sql`CREATE TABLE IF NOT EXISTS categorias_financeiras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    tipo ENUM('receita','despesa') NOT NULL,
    cor VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("categorias_financeiras created");
  
  await db.execute(sql`CREATE TABLE IF NOT EXISTS movimentacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conta_id INT NOT NULL,
    categoria_id INT,
    tipo ENUM('receita','despesa','transferencia') NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    valor DECIMAL(15,2) NOT NULL,
    data DATE NOT NULL,
    status ENUM('pendente','confirmado','cancelado') NOT NULL DEFAULT 'confirmado',
    observacoes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("movimentacoes created");
  
  await pool.end();
  console.log("All tables created!");
}

main().catch(err => { console.error("Error:", err.message); process.exit(1); });
