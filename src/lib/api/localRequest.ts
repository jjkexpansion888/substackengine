import { isPrivateDeployment, privateDeploymentAuthorized, privateOrigin } from "./privateDeployment";

export async function isLocalRequest(request: Request, write = false): Promise<boolean> {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (isPrivateDeployment()) {
    const configured = privateOrigin();
    return !!configured && request.headers.get("host") === new URL(configured).host
      && request.headers.get("sec-fetch-site") !== "cross-site"
      && (write ? origin === configured : !origin || origin === configured)
      && await privateDeploymentAuthorized(request);
  }
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && request.headers.get("host") === url.host
    && request.headers.get("sec-fetch-site") !== "cross-site"
    && (write ? origin === url.origin : !origin || origin === url.origin);
}
