import { config } from "dotenv";
import mysql from "mysql2/promise";

config({ path: ".env.local" });
config();

if (!process.env.DATABASE_URL) {
  console.log(JSON.stringify({ erro: "DATABASE_URL ausente" }));
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [itens] = await conn.query(
    `SELECT
       e.id AS estoque_id,
       e.produto_id,
       e.nome AS produto,
       e.fazenda_id,
       f.nome AS fazenda,
       e.quantidade,
       e.valor_unitario,
       e.valor_total_estoque,
       e.capital_inicializado_em,
       e.controlar_saldo,
       e.unidade
     FROM estoque e
     LEFT JOIN fazendas f ON f.id = e.fazenda_id
     WHERE e.controlar_saldo = 1
     ORDER BY f.nome, e.nome, e.id`,
  );

  const relatorio = [];
  for (const item of itens) {
    const qtd = Number(item.quantidade ?? 0);
    const unit = Number(item.valor_unitario ?? 0);
    const exibido = Math.round(qtd * unit * 100) / 100;

    const [movs] = await conn.query(
      `SELECT id, tipo, status, quantidade, valor, valor_estoque_movimentado, operacao_id, created_at
       FROM estoque_movimentacoes
       WHERE estoque_id = ?
       ORDER BY id`,
      [item.estoque_id],
    );

    const temSemValor = movs.some((m) => m.valor == null && Number(m.quantidade) !== 0);
    const temEstorno = movs.some((m) => String(m.status || "").toLowerCase().includes("estorno"));
    const temAjuste = movs.some((m) => String(m.tipo || "").toLowerCase().includes("ajuste"));
    const temTransfer = movs.some((m) => String(m.tipo || "").toLowerCase().includes("transfer"));
    const nMovs = movs.length;
    const ultimaEntrada = [...movs].reverse().find((m) => Number(m.quantidade) > 0 && String(m.status || "ativa") === "ativa");

    let risco = "baixa";
    if (temTransfer || temAjuste) risco = "alta";
    else if (temSemValor || temEstorno) risco = "media";

    const linha = {
      estoque_id: item.estoque_id,
      produto_id: item.produto_id,
      produto: item.produto,
      fazenda_id: item.fazenda_id,
      fazenda: item.fazenda,
      quantidade_atual: item.quantidade,
      unidade: item.unidade,
      valor_unitario_atual: item.valor_unitario,
      valor_atualmente_exibido: exibido.toFixed(2),
      capital_inicial_atual: item.valor_total_estoque,
      capital_inicializado_em: item.capital_inicializado_em,
      ultima_entrada_id: ultimaEntrada?.id ?? null,
      ultima_entrada_valor: ultimaEntrada?.valor ?? null,
      numero_movimentacoes: nMovs,
      controlar_saldo: "Sim",
      movimentos_sem_valor: temSemValor,
      estornos_historicos: temEstorno,
      ajustes_quantitativos: temAjuste,
      transferencias: temTransfer,
      risco_reconstrucao: risco,
      candidato_a_valor_exibido: exibido.toFixed(2),
      candidato_b_reconstruido: null,
      candidato_b_motivo: "Sem saldo de abertura confiável — não reconstruir por heurística.",
    };

    if (
      String(item.produto || "").toLowerCase().includes("sal nitrogenado") &&
      Number(item.quantidade) === 50.98
    ) {
      linha.nota_homologacao = {
        quantidade: "50.98",
        valor_atualmente_exibido: exibido.toFixed(2),
        esperado_economico_apos_compra_139_37: "6605.28",
        divergencia: (exibido - 6605.28).toFixed(2),
        gravado: false,
      };
    }

    relatorio.push(linha);
  }

  const naoInicializados = relatorio.filter((r) => r.capital_inicial_atual == null).length;
  console.log(JSON.stringify({
    gerado_em: new Date().toISOString(),
    somente_select: true,
    total_controlados: relatorio.length,
    capital_ainda_null: naoInicializados,
    linhas: relatorio,
  }, null, 2));
} finally {
  await conn.end();
}
