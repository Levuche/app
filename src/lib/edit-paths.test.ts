// How the page editor reads and sets a block's settings by the paths edit
// mode gives. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathsUp, readAt, setAt } from './edit-paths.ts';

test('sets a top-level setting without changing the original', () => {
  const props = { title: 'Old', size: 'm' };
  const next = setAt(props, 'title', 'New');
  assert.deepEqual(next, { title: 'New', size: 'm' });
  assert.equal(props.title, 'Old');
});

test('sets a field of a list item, keeping the list a list', () => {
  const links = [
    { label: 'One', href: 'https://a.example' },
    { label: 'Two', href: 'https://b.example' },
  ];
  const props = { links };
  const next = setAt(props, 'links.1.label', 'Second');
  assert.ok(Array.isArray(next.links));
  assert.deepEqual(next.links, [
    links[0],
    { label: 'Second', href: 'https://b.example' },
  ]);
  assert.equal(links[1].label, 'Two');
  assert.equal((next.links as unknown[])[0], links[0]);
});

test('sets a field of a group, making the group when missing', () => {
  assert.deepEqual(setAt({}, 'labels.subscribe', 'Join'), {
    labels: { subscribe: 'Join' },
  });
  assert.deepEqual(setAt({}, 'items.0.label', 'A'), {
    items: [{ label: 'A' }],
  });
});

test('reads a setting by path', () => {
  const props = { links: [{ label: 'One' }], labels: { a: 'b' } };
  assert.equal(readAt(props, 'links.0.label'), 'One');
  assert.equal(readAt(props, 'labels.a'), 'b');
  assert.equal(readAt(props, 'links.3.label'), undefined);
  assert.equal(readAt(props, 'title.more'), undefined);
});

test('lists the paths up from a setting, nearest first', () => {
  assert.deepEqual(pathsUp('links.0.label'), [
    'links.0.label',
    'links.0',
    'links',
  ]);
  assert.deepEqual(pathsUp('title'), ['title']);
});
