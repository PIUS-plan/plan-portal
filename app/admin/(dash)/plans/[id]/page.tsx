import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdmin } from '@/lib/supabase/server';
import { date, STATUS } from '@/lib/format';
import { revokeCode, setCurrentVersion, updatePlan } from '../../../actions';
import NewCodeForm from './NewCodeForm';

type Code = { id: string; code_hint: string; label: string | null; expires_at: string | null; revoked_at: string | null; created_at: string };
type Log = { id: number; ip: string | null; user_agent: string | null; created_at: string; access_codes: { label: string | null; code_hint: string } | null };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = (await getAdmin())!;

  const [{ data: plan }, { data: versions }, { data: codes }, { data: logs }] = await Promise.all([
    supabase.from('plans').select('*').eq('id', id).maybeSingle(),
    supabase.from('plan_versions').select('*').eq('plan_id', id).order('deployed_at', { ascending: false }),
    supabase.from('access_codes').select('*').eq('plan_id', id).order('created_at', { ascending: false }),
    supabase.from('access_logs').select('id, ip, user_agent, created_at, access_codes(label, code_hint)').eq('plan_id', id)
      .order('created_at', { ascending: false }).limit(100),
  ]);
  if (!plan) notFound();

  const now = new Date();
  const codeState = (c: Code) =>
    c.revoked_at ? ['revoked', '폐기'] : c.expires_at && new Date(c.expires_at) <= now ? ['expired', '만료'] : ['active', '유효'];

  return (
    <>
      <div className="page-head">
        <Link href="/admin" className="muted">← 기획서 목록</Link>
        <h1>{plan.title}</h1>
        <p className="muted mono">
          {plan.slug}
          {plan.repo_url && <> · <a href={plan.repo_url} target="_blank" rel="noreferrer">GitHub</a></>}
          {' · '}<a href={`/p/${plan.slug}/`} target="_blank" rel="noreferrer">미리보기</a>
        </p>
      </div>

      <section className="card">
        <h2>기본 정보</h2>
        <form action={updatePlan} className="grid-form">
          <input type="hidden" name="id" value={plan.id} />
          <label>제목<input name="title" defaultValue={plan.title} required /></label>
          <label>고객사<input name="client_name" defaultValue={plan.client_name ?? ''} placeholder="예: OO농산" /></label>
          <label>상태
            <select name="status" defaultValue={plan.status}>
              <option value="draft">초안 — 관리자만 볼 수 있음</option>
              <option value="active">공개 — 코드로 열람 가능</option>
              <option value="archived">보관 — 코드로 열람 불가</option>
            </select>
          </label>
          <div><button type="submit">저장</button></div>
        </form>
      </section>

      <section className="card">
        <h2>접근 코드</h2>
        <NewCodeForm planId={plan.id} disabled={plan.status !== 'active'} />
        {(codes as Code[] | null)?.length ? (
          <table className="table">
            <thead><tr><th>코드</th><th>받는 사람</th><th>만료</th><th>상태</th><th>만든 날</th><th /></tr></thead>
            <tbody>
              {(codes as Code[]).map((c) => {
                const [cls, label] = codeState(c);
                return (
                  <tr key={c.id}>
                    <td className="mono">····-{c.code_hint}</td>
                    <td>{c.label ?? <span className="muted">—</span>}</td>
                    <td>{c.expires_at ? date(c.expires_at) : '없음'}</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td>{date(c.created_at)}</td>
                    <td className="num">
                      {cls === 'active' && (
                        <form action={revokeCode}>
                          <input type="hidden" name="plan_id" value={plan.id} />
                          <input type="hidden" name="code_id" value={c.id} />
                          <button type="submit" className="ghost small danger">폐기</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="card">
        <h2>버전</h2>
        <p className="muted">main 에 push 할 때마다 쌓입니다. 고객에게는 <b>현재</b> 버전이 보입니다.</p>
        <table className="table">
          <thead><tr><th>커밋</th><th>메시지</th><th>배포</th><th /></tr></thead>
          <tbody>
            {(versions ?? []).map((v) => (
              <tr key={v.id}>
                <td className="mono">
                  {plan.repo_url ? <a href={`${plan.repo_url}/commit/${v.commit_sha}`} target="_blank" rel="noreferrer">{v.commit_sha.slice(0, 7)}</a> : v.commit_sha.slice(0, 7)}
                </td>
                <td className="clip">{v.commit_message?.split('\n')[0]}</td>
                <td>{date(v.deployed_at)}</td>
                <td className="num actions">
                  <a href={`/p/${plan.slug}/~${v.id}/`} target="_blank" rel="noreferrer" className="small">보기</a>
                  {v.id === plan.current_version_id ? (
                    <span className="badge active">현재</span>
                  ) : (
                    <form action={setCurrentVersion}>
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <input type="hidden" name="version_id" value={v.id} />
                      <button type="submit" className="ghost small">이 버전으로</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>열람 기록 <span className="muted">최근 100건</span></h2>
        {(logs as Log[] | null)?.length ? (
          <table className="table">
            <thead><tr><th>시각</th><th>코드</th><th>IP</th><th>기기</th></tr></thead>
            <tbody>
              {(logs as unknown as Log[]).map((l) => (
                <tr key={l.id}>
                  <td>{date(l.created_at)}</td>
                  <td>{l.access_codes ? `${l.access_codes.label ?? ''} ····-${l.access_codes.code_hint}` : '—'}</td>
                  <td className="mono">{l.ip}</td>
                  <td className="clip muted">{l.user_agent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">아직 열람 기록이 없습니다.</div>
        )}
      </section>
    </>
  );
}
