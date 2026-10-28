/** Homologação local em http://localhost, sem relaxar HTTPS externo. */
export function isLocalHomologHost(host?: string | null): boolean {
  const h = String(host ?? "").split(":")[0].toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}
