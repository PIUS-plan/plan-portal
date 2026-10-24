import Link from 'next/link';
import { getAdmin } from '@/lib/supabase/server';
import { date, STATUS } from '@/lib/format';

type Row = {
  id: string; slug: string; title: string; client_name: string | null; status: string;
  deployed_at: string | null; view_count: number; last_viewed_at: string | null; active_codes: number;
};

export default async function PlansPage() {
  const { supabase } = (await getAdmin())!;
  const { data, error } = await supabase.from('plan_overview').select('*').order('updated_at', { ascending: false });
  const plans = (data ?? []) as Row[];

  return (
    <>
      <div className="page-head row-head">
        <div>
          <h1>기획서</h1>
          <p className="muted">올린 기획서는 <b>초안</b>으로 등록됩니다. 고객에게 보이려면 <b>공개</b>로 바꾸고 접근 코드를 만드세요.</p>
        </div>
        <Link href="/admin/upload" className="button">+ 기획서 올리기</Link>
      </div>
      {error && <p className="error">{error.message}</p>}
      {plans.length === 0 ? (
        <div className="empty">아직 등록된 기획서가 없습니다. <Link href="/admin/upload">첫 기획서를 올려 보세요.</Link></div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>기획서</th><th>고객사</th><th>상태</th><th>최근 배포</th>
              <th className="num">유효 코드</th><th className="num">열람</th><th>마지막 열람</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/plans/${p.id}`} className="strong">{p.title}</Link>
                  <div className="muted mono">{p.slug}</div>
                </td>
                <td>{p.client_name ?? <span className="muted">—</span>}</td>
                <td><span className={`badge ${p.status}`}>{STATUS[p.status]}</span></td>
                <td>{date(p.deployed_at)}</td>
                <td className="num">{p.active_codes}</td>
                <td className="num">{p.view_count}</td>
                <td>{date(p.last_viewed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
