import { expect, it } from 'vitest';
import { isExternalRequest } from '../helpers/is-external-request';

it.each([
  ['http://127.0.0.1:4173/Jog/assets/app.js', false],
  ['blob:http://127.0.0.1:4173/synthetic-local-file', false],
  ['data:image/svg+xml,synthetic', false],
  ['https://example.invalid/upload', true],
  ['blob:https://example.invalid/synthetic-file', true],
  ['http://127.0.0.1:9999/upload', true],
  ['http://127.0.0.1.evil.example:4173/upload', true],
  ['http://localhost:4173/upload', true],
] as const)('通信元を厳密に判定する: %s', (url, external) => {
  expect(isExternalRequest(url, 'http://127.0.0.1:4173/Jog/')).toBe(external);
});
