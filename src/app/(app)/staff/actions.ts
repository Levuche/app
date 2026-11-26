'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  closeReports,
  isReportReason,
  pauseSite,
  unpauseSite,
} from '@/lib/moderation';
import { database } from '@/lib/sites';
import { requireStaff } from '@/lib/staff-session';

// The Levuche team's actions on a site (#33). Each one checks the signed-in
// user is staff again, whatever the page showed, and is logged.

const note = (form: FormData) => String(form.get('note') ?? '').trim() || null;
const siteId = (form: FormData) => String(form.get('siteId') ?? '');

function done(result: string): never {
  revalidatePath('/staff');
  redirect(`/staff?done=${result}`);
}

export async function pause(form: FormData) {
  const user = await requireStaff();
  const reason = form.get('reason');
  if (!isReportReason(reason)) done('no-reason');
  const paused = await pauseSite(await database(), {
    siteId: siteId(form),
    reason,
    note: note(form),
    actor: user.id,
  });
  done(paused ? 'paused' : 'not-changed');
}

export async function unpause(form: FormData) {
  const user = await requireStaff();
  const unpaused = await unpauseSite(await database(), {
    siteId: siteId(form),
    note: note(form),
    actor: user.id,
  });
  done(unpaused ? 'unpaused' : 'not-changed');
}

export async function close(form: FormData) {
  const user = await requireStaff();
  const closed = await closeReports(await database(), {
    siteId: siteId(form),
    note: note(form),
    actor: user.id,
  });
  done(closed ? 'closed' : 'not-changed');
}
