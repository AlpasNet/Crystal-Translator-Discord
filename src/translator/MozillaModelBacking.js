import { TranslatorBacking } from '@browsermt/bergamot-translator/translator.js';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzip as gunzipCallback } from 'node:zlib';
import { promisify } from 'node:util';

const gunzip = promisify(gunzipCallback);
const DEFAULT_REGISTRY = 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json';

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function maybeGunzip(buffer) {
  try {
    return await gunzip(buffer);
  } catch {
    // Some HTTP stacks may already decode the payload based on response headers.
    return buffer;
  }
}

export class MozillaModelBacking extends TranslatorBacking {
  async loadModelRegistery() {
    const registryUrl = this.options.mozillaRegistryUrl || DEFAULT_REGISTRY;
    const timeoutMs = Number(this.options.downloadTimeout || 120_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let data;
    try {
      const response = await fetch(registryUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`Mozilla registry HTTP ${response.status}`);
      data = await response.json();
    } finally {
      clearTimeout(timeout);
    }

    const architecture = this.options.modelArchitecture || 'base-memory';
    const releaseStatus = this.options.modelReleaseStatus || 'Release';
    const wantedPairs = ['fr-en', 'en-fr'];

    return wantedPairs.map((pair) => {
      const candidates = data.models?.[pair] || [];
      const selected =
        candidates.find((m) => m.architecture === architecture && m.releaseStatus === releaseStatus) ||
        candidates.find((m) => m.architecture === architecture) ||
        candidates.find((m) => m.releaseStatus === releaseStatus) ||
        candidates[0];

      if (!selected) throw new Error(`No Mozilla model found for ${pair}`);
      return {
        from: selected.sourceLanguage,
        to: selected.targetLanguage,
        model: selected,
        baseUrl: data.baseUrl
      };
    });
  }

  // Deliberately avoid TranslatorBacking's permanent in-process ArrayBuffer cache.
  // Bergamot's worker keeps loaded models; disk cache is enough and saves RAM.
  getTranslationModel(pair, options) {
    return this.loadTranslationModel(pair, options);
  }

  async loadTranslationModel({ from, to }, options) {
    const entries = await this.registry;
    const entry = entries.find((model) => model.from === from && model.to === to);
    if (!entry) throw new Error(`No Mozilla model available for ${from}->${to}`);

    const modelInfo = entry.model;
    const files = modelInfo.files;
    const identity = createHash('sha256')
      .update(JSON.stringify({
        model: files.model?.path,
        vocab: files.vocab?.path,
        lex: files.lexicalShortlist?.path
      }))
      .digest('hex')
      .slice(0, 16);

    const cacheRoot = path.resolve(this.options.modelCacheDir || './data/models');
    const pairDir = path.join(cacheRoot, `${from}-${to}`, identity);
    await mkdir(pairDir, { recursive: true });

    const [model, vocab, shortlist] = await Promise.all([
      this.#getFile(entry.baseUrl, files.model.path, path.join(pairDir, 'model.bin'), options),
      this.#getFile(entry.baseUrl, files.vocab.path, path.join(pairDir, 'vocab.spm'), options),
      this.#getFile(entry.baseUrl, files.lexicalShortlist.path, path.join(pairDir, 'lex.bin'), options)
    ]);

    const expectedHash = files.model?.uncompressedHash;
    if (expectedHash) {
      const actualHash = createHash('sha256').update(model).digest('hex');
      if (actualHash !== expectedHash) {
        throw new Error(`SHA-256 mismatch for ${from}->${to} model`);
      }
    }

    return {
      model: toArrayBuffer(model),
      shortlist: toArrayBuffer(shortlist),
      vocabs: [toArrayBuffer(vocab)],
      config: {}
    };
  }

  async #getFile(baseUrl, relativePath, cachePath, options) {
    try {
      return await readFile(cachePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const url = `${baseUrl.replace(/\/$/, '')}/${relativePath.replace(/^\//, '')}`;
    const timeoutMs = Number(this.options.downloadTimeout || 120_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromParent = () => controller.abort();
    options?.signal?.addEventListener('abort', abortFromParent, { once: true });

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${relativePath}`);
      const compressed = Buffer.from(await response.arrayBuffer());
      const content = relativePath.endsWith('.gz') ? await maybeGunzip(compressed) : compressed;
      await writeFile(cachePath, content);
      return content;
    } finally {
      clearTimeout(timeout);
      options?.signal?.removeEventListener('abort', abortFromParent);
    }
  }
}
