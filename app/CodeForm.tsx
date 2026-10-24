'use client';

import { useActionState } from 'react';
import { enterCode } from './actions';

export default function CodeForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(enterCode, { error: initialError });

  return (
    <form action={action} className="code-form">
      <label htmlFor="code">접근 코드</label>
      <input
        id="code"
        name="code"
        placeholder="XXXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={12}
        required
        autoFocus
      />
      <button type="submit" disabled={pending}>{pending ? '확인 중…' : '기획서 열기'}</button>
      {state.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
