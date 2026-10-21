/**
 * POST /api/auth/login
 *
 * Simple username-based login for internal tool
 * Creates session and sets cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSession, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Username required' },
        { status: 400 }
      );
    }

    // Get IP and User-Agent for session tracking
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Create session
    const sessionInfo = await createSession(username, ipAddress, userAgent);

    if (!sessionInfo) {
      return NextResponse.json(
        { error: 'Invalid username or curator is inactive' },
        { status: 401 }
      );
    }

    // Set session cookie
    await setSessionCookie(sessionInfo.session.session_token);

    // Return success with curator info
    return NextResponse.json({
      success: true,
      curator: {
        id: sessionInfo.curator.id,
        username: sessionInfo.curator.username,
        display_name: sessionInfo.curator.display_name
      },
      session_expires_at: sessionInfo.session.expires_at
    });

  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      {
        error: 'Login failed',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
