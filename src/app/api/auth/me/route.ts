/**
 * GET /api/auth/me
 *
 * Get current user session info
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const sessionInfo = await getCurrentSession();

    if (!sessionInfo) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      curator: {
        id: sessionInfo.curator.id,
        username: sessionInfo.curator.username,
        display_name: sessionInfo.curator.display_name,
        email: sessionInfo.curator.email
      },
      session: {
        expires_at: sessionInfo.session.expires_at,
        last_activity: sessionInfo.session.last_activity
      }
    });

  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}
