'use client';

import { useState, useTransition } from 'react';
import { revealCode } from '../../../actions';
import CopyButton from '../../../CopyButton';

const Eye = ({ off }: { off?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

/* 접근 코드: 평소엔 가리고, 눈 아이콘을 누르면 서버에서 복호화해 보여줌 */
export default function CodeCell({ id, hint, canReveal }: { id: string; hint: string; canReveal: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    if (shown) return setShown(false);
    if (code) return setShown(true);
    start(async () => {
      const r = await revealCode(id);
      if (r.code) {
        setCode(r.code);
        setShown(true);
        setError(null);
      } else setError(r.error ?? '코드를 불러오지 못했습니다.');
    });
  };

  return (
    <span className="code-cell">
      <span className="mono">{shown && code ? code : `····-${hint}`}</span>
      {canReveal ? (
        <button type="button" className="icon" onClick={toggle} disabled={pending} title={shown ? '코드 가리기' : '코드 보기'} aria-label={shown ? '코드 가리기' : '코드 보기'}>
          <Eye off={shown} />
        </button>
      ) : (
        <span className="icon muted" title="이 기능이 생기기 전에 만든 코드라 다시 볼 수 없습니다"><Eye off /></span>
      )}
      {shown && code && <CopyButton text={code} />}
      {error && <span className="error small">{error}</span>}
    </span>
  );
}
