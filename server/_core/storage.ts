import { randomBytes } from "crypto";
import { env } from "./env";

export async function uploadToStorage(
  data: Buffer,
  contentType: string,
  ext: string
): Promise<string | null> {
  const forgeBaseUrl = env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, "");
  const forgeKey = env.BUILT_IN_FORGE_API_KEY;
  if (!forgeBaseUrl || !forgeKey) return null;

  const key = `benfeitoria_${randomBytes(8).toString("hex")}.${ext}`;
  const presignUrl = new URL("v1/storage/presign/put", `${forgeBaseUrl}/`);
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  if (!presignResp.ok) return null;

  const { url } = (await presignResp.json()) as { url: string };
  if (!url) return null;

  const putResp = await fetch(url, {
    method: "PUT",
    body: data,
    headers: { "Content-Type": contentType },
  });
  if (!putResp.ok) return null;

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
      const stored = await uploadToStorage(buf, slot.mimeType, ext);
      paths[i] = stored ?? `data:${slot.mimeType};base64,${slot.data}`;
    }
  }

  return paths as [string | null, string | null, string | null];
}
