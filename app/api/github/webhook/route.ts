import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { IGNORED, dispatchPublish } from '@/lib/github';

export const dynamic = 'force-dynamic';

const valid = (body: string, signature: string | null, secret: string) => {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(body).digest('hex'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
};

/* GitHub 조직 웹훅(push): 기획서 저장소 main 에 push 되면 plan-publisher 워크플로를 실행 */
export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const body = await request.text();
  if (!valid(body, request.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });
  if (event !== 'push') return NextResponse.json({ skipped: event });

  const push = JSON.parse(body) as { ref: string; after: string; deleted?: boolean; repository: { name: string } };
  const repo = push.repository.name;
  if (push.ref !== 'refs/heads/main' || push.deleted || IGNORED.has(repo)) {
    return NextResponse.json({ skipped: `${repo} ${push.ref}` });
  }

  try {
    await dispatchPublish(repo, push.after);
  } catch (e) {
    console.error('dispatch failed', e);
    return NextResponse.json({ error: 'dispatch failed' }, { status: 502 });
  }
  return NextResponse.json({ dispatched: repo, sha: push.after }, { status: 202 });
}
