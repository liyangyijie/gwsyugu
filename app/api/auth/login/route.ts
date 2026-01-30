import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;
    const envPassword = process.env.PASSWORD;

    if (!envPassword) {
      // If no password configured, login is not needed, but if this endpoint is hit,
      // something might be wrong or we just treat it as success?
      // Based on reqs, if no password, access is open. But if user is here, they probably want to login.
      // Let's assume if envPassword is not set, we can't really "login" against it.
      // But middleware should allow access anyway.
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (password === envPassword) {
      // Password matches
      const secret = new TextEncoder().encode(envPassword);
      const token = await new SignJWT({ authenticated: true })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h') // Session lasts 24 hours
        .sign(secret);

      const response = NextResponse.json({ success: true });

      response.cookies.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      });

      return response;
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
