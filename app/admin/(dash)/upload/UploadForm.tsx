'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadPlan, type UploadState } from '../../actions';

type Plan = { id: string; slug: string; title: string };

const slugFromName = (name: string) =>
  name.replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export default function UploadForm({ plans, initialPlan }: { plans: Plan[]; initialPlan?: string }) {
  const [fileName, setFileName] = useState('');
  // 실패하면 React 가 폼을 비우므로(파일 선택 포함) 표시도 같이 비운다
  const [state, action, pending] = useActionState<UploadState, FormData>(async (prev, form) => {
    const result = await uploadPlan(prev, form);
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
