'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAdmin, sessionClient } from '@/lib/supabase/server';
import { generateCode, hashCode, normalizeCode } from '@/lib/viewer';

async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/login');
  return admin;
}

export async function signIn(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const supabase = await sessionClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  });
  if (error) return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' };

  const { data: ok } = await supabase.rpc('is_admin');
  if (!ok) {
    await supabase.auth.signOut();
    return { error: '관리자로 등록되지 않은 계정입니다.' };
  }
  redirect('/admin');
}

export async function signOut() {
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

export async function updatePlan(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(form.get('id'));
  const status = String(form.get('status'));
  if (!['draft', 'active', 'archived'].includes(status)) throw new Error('잘못된 상태');

  const { error } = await supabase
    .from('plans')
    .update({
      title: String(form.get('title') ?? '').trim(),
      client_name: String(form.get('client_name') ?? '').trim() || null,
      status,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin', 'layout');
}

export async function setCurrentVersion(form: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from('plans')
    .update({ current_version_id: String(form.get('version_id')) })
    .eq('id', String(form.get('plan_id')));
  if (error) throw new Error(error.message);
  revalidatePath('/admin', 'layout');
}

export type NewCode = { code?: string; link?: string; error?: string };

export async function createCode(_prev: NewCode, form: FormData): Promise<NewCode> {
  const { supabase, user } = await requireAdmin();
  const planId = String(form.get('plan_id'));
  const label = String(form.get('label') ?? '').trim() || null;
  const days = Number(form.get('days') || 0);
  const expires_at = days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null;

  const code = generateCode();
  const { error } = await supabase.from('access_codes').insert({
    plan_id: planId,
    code_hash: hashCode(code),
    code_hint: normalizeCode(code).slice(-4),
    label,
    expires_at,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  const h = await headers();
  const origin = process.env.SITE_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  revalidatePath(`/admin/plans/${planId}`);
  return { code, link: `${origin}/c/${code}` };
}

export async function revokeCode(form: FormData) {
  const { supabase } = await requireAdmin();
  const planId = String(form.get('plan_id'));
  const { error } = await supabase
    .from('access_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', String(form.get('code_id')));
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/plans/${planId}`);
}
