// Who is on the Levuche team (#33): the Buildbase user ids in the Worker's
// STAFF_USER_IDS setting, separated by commas, set by the owner with
// `wrangler secret put STAFF_USER_IDS` (docs/DEPLOY.md). Not in the repo.
// With none set, nobody is staff and the staff screens are "not found".
// No Next.js here, so it's tested on its own; requireStaff is in
// ./staff-session.ts.

export function staffIds(value = process.env.STAFF_USER_IDS) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export const isStaff = (userId: string, value?: string) =>
  staffIds(value).has(userId);
