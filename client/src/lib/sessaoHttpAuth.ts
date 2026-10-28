/** Só auth.me (cookie HTTP). localStorage não prova sessão. */
export function sessaoHttpConfirmada(user: { id?: number } | null | undefined): boolean {
  return user != null && Number.isFinite(Number(user.id)) && Number(user.id) > 0;
}

export async function invalidarConsultasAposSessaoHttp(utils: {
  auth: { me: { invalidate: () => Promise<unknown> } };
  fazendas: { list: { invalidate: () => Promise<unknown> } };
  financeiroV2: { invalidate: () => Promise<unknown> };
}) {
  await Promise.all([
    utils.auth.me.invalidate(),
    utils.fazendas.list.invalidate(),
    utils.financeiroV2.invalidate(),
  ]);
}
