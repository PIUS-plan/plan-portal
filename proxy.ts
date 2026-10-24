import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/* /admin: Supabase 세션 갱신 + 비로그인 시 로그인 화면으로. 관리자 여부는 admin 레이아웃에서 확인 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname === '/admin/login';

  if (!user && !isLogin) return NextResponse.redirect(new URL('/admin/login', request.url));
  if (user && isLogin) return NextResponse.redirect(new URL('/admin', request.url));
  return response;
}

export const config = { matcher: ['/admin', '/admin/:path*'] };
