// Is this name free on levuche.page? The new-site form asks as the creator
// types: { handle, available, message?, suggestions }. Signed-in creators
// only; the answer says nothing about whose a taken name is.
import { type NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/buildbase';
import { takenHandles } from '@/lib/db';
import { handleProblem, handleSuggestions, siteAddress } from '@/lib/handle';
import { database } from '@/lib/sites';

export interface HandleCheck {
  handle: string;
  available: boolean;
  /** Why it can't be claimed, for the form to show. */
  message?: string;
  /** Free names close to it, when it's taken. */
  suggestions: string[];
}

const answer = (body: HandleCheck) =>
  NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  if (!(await getUser()))
    return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const handle = (request.nextUrl.searchParams.get('handle') ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 100);
  const problem = handleProblem(handle);
  const db = await database();
  const offer = async () => {
    const names = handleSuggestions(handle);
    const taken = await takenHandles(db, names);
    return names.filter((name) => !taken.has(name)).slice(0, 3);
  };

  if (problem)
    return answer({
      handle,
      available: false,
      message: problem,
      suggestions: [],
    });
  if ((await takenHandles(db, [handle])).has(handle))
    return answer({
      handle,
      available: false,
      message: `${siteAddress(handle)} is taken.`,
      suggestions: await offer(),
    });
  return answer({ handle, available: true, suggestions: [] });
}
