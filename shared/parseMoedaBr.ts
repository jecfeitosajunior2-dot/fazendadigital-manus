/**
 * Converte valores monetários no padrão brasileiro para string decimal "1234.56".
 * Usado na importação de planilhas (benfeitorias, maquinários, etc.).
 *
 * Aceita: "150.000,00" | "150.000" | "150,00" | "150000" | "R$ 1.500.000,00" | "150.00" (US)
 */
export function parseMoedaBr(val: string | number): string {
  if (val == null || val === '') return '';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val.toFixed(2) : '';
  }

  let v = val.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!v) return '';

  const hasComma = v.includes(',');
  const hasDot = v.includes('.');

  // Formato BR com vírgula decimal: 1.234.567,89 | 150,00 | 150.000,00
  if (hasComma) {
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n.toFixed(2) : '';
  }

  // Apenas ponto — distinguir milhar BR (150.000) de decimal US (150.00)
  if (hasDot) {
    const parts = v.split('.');
    const last = parts[parts.length - 1];

    // US: um único ponto com exatamente 2 casas decimais → 150.00
    if (parts.length === 2 && last.length === 2 && /^\d{2}$/.test(last)) {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n.toFixed(2) : '';
    }

    // BR milhar: grupos de 3 após o primeiro (1.500.000 | 150.000)
    const isBrMilhar = parts.length >= 2
      && /^\d{1,3}$/.test(parts[0])
      && parts.slice(1).every(p => /^\d{3}$/.test(p));
    if (isBrMilhar) {
      const n = parseFloat(v.replace(/\./g, ''));
      return Number.isFinite(n) ? n.toFixed(2) : '';
    }
  }

  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n.toFixed(2) : '';
}
