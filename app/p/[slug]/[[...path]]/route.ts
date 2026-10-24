import { NextResponse, type NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { BUCKET, getAdmin, serviceClient } from '@/lib/supabase/server';
import { clientIp, cookieName, verifyViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', txt: 'text/plain; charset=utf-8',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', map: 'application/json',
};

/* /p/<slug>/<path>: 열람 쿠키(또는 관리자 세션)를 확인하고 Storage 의 빌드 결과물을 그대로 응답 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path: segments = [] } = await params;
  const url = request.nextUrl;

  // /p/<slug>/~<versionId>/... 는 관리자의 특정 버전 미리보기 (에셋 상대경로도 같은 버전으로 풀린다)
  const asked = segments[0]?.startsWith('~') ? segments[0].slice(1) : null;
  const path = asked ? segments.slice(1) : segments;

  // 상대경로가 맞게 풀리도록 /p/<slug> → /p/<slug>/
  if (path.length === 0 && !url.pathname.endsWith('/')) {
    return NextResponse.redirect(new URL(`${url.pathname}/${url.search}`, url), 308);
  }
  if (path.some((seg) => seg === '..' || seg === '.' || seg.includes('\\'))) return new NextResponse(null, { status: 400 });

  const file = path.length ? path.map(decodeURIComponent).join('/') : 'index.html';
  const ext = file.includes('.') ? file.split('.').pop()!.toLowerCase() : '';
  const isDocument = ext === '' || ext === 'html';

  const deny = () =>
    isDocument
      ? NextResponse.redirect(new URL(`/?p=${encodeURIComponent(slug)}`, url))
      : new NextResponse(null, { status: 401 });

  const db = serviceClient();
  const { data: plan } = await db.from('plans').select('id, status, current_version_id').eq('slug', slug).maybeSingle();
  if (!plan) return deny();

  // 고객: 코드로 받은 쿠키. 코드가 폐기/만료됐거나 기획서가 비활성이면 바로 막힌다.
  const claims = await verifyViewer((await cookies()).get(cookieName(slug))?.value);
  let codeId: string | null = null;
  if (claims && claims.pid === plan.id && plan.status === 'active') {
    const { data: code } = await db.from('access_codes').select('id, expires_at, revoked_at').eq('id', claims.cid).maybeSingle();
    if (code && !code.revoked_at && (!code.expires_at || new Date(code.expires_at) > new Date())) codeId = code.id;
  }
  // 관리자: 상태와 관계없이 미리보기 가능. 특정 버전 미리보기는 관리자만.
  if ((!codeId || asked) && !(await getAdmin())) return deny();

  const versionId = asked || plan.current_version_id;
  if (!versionId) return new NextResponse('아직 배포된 버전이 없습니다.', { status: 404, headers: { 'Content-Type': TYPES.txt } });

  const { data: version } = await db.from('plan_versions').select('storage_prefix').eq('id', versionId).eq('plan_id', plan.id).maybeSingle();
  if (!version) return new NextResponse(null, { status: 404 });

  let { data: blob } = await db.storage.from(BUCKET).download(`${version.storage_prefix}/${file}`);
  if (!blob && ext === '') ({ data: blob } = await db.storage.from(BUCKET).download(`${version.storage_prefix}/index.html`));
  if (!blob) return new NextResponse(null, { status: 404 });

  if (isDocument && codeId && !asked) {
    const h = await headers();
    await db.from('access_logs').insert({ plan_id: plan.id, code_id: codeId, ip: clientIp(h), user_agent: h.get('user-agent') });
  }

  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': TYPES[ext || 'html'] ?? 'application/octet-stream',
      // 빌드 파일 이름에 해시가 붙어 있어 에셋은 짧게 캐시, 문서는 매번 확인
      'Cache-Control': isDocument ? 'private, no-store' : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    },
  });
}
