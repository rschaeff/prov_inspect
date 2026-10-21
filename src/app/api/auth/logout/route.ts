/**
 * POST /api/auth/logout
 *
 * Destroy session and clear cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession, deleteSession, clearSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const sessionInfo = await getCurrentSession();

    if (sessionInfo) {
      await deleteSession(sessionInfo.session.session_token);
    }

    // Clear cookie
    await clearSessionCookie();

    return NextResponse.json({
      success: true
    });

  } catch (error) {
    console.error('Logout API error:', error);
    return NextResponse.json(
      {
        error: 'Logout failed',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
