export function isLocalRequest(request: Request, write = false): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && request.headers.get("host") === url.host
    && request.headers.get("sec-fetch-site") !== "cross-site"
    && (write ? origin === url.origin : !origin || origin === url.origin);
}
