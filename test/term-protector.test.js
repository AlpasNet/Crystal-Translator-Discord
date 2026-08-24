import test from 'node:test';
import assert from 'node:assert/strict';
import { TermProtector } from '../src/translator/TermProtector.js';

const protector = new TermProtector({
  protectedTerms: ['FFXIV', 'Party Finder'],
  dictionary: {
    'fr-en': { 'Sadique': 'Savage', 'Extrême': 'Extreme' },
    'en-fr': { 'Savage': 'Sadique', 'Extreme': 'Extrême' }
  }
});

test('dictionary replacements survive translation placeholders', () => {
  const protectedValue = protector.protect('On fait le Sadique et un Extrême sur FFXIV.', 'fr', 'en');
  assert.ok(!protectedValue.text.includes('Sadique'));
  assert.ok(!protectedValue.text.includes('Extrême'));
  assert.equal(
    protector.restore(protectedValue.text, protectedValue.replacements),
    'On fait le Savage et un Extreme sur FFXIV.'
  );
});

test('Discord mentions, URLs and code are protected', () => {
  const input = '<@123456789012345678> regarde https://example.com et `npm start` dans Party Finder';
  const protectedValue = protector.protect(input, 'fr', 'en');
  const restored = protector.restore(protectedValue.text, protectedValue.replacements);
  assert.equal(restored, input);
});
