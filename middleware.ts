import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const envPassword = process.env.PASSWORD;

  // 1. If no password set, allow everything
  if (!envPassword) {
    return NextResponse.next();
  }

  // 2. Define public paths (login page, static files, api auth)
  const path = request.nextUrl.pathname;
  if (
    path.startsWith('/_next') ||
    path.startsWith('/static') ||
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 3. Check for auth token
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    // Redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // 4. Verify token
    const secret = new TextEncoder().encode(envPassword);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch (err) {
    // Token invalid or expired
    console.error('Token verification failed:', err);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (except /api/auth which is handled above but good to exclude general api if needed, though we protect them)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
