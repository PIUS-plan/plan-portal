import { NextResponse, type NextRequest } from 'next/server';
import { clientIp, redeemCode, viewerCookie } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/* 공유 링크 /c/<코드>: 코드 입력 없이 바로 기획서로 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await redeemCode(decodeURIComponent(code), clientIp(request.headers));

  if (!result.ok) {
    return NextResponse.redirect(new URL(`/?e=${encodeURIComponent(result.error)}`, request.url));
  }
  const res = NextResponse.redirect(new URL(`/p/${result.slug}/`, request.url));
  res.cookies.set(viewerCookie(result.slug, result.token, result.maxAge));
  return res;
}
