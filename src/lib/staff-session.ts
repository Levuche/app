import { notFound } from 'next/navigation';
import { requireUser } from './buildbase';
import { isStaff } from './staff';

/** The signed-in user, if they're on the Levuche team; "not found" otherwise. */
export async function requireStaff() {
  const user = await requireUser();
  if (!isStaff(user.id)) notFound();
  return user;
}
