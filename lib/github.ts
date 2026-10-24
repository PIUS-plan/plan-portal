/* GitHub REST: 기획서 저장소 생성·커밋, plan-publisher 실행·상태 조회 (GITHUB_DISPATCH_TOKEN) */

export const ORG = 'PIUS-plan';
export const PUBLISHER = 'plan-publisher';
const TEMPLATE = 'plan-template';
/* 기획서가 아닌 조직 저장소 */
export const IGNORED = new Set(['.github', 'plan-portal', PUBLISHER, TEMPLATE]);
/* zip 에 없으면 템플릿 것을 유지할 파일 */
const KEEP = ['CLAUDE.md', '.gitignore'];

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function gh<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) throw new GitHubError('GITHUB_DISPATCH_TOKEN 이 설정되지 않았습니다.', 500);
  const res = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new GitHubError(`GitHub ${method} ${path}: ${res.status} ${await res.text()}`, res.status);
  return (res.status === 204 ? null : await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function repoExists(repo: string) {
  try {
    await gh('GET', `/repos/${ORG}/${repo}`);
    return true;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return false;
    throw e;
  }
}

/** plan-template 으로 비공개 저장소 생성 → main 이 준비될 때까지 대기 */
export async function createPlanRepo(repo: string, description: string) {
  await gh('POST', `/repos/${ORG}/${TEMPLATE}/generate`, { owner: ORG, name: repo, description, private: true });
  for (let i = 0; i < 10; i++) {
    try {
      await gh('GET', `/repos/${ORG}/${repo}/git/ref/heads/main`);
      return;
    } catch (e) {
      if (!(e instanceof GitHubError) || (e.status !== 404 && e.status !== 409)) throw e;
      await sleep(1000);
    }
  }
  throw new GitHubError('저장소를 만들었지만 준비가 늦어지고 있습니다. 잠시 뒤 "수정본 올리기"로 다시 올려 주세요.', 504);
}

/** zip 내용으로 main 을 통째로 교체하는 커밋 1개. 커밋 sha 반환 */
export async function commitFiles(repo: string, files: { path: string; data: Uint8Array }[], message: string) {
  const base = `/repos/${ORG}/${repo}/git`;
  const ref = await gh<{ object: { sha: string } }>('GET', `${base}/ref/heads/main`);
  const parent = await gh<{ tree: { sha: string } }>('GET', `${base}/commits/${ref.object.sha}`);
  const current = await gh<{ tree: { path: string; mode: string; type: string; sha: string }[] }>('GET', `${base}/trees/${parent.tree.sha}`);

  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  for (let i = 0; i < files.length; i += 8) {
    const blobs = await Promise.all(
      files.slice(i, i + 8).map(async (f) => {
        const blob = await gh<{ sha: string }>('POST', `${base}/blobs`, { content: Buffer.from(f.data).toString('base64'), encoding: 'base64' });
        return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );
    tree.push(...blobs);
  }
  const zipped = new Set(files.map((f) => f.path));
  for (const keep of KEEP) {
    const old = current.tree.find((t) => t.path === keep && t.type === 'blob');
    if (old && !zipped.has(keep)) tree.push(old);
  }

  const newTree = await gh<{ sha: string }>('POST', `${base}/trees`, { tree });
  const commit = await gh<{ sha: string }>('POST', `${base}/commits`, { message, tree: newTree.sha, parents: [ref.object.sha] });
  await gh('PATCH', `${base}/refs/heads/main`, { sha: commit.sha });
  return commit.sha;
}

/** 웹훅이 받은 push → plan-publisher 실행 */
export const dispatchPublish = (repo: string, sha: string) =>
  gh('POST', `/repos/${ORG}/${PUBLISHER}/actions/workflows/publish.yml/dispatches`, { ref: 'main', inputs: { repo, sha } });

export type PublishRun = { status: 'queued' | 'in_progress' | 'completed' | string; conclusion: string | null; url: string };

/** 업로드 이후 시작된 plan-publisher 실행 중 이 저장소 것 (run-name: "Publish <repo>") */
export async function latestPublishRun(repo: string, since: Date): Promise<PublishRun | null> {
  const { workflow_runs } = await gh<{ workflow_runs: { display_title: string; status: string; conclusion: string | null; html_url: string; created_at: string }[] }>(
    'GET',
    `/repos/${ORG}/${PUBLISHER}/actions/workflows/publish.yml/runs?event=workflow_dispatch&per_page=20&created=>=${since.toISOString().slice(0, 19)}Z`,
  );
  const run = workflow_runs.find((r) => r.display_title === `Publish ${repo}`);
  return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url } : null;
}
