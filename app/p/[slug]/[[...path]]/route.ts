import { NextResponse, after, type NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { BUCKET, getAdmin, serviceClient } from '@/lib/supabase/server';
import { clientIp, cookieName, verifyViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

type Plan = { id: string; status: string; prefix: string | null };
const PLAN_TTL = 30_000;
const plans = new Map<string, { at: number; plan: Plan | null }>();

/* slug → 기획서 + 현재 버전 경로. fresh=false 면 같은 서버 인스턴스에서 30초 재사용 */
async function findPlan(db: ReturnType<typeof serviceClient>, slug: string, fresh: boolean): Promise<Plan | null> {
  const hit = plans.get(slug);
  if (!fresh && hit && Date.now() - hit.at < PLAN_TTL) return hit.plan;

  const { data: row, error } = await db.from('plans').select('id, status, current_version_id').eq('slug', slug).maybeSingle();
  if (error) throw new Error(error.message);
  let plan: Plan | null = null;
  if (row) {
    let prefix: string | null = null;
    if (row.current_version_id) {
      const { data: v } = await db.from('plan_versions').select('storage_prefix').eq('id', row.current_version_id).maybeSingle();
      prefix = v?.storage_prefix ?? null;
    }
    plan = { id: row.id, status: row.status, prefix };
  }
  plans.set(slug, { at: Date.now(), plan });
  return plan;
}

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
  // 문서(페이지)는 매번 새로 조회, 에셋은 30초 캐시 → 상태 변경·코드 폐기는 다음 페이지 로드부터 바로 적용
  const plan = await findPlan(db, slug, isDocument);
  if (!plan) return deny();

  // 고객: 코드로 받은 쿠키. 문서를 열 때 코드 폐기/만료와 기획서 상태를 확인한다.
  // 에셋(js·css·이미지)은 서명된 쿠키만 확인해 DB 왕복을 줄인다.
  const claims = await verifyViewer((await cookies()).get(cookieName(slug))?.value);
  let codeId: string | null = null;
  if (claims && claims.pid === plan.id && plan.status === 'active') {
    if (isDocument) {
      const { data: code } = await db.from('access_codes').select('id, expires_at, revoked_at').eq('id', claims.cid).maybeSingle();
      if (code && !code.revoked_at && (!code.expires_at || new Date(code.expires_at) > new Date())) codeId = code.id;
    } else {
      codeId = claims.cid;
    }
  }
  // 관리자: 상태와 관계없이 미리보기 가능. 특정 버전 미리보기는 관리자만.
  if ((!codeId || asked) && !(await getAdmin())) return deny();

  let prefix = plan.prefix;
  if (asked) {
    const { data: version } = await db.from('plan_versions').select('storage_prefix').eq('id', asked).eq('plan_id', plan.id).maybeSingle();
    prefix = version?.storage_prefix ?? null;
  }
  if (!prefix) return new NextResponse('아직 배포된 버전이 없습니다.', { status: 404, headers: { 'Content-Type': TYPES.txt } });

  const get = async (p: string) => (await db.storage.from(BUCKET).download(`${p}/${file}`)).data;
  let blob = await get(prefix);
  // 캐시된 버전이 방금 바뀐 경우(새 업로드·되돌리기): 현재 버전으로 한 번 더
  if (!blob && !isDocument && !asked) {
    const fresh = await findPlan(db, slug, true);
    if (fresh?.prefix && fresh.prefix !== prefix) blob = await get((prefix = fresh.prefix));
  }
  if (!blob && ext === '') blob = (await db.storage.from(BUCKET).download(`${prefix}/index.html`)).data;
  if (!blob) return new NextResponse(null, { status: 404 });

  if (isDocument && codeId && !asked) {
    const h = await headers();
    const log = { plan_id: plan.id, code_id: codeId, ip: clientIp(h), user_agent: h.get('user-agent') };
    after(async () => { await db.from('access_logs').insert(log); }); // 응답을 먼저 보내고 기록
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
