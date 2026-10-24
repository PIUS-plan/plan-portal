import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/supabase/server';
import { signOut } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/login');

  return (
    <div className="admin">
      <header className="admin-bar">
        <Link href="/admin" className="admin-brand">
          <img src="/logo.png" alt="PiUS" /> <span>기획서 관리</span>
        </Link>
        <form action={signOut} className="admin-user">
          <span className="muted">{admin.user.email}</span>
          <button type="submit" className="ghost">로그아웃</button>
        </form>
      </header>
      <div className="admin-body">{children}</div>
    </div>
  );
}
