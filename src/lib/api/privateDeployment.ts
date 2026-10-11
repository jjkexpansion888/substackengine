export function isPrivateDeployment(): boolean {
  return process.env.DEPLOYMENT_MODE === "private" || !!process.env.RAILWAY_ENVIRONMENT_ID;
}

export function privateOrigin(): string | null {
  try {
    const url = new URL(process.env.APP_ORIGIN ?? "");
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

export function privateDeploymentReady(): boolean {
  return privateOrigin() !== null && /^[a-zA-Z0-9_-]{1,100}$/.test(process.env.APP_USERNAME ?? "") && /^[\x21-\x7e]{32,256}$/.test(process.env.APP_PASSWORD ?? "");
}

export async function privateDeploymentAuthorized(request: Request): Promise<boolean> {
  if (!privateDeploymentReady()) return false;
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length > 2000) return false;
  const expected = `Basic ${btoa(`${process.env.APP_USERNAME}:${process.env.APP_PASSWORD}`)}`;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const actualHash = await digest(authorization), expectedHash = await digest(expected);
  let difference = 0;
  for (let i = 0; i < expectedHash.length; i++) difference |= actualHash[i] ^ expectedHash[i];
  return difference === 0;
}
