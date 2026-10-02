/** Folga para não esticar a página por uns poucos pixels. */
export const DESKTOP_MENU_PAGE_GROW_SLACK_PX = 48;

/** Nutrição sozinha já passa da altura da tela — sem isso o menu corta e a rolagem some. */
export function deveEsticarPaginaPeloMenu(opts: {
  contentH: number;
  leftover: number;
  openGroups: number;
  slackPx?: number;
}): boolean {
  const slack = opts.slackPx ?? DESKTOP_MENU_PAGE_GROW_SLACK_PX;
  return opts.openGroups >= 1 && opts.contentH > opts.leftover + slack;
}
