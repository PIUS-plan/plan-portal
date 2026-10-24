'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clientIp, redeemCode, viewerCookie } from '@/lib/viewer';

export async function enterCode(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const result = await redeemCode(String(form.get('code') ?? ''), clientIp(await headers()));
  if (!result.ok) return { error: result.error };

  (await cookies()).set(viewerCookie(result.slug, result.token, result.maxAge));
  redirect(`/p/${result.slug}/`);
}
