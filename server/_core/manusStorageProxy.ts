import type { Application, Request, Response } from "express";
import { env } from "./env";

async function redirectToSignedUrl(req: Request, res: Response) {
  const key = req.path.replace(/^\/manus-storage\/?/, "");
  if (!key) {
    res.status(400).send("Missing storage key");
    return;
  }

  const forgeBaseUrl = env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, "");
  const forgeKey = env.BUILT_IN_FORGE_API_KEY;
  if (!forgeBaseUrl || !forgeKey) {
    res.status(500).send("Storage proxy not configured");
    return;
  }

  try {
    const forgeUrl = new URL("v1/storage/presign/get", `${forgeBaseUrl}/`);
    forgeUrl.searchParams.set("path", key);
    const forgeResp = await fetch(forgeUrl, {
      headers: { Authorization: `Bearer ${forgeKey}` },
    });
    if (!forgeResp.ok) {
      res.status(502).send("Storage backend error");
      return;
    }
    const { url } = (await forgeResp.json()) as { url: string };
    if (!url) {
      res.status(502).send("Empty signed URL");
      return;
    }
    res.redirect(307, url);
  } catch {
    res.status(502).send("Storage proxy error");
  }
}

export function registerManusStorageProxy(app: Application) {
  app.get("/manus-storage/*", redirectToSignedUrl);
}
