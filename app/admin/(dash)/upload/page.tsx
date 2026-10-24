import Link from 'next/link';
import { getAdmin } from '@/lib/supabase/server';
import UploadForm from './UploadForm';

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const { supabase } = (await getAdmin())!;
  const { data } = await supabase.from('plans').select('id, slug, title').neq('status', 'archived').order('updated_at', { ascending: false });

  return (
    <>
      <div className="page-head">
        <Link href="/admin" className="muted">← 기획서 목록</Link>
        <h1>기획서 올리기</h1>
        <p className="muted">Project 에서 내려받은 zip 을 그대로 올리면 1~2분 뒤 포털에 반영됩니다.</p>
      </div>
      <section className="card">
        <UploadForm plans={data ?? []} initialPlan={plan} />
      </section>
    </>
  );
}
