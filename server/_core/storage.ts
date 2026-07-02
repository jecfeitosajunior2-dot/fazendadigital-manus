import { randomBytes } from "crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env";

const localStorageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/public/manus-storage",
);

async function uploadToLocalStorage(data: Buffer, ext: string): Promise<string> {
  await fs.mkdir(localStorageDir, { recursive: true });
  const key = `benfeitoria_${randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(localStorageDir, key), data);
  return `/manus-storage/${key}`;
}

export async function uploadToStorage(
  data: Buffer,
  contentType: string,
  ext: string
): Promise<string> {
  const forgeBaseUrl = env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, "");
  const forgeKey = env.BUILT_IN_FORGE_API_KEY;
  if (!forgeBaseUrl || !forgeKey) {
    return uploadToLocalStorage(data, ext);
  }

  const key = `benfeitoria_${randomBytes(8).toString("hex")}.${ext}`;
  const presignUrl = new URL("v1/storage/presign/put", `${forgeBaseUrl}/`);
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  if (!presignResp.ok) return uploadToLocalStorage(data, ext);

  const { url } = (await presignResp.json()) as { url: string };
  if (!url) return uploadToLocalStorage(data, ext);

  const putResp = await fetch(url, {
    method: "PUT",
    body: data,
    headers: { "Content-Type": contentType },
  });
  if (!putResp.ok) return uploadToLocalStorage(data, ext);

  return `/manus-storage/${key}`;
}

export async function resolveImageSlots(
  slots: (
    | { type: "empty" }
    | { type: "keep"; path: string }
    | { type: "new"; data: string; mimeType: string }
  )[] | undefined
): Promise<[string | null, string | null, string | null]> {
  const paths: (string | null)[] = [null, null, null];
  if (!slots?.length) return paths as [string | null, string | null, string | null];

  for (let i = 0; i < Math.min(slots.length, 3); i++) {
    const slot = slots[i];
    if (slot.type === "keep") paths[i] = slot.path;
    else if (slot.type === "new") {
      const buf = Buffer.from(slot.data, "base64");
      const ext = slot.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      paths[i] = await uploadToStorage(buf, slot.mimeType, ext);
    }
  }

  return paths as [string | null, string | null, string | null];
}
