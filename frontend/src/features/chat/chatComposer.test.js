import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSubmitChatOnKey } from './chatComposer.js';

test('plain Enter submits only when chat can send', () => {
  assert.equal(shouldSubmitChatOnKey({ key: 'Enter' }, true), true);
  assert.equal(shouldSubmitChatOnKey({ key: 'Enter' }, false), false);
  assert.equal(shouldSubmitChatOnKey({ key: 'a' }, true), false);
});

test('Shift+Enter and other modified Enter keys keep their default behavior', () => {
  for (const modifier of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey']) {
    assert.equal(shouldSubmitChatOnKey({ key: 'Enter', [modifier]: true }, true), false);
  }
});

test('Enter confirming IME composition does not submit', () => {
  assert.equal(shouldSubmitChatOnKey({ key: 'Enter', nativeEvent: { isComposing: true } }, true), false);
  assert.equal(shouldSubmitChatOnKey({ key: 'Enter', nativeEvent: { keyCode: 229 } }, true), false);
});
