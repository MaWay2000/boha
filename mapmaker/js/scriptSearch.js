import { highlightJavaScript } from './vendor/prism-javascript.js';

export function findScriptMatches(source, query, matchCase = false) {
  if (!query) return [];
  const escaped = query.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const pattern = new RegExp(escaped, matchCase ? 'g' : 'gi');
  const matches = [];
  let match;
  while ((match = pattern.exec(source))) matches.push({start:match.index, end:match.index + match[0].length});
  return matches;
}

export function replaceScriptMatches(source, matches, replacement) {
  const parts = [];
  let offset = 0;
  for (const match of matches) {
    parts.push(source.slice(offset, match.start), replacement);
    offset = match.end;
  }
  parts.push(source.slice(offset));
  return parts.join('');
}

export function highlightScriptSearch(source, matches = [], activeIndex = -1) {
  const html = highlightJavaScript(source);
  if (!matches.length) return html;
  let offset = 0, index = 0;
  // Only decorate escaped text, never Prism's tags or token attributes.
  // Entity sequences each represent one source character; UTF-16 offsets are
  // kept consistent with textarea selections and RegExp match indexes.
  return html.replace(/<[^>]+>|[^<]+/g, part => {
    if (part.startsWith('<')) return part;
    const characters = part.match(/&(?:amp|lt);|[^]/g) || [];
    let output = '', marked = false, current = false;
    for (const character of characters) {
      while (index < matches.length && offset >= matches[index].end) index++;
      const inside = index < matches.length && offset >= matches[index].start && offset < matches[index].end;
      const isCurrent = inside && index === activeIndex;
      if (marked && (!inside || isCurrent !== current)) { output += '</mark>'; marked = false; }
      if (inside && !marked) {
        output += '<mark class="script-search-match' + (isCurrent ? ' is-current' : '') + '">';
        marked = true;
        current = isCurrent;
      }
      output += character;
      offset++;
    }
    if (marked) output += '</mark>';
    return output;
  });
}
