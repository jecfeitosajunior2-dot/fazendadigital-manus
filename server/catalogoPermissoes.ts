/** Identificadores estáveis. O nome da tela não autoriza nada. */
export const MODULOS_PERMISSAO = [
  "animais",
  "lotes",
  "pesagens",
  "saude",
  "reproducao",
  "manejo",
  "compras",
  "vendas",
  "estoque",
  "financeiro",
  "manutencoes",
  "abastecimentos",
  "maquinas",
  "nutricao",
  "fazendas",
  "pastos",
  "benfeitorias",
  "brincos",
  "pessoas",
  "semen",
  "usuarios",
  "auditoria",
] as const;

export const OPERACOES_PERMISSAO = [
  "visualizar",
  "criar",
  "editar",
  "inativar",
  "confirmar",
  "cancelar",
  "estornar",
  "transferir",
  "desfazer_recebimento",
  "gerenciar_acessos",
  "gerenciar_permissoes",
  "alterar_papel",
] as const;

export type ModuloPermissao = (typeof MODULOS_PERMISSAO)[number];
export type OperacaoPermissao = (typeof OPERACOES_PERMISSAO)[number];

export type PermissaoDefinicao = {
  id: string;
  modulo: ModuloPermissao;
  operacao: OperacaoPermissao;
  descricao: string;
  sensivel: boolean;
  exclusivaDoPrincipal: boolean;
};

function item(
  modulo: ModuloPermissao,
  operacao: OperacaoPermissao,
  descricao: string,
  sensivel = false,
  exclusivaDoPrincipal = false,
): PermissaoDefinicao {
  return { id: `${modulo}.${operacao}`, modulo, operacao, descricao, sensivel, exclusivaDoPrincipal };
}

/**
 * Cada item corresponde a um procedimento que já existe.
 * Venda desfeita usa cancelar. Compra recebida desfeita usa desfazer_recebimento.
 * alterar_papel fica só com o principal e não se delega.
 */
