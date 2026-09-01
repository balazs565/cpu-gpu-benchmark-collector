/**
 * Minimal HTML-entity decoder.
 *
 * PassMark's JSON encodes href fragments with entities such as `&amp;`.
 * We deliberately avoid using the DOM here so this module works unchanged in
 * the service worker (which has no `document`).
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  trade: '™',
  reg: '®',
  copy: '©',
  deg: '°',
  hellip: '…',
  mdash: '—',
  ndash: '–',
};

export function decodeEntities(input: string): string {
  if (!input || input.indexOf('&') === -1) return input;
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED[body.toLowerCase()];
    return named !== undefined ? named : match;
  });
}
