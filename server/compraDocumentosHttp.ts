import type { Application, Request, Response } from "express";
import { verifySession } from "./_core/cookies";
import { compraDocumentosService } from "./compraDocumentosDb";

function contentDisposition(disposition: "inline" | "attachment", nomeOriginal: string): string {
  const safe = nomeOriginal.replace(/["\r\n\\]/g, "").trim() || "documento.pdf";
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_") || "documento.pdf";
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function handleCompraDocumentoArquivo(req: Request, res: Response) {
  const user = await verifySession(req).catch(() => null);
  if (!user) {
    res.status(401).send("Não autenticado.");
    return;
  }

  const documentoId = Number(req.params.id);
  if (!Number.isInteger(documentoId) || documentoId <= 0) {
    res.status(404).send("Documento não encontrado.");
    return;
  }

  const arquivo = await compraDocumentosService.carregarArquivo(user.id, documentoId);
  if (!arquivo) {
    res.status(404).send("Documento não encontrado.");
    return;
  }

  const disposition = req.query.disposition === "attachment" ? "attachment" : "inline";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", contentDisposition(disposition, arquivo.nomeOriginal));
  res.send(arquivo.buffer);
}

export function registerCompraDocumentosHttp(app: Application) {
  app.get("/api/compras/documentos/:id/arquivo", handleCompraDocumentoArquivo);
}
