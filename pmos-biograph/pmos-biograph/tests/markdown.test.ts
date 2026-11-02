import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInline, parseMarkdown, safeHref } from '../src/utils/markdown.ts';

test('keeps site-relative and https links, refuses everything else', () => {
  assert.deepEqual(safeHref('/entity/gene-ar'), { href: '/entity/gene-ar', external: false });
  assert.deepEqual(safeHref('https://reactome.org/content/detail/R-HSA-383280'), {
    href: 'https://reactome.org/content/detail/R-HSA-383280',
    external: true,
  });
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'http://example.com', '//evil.example/x', 'ftp://x', 'vbscript:x', '']) {
    assert.equal(safeHref(bad), null, bad);
  }
});

test('a link with an unsafe target becomes plain text, never a link', () => {
  for (const md of ['[click](javascript:alert(1))', '[x](//evil.example)', '[x](http://evil.example)', '[x](data:text/html;base64,AAAA)']) {
    const tokens = parseInline(md);
    assert.ok(tokens.every((t) => t.kind === 'text'), `${md} produced a non-text token`);
    assert.ok(!tokens.map((t) => ('text' in t ? t.text : '')).join('').includes('javascript'), md);
  }
  assert.deepEqual(parseInline('[x](//evil.example)'), [{ kind: 'text', text: 'x' }]);
});

test('parses bold, links and citation markers', () => {
  assert.deepEqual(parseInline('**Flutamide** blocks AR [R1, R2]. See [AR](/entity/gene-ar).'), [
    { kind: 'bold', inner: [{ kind: 'text', text: 'Flutamide' }] },
    { kind: 'text', text: ' blocks AR ' },
    { kind: 'cite', refs: ['R1', 'R2'] },
    { kind: 'text', text: '. See ' },
    { kind: 'link', text: 'AR', href: '/entity/gene-ar', external: false },
    { kind: 'text', text: '.' },
  ]);
});

test('a bold span may wrap a link (the plain-records answers do this)', () => {
  const [bold, rest] = parseInline('**[Polycystic Ovary Syndrome](/entity/process-pcos)** (process): text');
  assert.deepEqual(bold, {
    kind: 'bold',
    inner: [{ kind: 'link', text: 'Polycystic Ovary Syndrome', href: '/entity/process-pcos', external: false }],
  });
  assert.deepEqual(rest, { kind: 'text', text: ' (process): text' });
});

test('an unsafe link inside bold is still refused', () => {
  const [bold] = parseInline('**[x](javascript:alert(1))**');
  assert.ok(bold.kind === 'bold' && bold.inner.every((t) => t.kind === 'text'));
});

test('a citation next to a link is not mistaken for a link', () => {
  const tokens = parseInline('- [R1] [Flutamide](/entity/therapeutic-flutamide) (therapeutic)');
  assert.deepEqual(tokens.map((t) => t.kind), ['text', 'cite', 'text', 'link', 'text']);
});

test('link text may contain parentheses (long pathway names)', () => {
  const [link] = parseInline('[HSP90 chaperone cycle for steroid hormone receptors (SHR)](/entity/pathway-x)');
  assert.equal(link.kind, 'link');
});

test('html and script tags stay inert text for React to escape', () => {
  const tokens = parseInline('<script>alert(1)</script> <img src=x onerror=alert(1)>');
  assert.deepEqual(tokens, [{ kind: 'text', text: '<script>alert(1)</script> <img src=x onerror=alert(1)>' }]);
});

test('groups consecutive list lines and separates paragraphs', () => {
  const blocks = parseMarkdown('Sources:\n- [R1] one\n- [R2] two\n\nNot found: bacteria.');
  assert.deepEqual(blocks.map((b) => b.kind), ['paragraph', 'list', 'paragraph']);
  const list = blocks[1];
  assert.equal(list.kind === 'list' && list.items.length, 2);
});

test('handles empty and malformed input without throwing', () => {
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown('\n\n  \n'), []);
  for (const odd of ['**', '[', '](', '[a](', '**bold', '[R1', '[R1,]', '- ', '-']) {
    assert.doesNotThrow(() => parseMarkdown(odd), odd);
  }
});
