import 'server-only';
import { createHash, randomInt } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { serviceClient } from './supabase/server';

/* 접근 코드: 헷갈리는 문자(0 O 1 I L) 제외, 8자리, XXXX-XXXX 로 표시 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashCode = (code: string) => createHash('sha256').update(normalizeCode(code)).digest('hex');

/* 열람 쿠키: 기획서마다 따로, /p/<slug> 경로에만 전송 */
const MAX_AGE = 60 * 60 * 24 * 7; // 7일
export const cookieName = (slug: string) => `pv_${slug.replace(/[^a-z0-9]/g, '_')}`;
const secret = () => {
  const s = process.env.VIEWER_JWT_SECRET;
  if (!s || s.length < 32) throw new Error('VIEWER_JWT_SECRET 는 32자 이상이어야 합니다');
  return new TextEncoder().encode(s);
};

export type ViewerClaims = { pid: string; cid: string };

export async function signViewer(claims: ViewerClaims, codeExpiresAt: string | null) {
  const now = Math.floor(Date.now() / 1000);
  const codeExp = codeExpiresAt ? Math.floor(new Date(codeExpiresAt).getTime() / 1000) : Infinity;
  const exp = Math.min(now + MAX_AGE, codeExp);
  const token = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt(now).setExpirationTime(exp).sign(secret());
  return { token, maxAge: exp - now };
}

export async function verifyViewer(token: string | undefined): Promise<ViewerClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.pid === 'string' && typeof payload.cid === 'string' ? { pid: payload.pid, cid: payload.cid } : null;
  } catch {
    return null;
  }
}

export const clientIp = (h: Headers) => h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';

/* 코드 입력 → 검증. 10분에 10회 실패하면 잠시 차단 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 10;

export type Redeemed = { ok: true; slug: string; token: string; maxAge: number } | { ok: false; error: string };

export async function redeemCode(raw: string, ip: string): Promise<Redeemed> {
  const db = serviceClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await db.from('access_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
  if ((count ?? 0) >= MAX_FAILS) return { ok: false, error: '시도 횟수가 많습니다. 10분 뒤에 다시 시도해 주세요.' };

  const fail = async (error: string): Promise<Redeemed> => {
    await db.from('access_attempts').insert({ ip });
    return { ok: false, error };
  };

  if (normalizeCode(raw).length !== 8) return fail('코드 8자리를 확인해 주세요.');

  const { data: code } = await db
    .from('access_codes')
    .select('id, plan_id, expires_at, revoked_at, plans!inner(slug, status)')
    .eq('code_hash', hashCode(raw))
    .maybeSingle();
  const plan = code?.plans as unknown as { slug: string; status: string } | undefined;

  if (!code || !plan) return fail('코드가 올바르지 않습니다.');
  if (code.revoked_at || (code.expires_at && new Date(code.expires_at) <= new Date())) return fail('만료된 코드입니다. 담당자에게 문의해 주세요.');
  if (plan.status !== 'active') return fail('지금은 열람할 수 없는 기획서입니다. 담당자에게 문의해 주세요.');

  const { token, maxAge } = await signViewer({ pid: code.plan_id, cid: code.id }, code.expires_at);
  return { ok: true, slug: plan.slug, token, maxAge };
}

export const viewerCookie = (slug: string, token: string, maxAge: number) => ({
  name: cookieName(slug),
  value: token,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: `/p/${slug}`,
  maxAge,
});
