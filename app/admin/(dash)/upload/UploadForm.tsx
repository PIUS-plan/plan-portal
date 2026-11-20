'use client';

import { useActionState, useRef, useState } from 'react';
import { prepareUpload, uploadPlan, type UploadState } from '../../actions';

type Plan = { id: string; slug: string; title: string };

const MAX_ZIP_MB = 50;

/* zip 을 서버 함수로 보내면 Vercel 요청 한도(4.5MB)에 걸리므로 Storage 로 바로 올리고 경로만 넘긴다 */
async function submit(prev: UploadState, form: FormData): Promise<UploadState> {
  const file = form.get('zip');
  if (!(file instanceof File) || file.size === 0) return { error: 'zip 파일을 선택해 주세요.' };
  if (file.size > MAX_ZIP_MB * 1024 * 1024) {
    return { error: `zip 파일은 ${MAX_ZIP_MB}MB 이하여야 합니다. node_modules·dist 폴더가 들어 있지 않은지 확인해 주세요.` };
  }

  const ready = await prepareUpload();
  let stored = false;
  if (ready.url && ready.path) {
    const body = new FormData();
    body.append('cacheControl', '60');
    body.append('', file);
    const res = await fetch(ready.url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null);
    stored = !!res?.ok;
    if (!stored) console.error('storage upload failed', res?.status, await res?.text().catch(() => ''));
  } else console.error('prepareUpload failed', ready.error);

  // Storage 로 못 올렸으면 작은 zip 은 예전처럼 서버로 직접 보낸다
  if (!stored) {
    if (file.size <= 4 * 1024 * 1024) return uploadPlan(prev, form);
    return { error: 'zip 파일을 올리지 못했습니다. 잠시 뒤 다시 시도하고, 계속되면 관리자에게 알려 주세요.' };
  }

  form.delete('zip');
  form.set('upload', ready.path!);
  form.set('file_name', file.name);
  return uploadPlan(prev, form);
}

const slugFromName = (name: string) =>
  name.replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export default function UploadForm({ plans, initialPlan }: { plans: Plan[]; initialPlan?: string }) {
  const [fileName, setFileName] = useState('');
  // 실패하면 React 가 폼을 비우므로(파일 선택 포함) 표시도 같이 비운다
  const [state, action, pending] = useActionState<UploadState, FormData>(async (prev, form) => {
    let result: UploadState;
    try {
      result = await submit(prev, form);
    } catch (e) {
      // 성공 시 redirect 는 그대로 던져서 이동시킨다
      if (typeof e === 'object' && e && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')) throw e;
      console.error(e);
      result = { error: '올리는 중 오류가 났습니다. 잠시 뒤 다시 시도하고, 계속되면 관리자에게 알려 주세요.' };
    }
    setFileName('');
    return result;
  }, {});
  const [target, setTarget] = useState(initialPlan && plans.some((p) => p.id === initialPlan) ? initialPlan : 'new');
  const [slug, setSlug] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setFileName(f.name);
    if (!slug) setSlug(slugFromName(f.name));
  };

  return (
    <form action={action} className="upload-form">
      <label
        className={`drop ${over ? 'over' : ''} ${fileName ? 'has' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (input.current && e.dataTransfer.files.length) {
            input.current.files = e.dataTransfer.files;
            pick(e.dataTransfer.files);
          }
        }}
      >
        <input ref={input} type="file" name="zip" accept=".zip,application/zip" required onChange={(e) => pick(e.target.files)} />
        {fileName ? <><b>{fileName}</b><span className="muted">다른 파일을 고르려면 다시 클릭</span></> : <><b>zip 파일을 끌어다 놓거나 클릭해서 선택</b><span className="muted">Project 에서 내려받은 그대로 (압축 풀지 않기)</span></>}
      </label>

      <fieldset className="choice">
        <legend>어디에 올릴까요?</legend>
        <label><input type="radio" name="target" value="new" checked={target === 'new'} onChange={() => setTarget('new')} /> 새 기획서</label>
        <label>
          <input type="radio" name="target-kind" checked={target !== 'new'} onChange={() => setTarget(plans[0]?.id ?? 'new')} disabled={!plans.length} /> 기존 기획서 수정본
        </label>
      </fieldset>

      {target === 'new' ? (
        <label className="field">
          주소 이름
          <div className="slug">
            <span className="muted mono">/p/</span>
            <input name="slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="예: farm-commerce" pattern="[a-z0-9][a-z0-9-]{1,62}" required />
            <span className="muted mono">/</span>
          </div>
          <span className="muted hint">영문 소문자·숫자·하이픈(-). 고객에게 보이는 주소라 나중에 바꿀 수 없습니다. 고객사 이름보다 프로젝트 이름을 권장합니다.</span>
        </label>
      ) : (
        <label className="field">
          기획서
          <select name="target" value={target} onChange={(e) => setTarget(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.slug})</option>)}
          </select>
          <span className="muted hint">기존 내용은 이 zip 내용으로 통째로 바뀝니다. 이전 버전은 버전 목록에 남아 되돌릴 수 있습니다.</span>
        </label>
      )}

      <label className="field">
        메모 <span className="muted">(선택)</span>
        <input name="memo" placeholder="예: 3차 미팅 반영 — 정산 화면 추가" maxLength={120} />
      </label>

      <div>
        <button type="submit" disabled={pending}>{pending ? '올리는 중… (최대 30초)' : '올리기'}</button>
      </div>
      {state.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
