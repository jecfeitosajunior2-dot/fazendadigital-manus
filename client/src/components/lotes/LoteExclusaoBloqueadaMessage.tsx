import { LOTE_EXCLUSAO_PODE_REMOVER_ANIMAIS } from "@shared/loteExclusaoBloqueada";

type Props = {
  nomeLote: string;
  qtdAnimais: number;
};

export function LoteExclusaoBloqueadaMessage({ nomeLote, qtdAnimais }: Props) {
  const singular = qtdAnimais === 1;
  const qtdLabel = singular ? "1 animal vinculado" : `${qtdAnimais} animais vinculados`;
  const instrucao = singular
    ? LOTE_EXCLUSAO_PODE_REMOVER_ANIMAIS
      ? "Transfira ou remova esse animal antes de excluir o Lote."
      : "Transfira esse animal para outro Lote antes de excluir o Lote."
    : LOTE_EXCLUSAO_PODE_REMOVER_ANIMAIS
      ? "Transfira ou remova esses animais antes de excluir o Lote."
      : "Transfira esses animais para outro Lote antes de excluir o Lote.";

  return (
    <>
      O Lote{" "}
      <span className="font-semibold text-gray-900">&quot;{nomeLote}&quot;</span>{" "}
      possui{" "}
      <span className="font-semibold text-amber-700">{qtdLabel}</span>.
      {" "}{instrucao}
    </>
  );
}
