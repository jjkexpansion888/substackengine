import { NextResponse, type NextRequest } from "next/server";
import { isPrivateDeployment, privateDeploymentAuthorized, privateDeploymentReady, privateOrigin } from "@/lib/api/privateDeployment";

export async function middleware(request: NextRequest) {
  if (!isPrivateDeployment()) return NextResponse.next();
  if (request.nextUrl.pathname === "/api/health" && request.method === "GET") return NextResponse.next();
  if (!privateDeploymentReady()) return new NextResponse("Private deployment is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } });
  const origin = new URL(privateOrigin()!);
  if (request.headers.get("host") !== origin.host || request.headers.get("x-forwarded-proto") === "http") return new NextResponse("Use the configured HTTPS address.", { status: 403 });
  if (!await privateDeploymentAuthorized(request)) return new NextResponse("Sign in to this private workspace.", {
    status: 401, headers: { "WWW-Authenticate": 'Basic realm="Substack Engine", charset="UTF-8"', "Cache-Control": "no-store" },
  });
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
