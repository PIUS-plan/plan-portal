import { strFromU8, unzipSync } from 'fflate';

/* claude.ai Project 에서 내려받은 기획서 zip → 저장소에 올릴 파일 목록 */

const SKIP = [/^node_modules\//, /^dist\//, /^\.git\//, /^\.vercel\//, /^\.next\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /^\.env/];
const MAX_FILES = 500;

export type PlanFile = { path: string; data: Uint8Array };
export type ParsedPlan = { files: PlanFile[]; title: string | null; suggestedSlug: string | null };

export class PlanZipError extends Error {}

export const toSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export function parsePlanZip(zip: Uint8Array): ParsedPlan {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new PlanZipError('zip 파일을 열 수 없습니다. Project 에서 내려받은 zip 을 그대로 올려 주세요.');
  }

  let paths = Object.keys(entries)
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !p.endsWith('/') && !p.startsWith('__MACOSX/'));
  if (!paths.length) throw new PlanZipError('zip 안에 파일이 없습니다.');

  // 최상위 폴더가 하나뿐이면 벗겨낸다 (farm-commerce/package.json → package.json)
  const tops = new Set(paths.map((p) => (p.includes('/') ? p.split('/')[0] : '')));
  const root = tops.size === 1 && !tops.has('') ? [...tops][0] : null;
  const strip = (p: string) => (root ? p.slice(root.length + 1) : p);

  const files: PlanFile[] = [];
  for (const raw of Object.keys(entries)) {
    const p = raw.replace(/\\/g, '/');
    if (!paths.includes(p)) continue;
    const path = strip(p);
    if (!path || SKIP.some((re) => re.test(path))) continue;
    if (path.split('/').some((seg) => seg === '..')) throw new PlanZipError('zip 안에 잘못된 경로가 있습니다.');
    files.push({ path, data: entries[raw] });
  }
  if (files.length > MAX_FILES) throw new PlanZipError(`파일이 너무 많습니다 (${files.length}개). node_modules 가 들어 있지 않은지 확인해 주세요.`);

  const text = (name: string) => {
    const f = files.find((x) => x.path === name);
    return f ? strFromU8(f.data) : null;
  };

  const pkgText = text('package.json');
  if (!pkgText) throw new PlanZipError('package.json 이 없습니다. 기획서 프로젝트 폴더 전체를 zip 으로 받았는지 확인해 주세요.');
  let pkg: { name?: string; scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(pkgText);
  } catch {
    throw new PlanZipError('package.json 을 읽을 수 없습니다.');
  }
  if (!pkg.scripts?.build) throw new PlanZipError('package.json 에 build 스크립트가 없습니다.');

  const html = text('index.html');
  if (!html) throw new PlanZipError('index.html 이 없습니다.');

  const viteName = files.map((f) => f.path).find((p) => /^vite\.config\.(js|mjs|ts|mts)$/.test(p));
  const vite = viteName ? text(viteName)! : null;
  if (!vite || !/base\s*:\s*['"]\.\/['"]/.test(vite)) {
    throw new PlanZipError("vite.config 에 base: './' 설정이 없습니다. Project 에서 \"vite.config.js 에 base: './' 를 넣어줘\" 라고 요청한 뒤 다시 내려받아 주세요.");
  }

  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || null;
  const suggestedSlug = toSlug(root ?? '') || toSlug(pkg.name?.replace(/^@[^/]+\//, '') ?? '') || null;

  return { files, title, suggestedSlug };
}
