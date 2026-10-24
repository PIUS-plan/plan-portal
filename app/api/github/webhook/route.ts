import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/* 기획서가 아닌 조직 저장소 */
const IGNORED = new Set(['.github', 'plan-portal', 'plan-publisher', 'plan-template']);
const PUBLISHER = 'plan-publisher';

const valid = (body: string, signature: string | null, secret: string) => {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(body).digest('hex'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
};

/* GitHub 조직 웹훅(push): 기획서 저장소 main 에 push 되면 plan-publisher 워크플로를 실행 */
export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!secret || !token) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const body = await request.text();
  if (!valid(body, request.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });
  if (event !== 'push') return NextResponse.json({ skipped: event });

  const push = JSON.parse(body) as {
    ref: string; after: string; deleted?: boolean;
    repository: { name: string; owner: { login?: string; name?: string } };
  };
  const repo = push.repository.name;
  const owner = push.repository.owner.login ?? push.repository.owner.name;
  if (push.ref !== 'refs/heads/main' || push.deleted || IGNORED.has(repo)) {
    return NextResponse.json({ skipped: `${repo} ${push.ref}` });
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${PUBLISHER}/actions/workflows/publish.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main', inputs: { repo, sha: push.after } }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('dispatch failed', res.status, detail);
    return NextResponse.json({ error: 'dispatch failed', status: res.status }, { status: 502 });
  }
  return NextResponse.json({ dispatched: repo, sha: push.after }, { status: 202 });
}
