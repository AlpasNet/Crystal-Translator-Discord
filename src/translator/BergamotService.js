import { BatchTranslator } from '@browsermt/bergamot-translator/translator.js';
import { MozillaModelBacking } from './MozillaModelBacking.js';
import { TermProtector } from './TermProtector.js';

export class BergamotService {
  constructor(config) {
    this.protector = new TermProtector(config.terms);

    const options = {
      workers: 1,
      batchSize: 1,
      cacheSize: 0,
      pivotLanguage: null,
      downloadTimeout: config.model.downloadTimeoutMs,
      mozillaRegistryUrl: config.model.registryUrl,
      modelArchitecture: config.model.architecture,
      modelReleaseStatus: config.model.releaseStatus,
      modelCacheDir: config.model.cacheDir,
      onerror: (error) => console.error('[Bergamot worker]', error)
    };

    const backing = new MozillaModelBacking(options);
    this.translator = new BatchTranslator(options, backing);
  }

  async translate(text, from, to) {
    if (!text?.trim()) return '';
    const protectedInput = this.protector.protect(text, from, to);
    const response = await this.translator.translate({
      from,
      to,
      text: protectedInput.text,
      html: false,
      qualityScores: false,
      priority: 0
    });
    return this.protector.restore(response.target.text, protectedInput.replacements).trim();
  }

  async close() {
    await this.translator.delete();
  }
}
