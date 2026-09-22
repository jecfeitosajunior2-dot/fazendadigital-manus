/** Semântica compartilhada de `pessoas.list` — não muda o default (somente ativos). */

export function deveRestringirPessoasListAosAtivos(incluirInativos?: boolean): boolean {
  return incluirInativos !== true;
}

export function pessoaVisivelNaListagem(
  ativo: boolean | null | undefined,
  incluirInativos?: boolean,
): boolean {
  if (deveRestringirPessoasListAosAtivos(incluirInativos)) return ativo !== false;
  return true;
}
