import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function middleware(req) {
  // Validate NEXTAUTH_SECRET is set
  const secret = process.env.NEXTAUTH_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  
  // In production, require proper secret
  if (isProduction && (!secret || secret === "your-secret-key-change-in-production")) {
    console.error("NEXTAUTH_SECRET is not properly configured for production");
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Configuration Error</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #e11d48; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    pre { background: #1f2937; color: #f9fafb; padding: 15px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Server configuration error</h1>
  <p><strong>NEXTAUTH_SECRET</strong> is missing or still set to the placeholder value.</p>
  <h2>Fix</h2>
  <ol>
    <li>Set <code>NEXTAUTH_SECRET</code> to a random string (at least 32 characters), e.g. <code>openssl rand -base64 32</code></li>
    <li>Set <code>NEXTAUTH_URL</code> to your public site URL (e.g. <code>https://your-domain.com</code>)</li>
    <li>Add these to your host&apos;s environment (Vercel / Docker / PM2 / systemd) and redeploy or restart</li>
  </ol>
  <p>See <code>DEPLOYMENT.md</code> in the repository.</p>
</body>
</html>`,
      {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
  
  // In development, warn but allow with fallback
  if (!isProduction && (!secret || secret === "your-secret-key-change-in-production")) {
    console.warn("⚠ NEXTAUTH_SECRET is not properly configured. Using fallback for development only.");
  }

  const token = await getToken({ 
    req, 
    secret: secret || "development-secret-change-in-production" 
  });
  const { pathname } = req.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // If user is not authenticated and trying to access protected route
  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // If user is authenticated and trying to access auth pages, redirect to home
  // Exception: /reset-password and /verify-email should always be accessible
  if (token && isPublicRoute && pathname !== "/reset-password" && !pathname.startsWith("/verify-email")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};