export const CATALOGO_PERMISSOES: readonly PermissaoDefinicao[] = [
  item("animais", "visualizar", "Consultar animais"),
  item("animais", "criar", "Cadastrar animal ou importar planilha"),
  item("animais", "editar", "Alterar animal"),
  item("animais", "inativar", "Excluir animal ou registrar baixa"),
  item("animais", "transferir", "Transferir animal entre fazendas"),
  item("lotes", "visualizar", "Consultar lotes e movimentações"),
  item("lotes", "criar", "Cadastrar lote"),
  item("lotes", "editar", "Alterar lote, incluir ou mover animais"),
  item("lotes", "inativar", "Inativar ou excluir lote"),
  item("pesagens", "visualizar", "Consultar pesagens"),
  item("pesagens", "criar", "Registrar pesagem"),
  item("pesagens", "inativar", "Excluir pesagem"),
  item("saude", "visualizar", "Consultar lançamentos de saúde"),
  item("saude", "criar", "Registrar lançamento de saúde ou castração"),
  item("saude", "inativar", "Excluir lançamento de saúde"),
  item("reproducao", "visualizar", "Consultar reprodução"),
  item("reproducao", "criar", "Registrar reprodução ou parto"),
  item("reproducao", "editar", "Alterar reprodução ou a régua"),
  item("reproducao", "inativar", "Excluir lançamento de reprodução"),
  item("manejo", "criar", "Registrar identificação pontual de brinco"),
  item("compras", "visualizar", "Consultar compras"),
  item("compras", "criar", "Registrar compra"),
  item("compras", "confirmar", "Confirmar compra ou receber animal", true),
  item("compras", "cancelar", "Cancelar compra", true),
  item("compras", "desfazer_recebimento", "Desfazer recebimento de animal na compra", true),
  item("compras", "inativar", "Excluir compra legada"),
  item("vendas", "visualizar", "Consultar vendas"),
  item("vendas", "criar", "Registrar venda"),
  item("vendas", "confirmar", "Confirmar venda, inclusive a integrada", true),
  item("vendas", "cancelar", "Cancelar venda confirmada", true),
  item("vendas", "inativar", "Excluir venda sem animais"),
  item("estoque", "visualizar", "Consultar estoque e movimentações"),
  item("estoque", "criar", "Registrar produto ou movimentação"),
  item("estoque", "editar", "Alterar produto ou movimentação"),
  item("estoque", "inativar", "Inativar produto ou excluir movimentação"),
  item("estoque", "confirmar", "Confirmar compra ou transferência de insumo", true),
  item("estoque", "estornar", "Estornar movimentação de estoque", true),
  item("financeiro", "visualizar", "Consultar contas, títulos e extrato"),
  item("financeiro", "criar", "Registrar conta, título, categoria ou transferência"),
  item("financeiro", "editar", "Alterar conta ou parcelas"),
  item("financeiro", "inativar", "Inativar conta, categoria ou centro de custo"),
  item("financeiro", "confirmar", "Liquidar pagamento ou recebimento", true),
  item("financeiro", "estornar", "Estornar liquidação ou transferência", true),
  item("manutencoes", "visualizar", "Consultar manutenções"),
  item("manutencoes", "criar", "Registrar manutenção"),
  item("manutencoes", "editar", "Alterar manutenção"),
  item("manutencoes", "inativar", "Excluir manutenção"),
  item("manutencoes", "estornar", "Estornar manutenção", true),
  item("abastecimentos", "visualizar", "Consultar abastecimentos"),
  item("abastecimentos", "criar", "Registrar abastecimento"),
  item("abastecimentos", "editar", "Alterar abastecimento"),
  item("abastecimentos", "inativar", "Excluir abastecimento"),
  item("abastecimentos", "estornar", "Estornar abastecimento", true),
  item("maquinas", "visualizar", "Consultar máquinas"),
  item("maquinas", "criar", "Cadastrar ou importar máquina"),
  item("maquinas", "editar", "Alterar máquina"),
  item("maquinas", "inativar", "Inativar ou excluir máquina"),
  item("nutricao", "visualizar", "Consultar dietas, cochos, batidas e fornecimentos"),
  item("nutricao", "criar", "Registrar dieta, cocho, planejamento ou leitura"),
  item("nutricao", "editar", "Alterar dieta, cocho, planejamento ou leitura"),
  item("nutricao", "inativar", "Inativar dieta ou cocho, ou encerrar planejamento"),
  item("nutricao", "confirmar", "Confirmar batida ou fornecimento", true),
  item("nutricao", "estornar", "Estornar batida ou fornecimento", true),
  item("nutricao", "cancelar", "Cancelar planejamento ou leitura de cocho", true),
  item("fazendas", "visualizar", "Consultar fazendas"),
  item("fazendas", "criar", "Cadastrar fazenda"),
  item("fazendas", "editar", "Alterar fazenda"),
  item("fazendas", "inativar", "Excluir fazenda"),
  item("pastos", "visualizar", "Consultar pastos"),
  item("pastos", "criar", "Cadastrar pasto"),
  item("pastos", "editar", "Alterar pasto ou coordenadas"),
  item("pastos", "inativar", "Excluir pasto"),
  item("benfeitorias", "visualizar", "Consultar benfeitorias"),
  item("benfeitorias", "criar", "Cadastrar ou importar benfeitoria"),
  item("benfeitorias", "editar", "Alterar benfeitoria"),
  item("benfeitorias", "inativar", "Excluir benfeitoria"),
  item("brincos", "visualizar", "Consultar brincos"),
  item("brincos", "criar", "Registrar brinco"),
  item("brincos", "inativar", "Excluir brinco"),
  item("pessoas", "visualizar", "Consultar pessoas"),
  item("pessoas", "criar", "Cadastrar pessoa"),
  item("pessoas", "editar", "Alterar pessoa"),
  item("pessoas", "inativar", "Inativar pessoa"),
  item("semen", "visualizar", "Consultar sêmen"),
  item("semen", "criar", "Registrar entrada ou catálogo externo"),
  item("semen", "editar", "Corrigir entrada, ajustar estoque ou alterar catálogo"),
  item("usuarios", "criar", "Criar usuário comum"),
  item("usuarios", "inativar", "Inativar usuário", true),
  item("usuarios", "gerenciar_acessos", "Conceder ou revogar fazenda", true),
  item("usuarios", "gerenciar_permissoes", "Alterar permissões de outra pessoa", true),
  item("usuarios", "alterar_papel", "Nomear ou remover administrador secundário", true, true),
  item("auditoria", "visualizar", "Consultar eventos administrativos da própria conta", true),
];

const POR_ID = new Map(CATALOGO_PERMISSOES.map((definicao) => [definicao.id, definicao]));

export function permissaoPorId(id: string): PermissaoDefinicao | null {
  return POR_ID.get(id) ?? null;
}

export function permissaoExigeFazenda(definicao: PermissaoDefinicao): boolean {
  return definicao.modulo !== "usuarios" && definicao.modulo !== "auditoria";
}
