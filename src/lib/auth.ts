/**
 * Authentication utilities for curator sessions
 * Database-backed sessions with cookie-based auth
 *
 * Copied from pyecod_vis/src/lib/auth.ts. Same tables, same cookie name:
 * cookies are scoped by host, not port, so a curator logged in to pyecod_vis
 * on leda is logged in here too, and vice versa.
 */

import { query } from '@/lib/db';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export interface Curator {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  is_active: boolean;
}

export interface Session {
  id: number;
  curator_id: number;
  session_token: string;
  created_at: Date;
  expires_at: Date;
  last_activity: Date;
}

export interface SessionInfo {
  curator: Curator;
  session: Session;
}

const SESSION_COOKIE_NAME = 'ecod_curator_session';
const SESSION_DURATION_DAYS = 7;

/**
 * Generate a cryptographically secure random session token
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a new session for a curator
 */
export async function createSession(
  username: string,
  ipAddress?: string,
  userAgent?: string
): Promise<SessionInfo | null> {
  try {
    // Find curator by username
    const curatorResult = await query(
      `SELECT id, username, display_name, email, is_active
       FROM ecod_curation.curator
       WHERE username = $1 AND is_active = TRUE`,
      [username]
    );

    if (curatorResult.rows.length === 0) {
      return null;
    }

    const curator: Curator = curatorResult.rows[0];

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    // Create session
    const sessionResult = await query(
      `INSERT INTO ecod_curation.curator_session
       (curator_id, session_token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, curator_id, session_token, created_at, expires_at, last_activity`,
      [curator.id, sessionToken, expiresAt, ipAddress, userAgent]
    );

    const session: Session = sessionResult.rows[0];

    // Update last_login
    await query(
      `UPDATE ecod_curation.curator
       SET last_login = NOW()
       WHERE id = $1`,
      [curator.id]
    );

    return { curator, session };
  } catch (error) {
    console.error('Error creating session:', error);
    return null;
  }
}

/**
 * Validate a session token and return curator info
 */
export async function validateSession(sessionToken: string): Promise<SessionInfo | null> {
  try {
    const result = await query(
      `SELECT
        s.id, s.curator_id, s.session_token, s.created_at, s.expires_at, s.last_activity,
        c.id as c_id, c.username, c.display_name, c.email, c.is_active
       FROM ecod_curation.curator_session s
       JOIN ecod_curation.curator c ON s.curator_id = c.id
       WHERE s.session_token = $1
         AND s.expires_at > NOW()
         AND c.is_active = TRUE`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    const curator: Curator = {
      id: row.c_id,
      username: row.username,
      display_name: row.display_name,
      email: row.email,
      is_active: row.is_active
    };

    const session: Session = {
      id: row.id,
      curator_id: row.curator_id,
      session_token: row.session_token,
      created_at: row.created_at,
      expires_at: row.expires_at,
      last_activity: row.last_activity
    };

    // Update last_activity (sliding window)
    await query(
      `UPDATE ecod_curation.curator_session
       SET last_activity = NOW()
       WHERE id = $1`,
      [session.id]
    );

    return { curator, session };
  } catch (error) {
    console.error('Error validating session:', error);
    return null;
  }
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(sessionToken: string): Promise<boolean> {
  try {
    const result = await query(
      `DELETE FROM ecod_curation.curator_session
       WHERE session_token = $1`,
      [sessionToken]
    );

    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
}

/**
 * Get current session from cookies (for use in server components/API routes)
 */
export async function getCurrentSession(): Promise<SessionInfo | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  return validateSession(sessionToken);
}

/**
 * Set session cookie
 */
export async function setSessionCookie(sessionToken: string): Promise<void> {
  const cookieStore = await cookies();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    // leda serves plain http, production included, and browsers never send a
    // Secure cookie back over http. Set COOKIE_SECURE=1 if this moves behind https.
    secure: process.env.COOKIE_SECURE === '1',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/'
  });
}

/**
 * Clear session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Clean up expired sessions (should be called periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const result = await query(
      `SELECT ecod_curation.cleanup_expired_sessions() as deleted_count`
    );
    return result.rows[0].deleted_count;
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    return 0;
  }
}
