import { env } from 'node:process';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { logger } from '../utils';
import { HttpService, rootContainer } from '.';
import { scope } from '~test/http-mock';
import { cacheFile } from '~test/path';

const baseUrl = 'https://example.com';
describe('http.service', () => {
  let child!: Container;

  beforeEach(() => {
    child = rootContainer.createChild();

    for (const key of Object.keys(env)) {
      if (key.startsWith('URL_REPLACE_')) {
        delete env[key];
      }
    }
  });

  test('throws', async () => {
    scope(baseUrl).get('/fail.txt').times(6).reply(404);

    const http = child.get(HttpService);

    await expect(
      http.download({ url: `${baseUrl}/fail.txt` })
    ).rejects.toThrow();
    await expect(
      http.download({ url: `${baseUrl}/fail.txt` })
    ).rejects.toThrow();
  });

  test('throws with checksum', async () => {
    scope(baseUrl).get('/checksum.txt').thrice().reply(200, 'ok');

    const http = child.get(HttpService);
    const expectedChecksum = 'invalid';
    const checksumType = 'sha256';

    await expect(
      http.download({
        url: `${baseUrl}/checksum.txt`,
        expectedChecksum,
        checksumType,
      })
    ).rejects.toThrow();
  });

  test('download', async () => {
    scope(baseUrl).get('/test.txt').reply(200, 'ok');

    const http = child.get(HttpService);
    const expected = cacheFile(
      `d1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020/test.txt`
    );

    expect(await http.download({ url: `${baseUrl}/test.txt` })).toBe(expected);
    // uses cache
    expect(await http.download({ url: `${baseUrl}/test.txt` })).toBe(expected);
  });

  test('download with checksum', async () => {
    scope(baseUrl).get('/test.txt').reply(200, 'https://example.com/test.txt');

    const http = child.get(HttpService);
    const expectedChecksum =
      'd1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020';
    const expected = cacheFile(
      `d1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020/test.txt`
    );

    expect(
      await http.download({
        url: `${baseUrl}/test.txt`,
        expectedChecksum,
        checksumType: 'sha256',
      })
    ).toBe(expected);
    // uses cache
    expect(
      await http.download({
        url: `${baseUrl}/test.txt`,
        expectedChecksum,
        checksumType: 'sha256',
      })
    ).toBe(expected);
  });

  test('replaces url', async () => {
    scope('https://example.org').get('/replace.txt').reply(200, 'ok');

    env.URL_REPLACE_0_FROM = baseUrl;
    env.URL_REPLACE_0_TO = 'https://example.test';

    env.URL_REPLACE_11_FROM = 'https://example.test';
    env.URL_REPLACE_11_TO = 'https://example.corp';

    env.URL_REPLACE_10_FROM = 'https://example.test';
    env.URL_REPLACE_10_TO = 'https://example.org';

    // coverage
    env.URL_REPLACE_1_FROM = 'https://example.test';

    const http = child.get(HttpService);
    const expected = cacheFile(
      `f4eba41457a330d0fa5289e49836326c6a0208bbc639862e70bb378c88c62642/replace.txt`
    );

    expect(await http.download({ url: `${baseUrl}/replace.txt` })).toBe(
      expected
    );
    // uses cache
    expect(await http.download({ url: `${baseUrl}/replace.txt` })).toBe(
      expected
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid URL replacement: URL_REPLACE_1_FROM=https://example.test URL_REPLACE_1_TO=undefined'
    );
  });
});
