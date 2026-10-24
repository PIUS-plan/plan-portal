import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/supabase/server';
import { MANUAL_URL } from '@/lib/site';
import { signOut } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/login');

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="admin-left">
          <Link href="/admin" className="admin-brand">
            <img src="/logo.png" alt="PiUS" /> <span>기획서 관리</span>
          </Link>
          <nav className="admin-nav">
            <Link href="/admin">기획서 목록</Link>
            <Link href="/admin/upload">기획서 올리기</Link>
            <a href={MANUAL_URL} target="_blank" rel="noreferrer">사용 매뉴얼 ↗</a>
          </nav>
        </div>
        <form action={signOut} className="admin-user">
          <span className="muted">{admin.user.email}</span>
          <button type="submit" className="ghost">로그아웃</button>
        </form>
      </header>
      <div className="admin-body">{children}</div>
    </div>
  );
}
