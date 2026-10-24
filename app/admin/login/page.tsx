'use client';

import { useActionState } from 'react';
import { signIn } from '../actions';

export default function Login() {
  const [state, action, pending] = useActionState(signIn, {});

  return (
    <main className="gate">
      <div className="gate-card">
        <img src="/logo.png" alt="PiUS" className="gate-logo" />
        <h1>관리자 로그인</h1>
        <form action={action} className="code-form">
          <label htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          <label htmlFor="password">비밀번호</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit" disabled={pending}>{pending ? '로그인 중…' : '로그인'}</button>
          {state.error && <p className="error" role="alert">{state.error}</p>}
        </form>
      </div>
    </main>
  );
}
