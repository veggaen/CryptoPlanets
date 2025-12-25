import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

const OWNER_COOKIE_NAME = 'planetchart_owner';

function getOwnerSecret(): string {
  return process.env.PLANETCHART_OWNER_KEY || process.env.OWNER_KEY || '';
}

function computeOwnerCookieValue(secret: string): string {
  return crypto.createHmac('sha256', secret).update('owner').digest('hex');
}

export async function GET(request: NextRequest) {
  const secret = getOwnerSecret();
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'Owner key is not configured on the server' },
      { status: 500 }
    );
  }

  const key = request.nextUrl.searchParams.get('key') || '';
  if (!key || key !== secret) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const value = computeOwnerCookieValue(secret);
  const res = NextResponse.json({ success: true });

  res.cookies.set({
    name: OWNER_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return res;
}
