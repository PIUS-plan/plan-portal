'use client';

import { useActionState, useState } from 'react';
import { createCode, type NewCode } from '../../../actions';

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ghost small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? '복사됨' : '복사'}
    </button>
  );
}

export default function NewCodeForm({ planId, disabled }: { planId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<NewCode, FormData>(createCode, {});

  return (
    <>
      <form action={action} className="inline-form">
        <input type="hidden" name="plan_id" value={planId} />
        <input name="label" placeholder="받는 사람 (예: OO사 김팀장)" />
        <select name="days" defaultValue="30">
          <option value="7">7일</option>
          <option value="30">30일</option>
          <option value="90">90일</option>
          <option value="0">만료 없음</option>
        </select>
        <button type="submit" disabled={pending}>{pending ? '만드는 중…' : '코드 만들기'}</button>
      </form>
      {disabled && <p className="warn">기획서가 <b>공개</b> 상태가 아니면 코드를 입력해도 열리지 않습니다.</p>}
      {state.error && <p className="error">{state.error}</p>}
      {state.code && (
        <div className="new-code">
          <p className="muted">이 코드는 지금 한 번만 보입니다. 고객사에 전달해 주세요.</p>
          <div className="row"><code className="big">{state.code}</code><Copy text={state.code} /></div>
          <div className="row"><code>{state.link}</code><Copy text={state.link!} /></div>
        </div>
      )}
    </>
  );
}
