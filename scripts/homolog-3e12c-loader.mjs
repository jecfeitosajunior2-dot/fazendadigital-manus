const DESTINO = new URL("./homolog-3e12c-vendaIntegracao.ts", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const texto = String(specifier);
  const ehFonte =
    (texto.includes("shared/vendaIntegracao") || texto.includes("shared\\vendaIntegracao"))
    && !texto.includes("homolog-3e12c-vendaIntegracao");
  if (ehFonte) {
    return { url: DESTINO, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
