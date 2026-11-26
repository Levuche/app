'use server';

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isHandle } from '@/lib/handle';
import { fileReport, isReportReason, visitorKey } from '@/lib/moderation';
import { database } from '@/lib/sites';

/**
 * A visitor's report of a creator site (#33). No account needed; how often
 * one visitor can report is limited by a daily key made from their address
 * (src/lib/moderation.ts). On Cloudflare the address is the one Cloudflare
 * saw, which a visitor can't set.
 */
export async function sendReport(form: FormData) {
  const handle = String(form.get('handle') ?? '').toLowerCase();
  if (!isHandle(handle)) notFound();
  const reason = form.get('reason');
  if (!isReportReason(reason)) redirect(`/report/${handle}?done=no-reason`);
  const details = String(form.get('details') ?? '').trim();
  const path = String(form.get('path') ?? '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();

  const ask = await headers();
  const address =
    ask.get('cf-connecting-ip') ??
    ask.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const done = await fileReport(await database(), {
    handle,
    path,
    reason,
    details: details || null,
    visitor: await visitorKey(address),
  });
  redirect(`/report/${handle}?done=${done}`);
}
