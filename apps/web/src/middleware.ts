import { NextRequest, NextResponse } from "next/server";

// ルート「/」を standalone HTML へサーバー内 rewrite（URL不変・リダイレクトなし）
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/standalone.html", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
