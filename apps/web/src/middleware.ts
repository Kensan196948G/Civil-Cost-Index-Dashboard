import { NextRequest, NextResponse } from "next/server";

// ルートは standalone デザイン HTML をURL変更なしで直接表示する
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/standalone.html", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
