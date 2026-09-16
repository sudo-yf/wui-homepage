import test from 'node:test';
import assert from 'node:assert/strict';
import { deferLetter, completeLetter, nextLetter } from '../assets/js/letter-retry.js';

test('a failed nearest letter yields to the next letter, then gets priority after placement', () => {
  const first = {}, second = {}, third = {};
  deferLetter(first, 1000);
  assert.equal(nextLetter([first, second, third], 1200, false), second);
  completeLetter(second, [first, second, third]);
  assert.equal(nextLetter([third, first], 2500, false), first);
});

test('a deferred letter waits for the other arm to finish even after its delay', () => {
  const first = {};
  deferLetter(first, 1000);
  assert.equal(nextLetter([first], 8000, true), null);
  assert.equal(nextLetter([first], 8000, false), first);
});

test('an isolated failure retries after a pause and a second failure defers again', () => {
  const first = {}, second = {};
  deferLetter(first, 1000);
  assert.equal(nextLetter([first], 5999, false), null);
  assert.equal(nextLetter([first], 6000, false), first);
  completeLetter(second, [first, second]);
  deferLetter(first, 7000);
  assert.equal(nextLetter([first], 7001, false), null);
});

test('successful placement clears retry state', () => {
  const first = {};
  deferLetter(first, 1000);
  completeLetter(first, [first]);
  assert.equal(first.retryAfter, 0);
  assert.equal(first.retryReady, false);
});
