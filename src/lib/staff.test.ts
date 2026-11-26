import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStaff, staffIds } from './staff.ts';

test('staff are the user ids listed, and nobody when none are', () => {
  assert.equal(staffIds(undefined).size, 0);
  assert.equal(staffIds('').size, 0);
  assert.deepEqual([...staffIds(' a1 , b2,,')], ['a1', 'b2']);
  assert.equal(isStaff('a1', 'a1,b2'), true);
  assert.equal(isStaff('a', 'a1,b2'), false);
  assert.equal(isStaff('', ''), false);
});
