const TOKEN_PREFIX = 'ZXQCRYSTAL';
const TOKEN_SUFFIX = 'QXZ';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termRegex(term) {
  const escaped = escapeRegex(term);
  const startsWord = /^[\p{L}\p{N}_]/u.test(term);
  const endsWord = /[\p{L}\p{N}_]$/u.test(term);
  return new RegExp(`${startsWord ? '(?<![\\p{L}\\p{N}_])' : ''}${escaped}${endsWord ? '(?![\\p{L}\\p{N}_])' : ''}`, 'giu');
}

export class TermProtector {
  constructor(termsConfig) {
    this.protectedTerms = Array.isArray(termsConfig?.protectedTerms) ? termsConfig.protectedTerms : [];
    this.dictionary = termsConfig?.dictionary || {};
  }

  protect(text, from, to) {
    let output = String(text ?? '');
    const replacements = [];

    const reserve = (replacement) => {
      const token = `${TOKEN_PREFIX}${String(replacements.length).padStart(4, '0')}${TOKEN_SUFFIX}`;
      replacements.push({ token, replacement: String(replacement) });
      return token;
    };

    // Discord syntax and technical content should never be translated.
    const technicalPatterns = [
      /```[\s\S]*?```/g,
      /`[^`\n]+`/g,
      /<a?:[A-Za-z0-9_~]+:\d+>/g,
      /<@!?\d+>/g,
      /<@&\d+>/g,
      /<#\d+>/g,
      /<t:\d+(?::[tTdDfFR])?>/g,
      /https?:\/\/[^\s<>]+/gi
    ];

    for (const pattern of technicalPatterns) {
      output = output.replace(pattern, (match) => reserve(match));
    }

    // Apply the directional dictionary before generic protected terms.
    const dict = this.dictionary[`${from}-${to}`] || {};
    const dictionaryEntries = Object.entries(dict).sort(([a], [b]) => b.length - a.length);
    for (const [source, target] of dictionaryEntries) {
      output = output.replace(termRegex(source), () => reserve(target));
    }

    // Preserve game/community terms exactly as typed.
    const protectedTerms = [...this.protectedTerms].sort((a, b) => b.length - a.length);
    for (const term of protectedTerms) {
      output = output.replace(termRegex(term), (match) => reserve(match));
    }

    return { text: output, replacements };
  }

  restore(text, replacements) {
    let output = String(text ?? '');
    for (const { token, replacement } of replacements) {
      // Most models copy the token exactly. The second form tolerates inserted spaces.
      const compact = new RegExp(escapeRegex(token), 'gi');
      output = output.replace(compact, replacement);

      const digits = token.slice(TOKEN_PREFIX.length, -TOKEN_SUFFIX.length).split('').join('\\s*');
      const spaced = new RegExp(`${TOKEN_PREFIX}\\s*${digits}\\s*${TOKEN_SUFFIX}`, 'gi');
      output = output.replace(spaced, replacement);
    }
    return output;
  }
}
