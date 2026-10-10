'use strict';

/*
 * Tests for the alert recogniser.
 *
 * Most of these are not invented cases: they are taken from the reference tests in
 * Markdig's AlertBlockSpecs.md, which is the closest thing to a specification for
 * GitHub's alert syntax. The point of the extension is that the preview agrees with
 * the other places the same files are read, so a marker that is not an alert
 * elsewhere must not become one here.
 *
 * There is ONE deliberate exception, and it has its own tests below: a title after
 * the marker on the same line (`> [!TIP] Start here`). GitHub has no such thing, so
 * it renders those blocks as plain quotes; Hugo does, and Hugo renders the course
 * docs. The extension follows Hugo there, because the docs site and the preview are
 * where the material is actually read -- and the divergence is called out in the
 * README so nobody is surprised by github.com.
 *
 * Run: npm install markdown-it && npm test
 */

const MarkdownIt = require('markdown-it');
const { githubAlerts } = require('../extension.js');

const md = new MarkdownIt({ html: true, linkify: true }).use(githubAlerts);

let failures = 0;

function check(name, source, assertions) {
  const html = md.render(source);
  const problems = [];
  for (const [label, predicate] of assertions) {
    if (!predicate(html)) {
      problems.push(label);
    }
  }
  if (problems.length === 0) {
    console.log('  ok   ' + name);
  } else {
    failures += 1;
    console.log('  FAIL ' + name);
    for (const problem of problems) {
      console.log('         - ' + problem);
    }
    console.log('         output: ' + html.replace(/\n/g, '\\n'));
  }
}

const has = (needle) => (html) => html.includes(needle);
const lacks = (needle) => (html) => !html.includes(needle);
const before = (first, second) => (html) =>
  html.indexOf(first) !== -1 && html.indexOf(first) < html.indexOf(second);

console.log('alerts');

// The five types, exactly as the reference examples write them.
for (const type of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
  const title = type.charAt(0) + type.slice(1).toLowerCase();
  check(
    type + ' renders as an alert with a title and its body',
    '> [!' + type + ']\n> Body text here.\n',
    [
      ['has the alert container class', has('class="markdown-alert markdown-alert-' + type.toLowerCase())],
      ['has the title with the right label', has(title)],
      ['has the body as its own paragraph', has('<p>Body text here.</p>')],
      ['no literal marker left behind', lacks('[!' + type + ']')],
      ['renders an icon', has('<svg')],
      ['closes the alert', has('</div>')],
    ]
  );
}

// Trailing spaces after the marker are allowed (the reference examples use them).
check(
  'trailing spaces after the marker are fine',
  '> [!NOTE]   \n> Body.\n',
  [['still an alert', has('markdown-alert-note')], ['no marker left', lacks('[!NOTE]')]]
);

// Text after the marker on the same line. THE REFERENCE SAYS THIS IS NOT AN ALERT --
// Markdig's own example is "This is invalid because there is no new line" -- and
// GitHub agrees. Hugo does not: it reads that text as the alert's heading, and the
// course docs are rendered by Hugo, so the extension follows Hugo here.
//
// This is the one intentional divergence from GitHub, and the test exists to keep it
// visible rather than accidental. If the behaviour is ever changed to match GitHub
// instead, this test is where the reason it went the other way is recorded.
check(
  'text after the marker becomes the TITLE, as in Hugo (GitHub would quote it)',
  '> [!NOTE] Start here\n> More text.\n',
  [
    ['is an alert', has('markdown-alert-note')],
    ['the text became the title', has('>Start here</p>')],
    ['the body is its own paragraph', has('<p>More text.</p>')],
    ['no marker left', lacks('[!NOTE]')],
  ]
);

// Must be first in the blockquote.
check(
  'a marker that is not first is not an alert',
  '> This is not a [!NOTE]\n> More text.\n',
  [
    ['stays a plain blockquote', has('<blockquote>')],
    ['no alert container', lacks('markdown-alert')],
  ]
);

// Case-insensitive, like GitHub. These two cases exist because the first version
// of the extension required uppercase and silently ignored `[!Tip]` -- which is
// what a real reader hit first time out.
check(
  'mixed case renders, like GitHub',
  '> [!Tip]\n> Body.\n',
  [
    ['renders as a tip', has('markdown-alert-tip')],
    ['canonical title', has('>Tip</p>')],
    ['no marker left', lacks('[!Tip]')],
  ]
);

check(
  'lowercase renders too, with the canonical title',
  '> [!note]\n> Body.\n',
  [
    ['renders as a note', has('markdown-alert-note')],
    ['title is Note, not note', has('>Note</p>')],
    ['no marker left', lacks('[!note]')],
  ]
);

// The shape a reader writes naturally, and the one that exposed a misreading of
// the spec: the marker alone on its line, an empty quote line, then the body. The
// marker's paragraph ends at that blank line, so the rule must accept
// end-of-paragraph as well as end-of-line -- and having emptied the paragraph, it
// must remove it rather than leave a stray <p></p>.
check(
  'marker alone on its line, then a blank quote line, then the body',
  '> [!TIP]\n>\n> Body text.\n',
  [
    ['is an alert', has('markdown-alert-tip')],
    ['body is rendered', has('<p>Body text.</p>')],
    ['no marker left', lacks('[!TIP]')],
    ['no empty paragraph left behind', lacks('<p></p>')],
  ]
);

// A custom title, spelled the way Hugo spells it: `> [!TIP] Start here`. This is the
// one place the extension deliberately follows Hugo instead of GitHub, so it gets
// its own tests -- including that the title is escaped, since it is written into the
// output as raw HTML.
check(
  'custom title on the marker line',
  '> [!TIP] Start here\n> Body text.\n',
  [
    ['is a tip', has('markdown-alert-tip')],
    ['uses the custom title', has('>Start here</p>')],
    ['body is rendered', has('<p>Body text.</p>')],
    ['no marker left', lacks('[!TIP]')],
  ]
);

check(
  'no title falls back to the canonical label',
  '> [!TIP]\n> Body text.\n',
  [['canonical title', has('>Tip</p>')]]
);

// Inline markup in a title is RENDERED, not shown literally: Hugo formats a heading's
// markup (verified: it emits <code> for a code span in a title), so the preview has to
// agree. The body must still come out clean -- getting that wrong is what the
// token-walking rewrite of stripMarker fixed.
check(
  'markup in a title is rendered, as Hugo renders it',
  '> [!NOTE] Run `labctl check` first\n> Body.\n',
  [
    ['is an alert', has('markdown-alert-note')],
    ['the code span is rendered', has('<code>labctl check</code>')],
    ['the title is complete', has('first</p>')],
    ['the body is unaffected', has('<p>Body.</p>')],
    ['no marker left', lacks('[!NOTE]')],
  ]
);

check(
  'a custom title with a blank quote line then the body',
  '> [!TIP] Start here\n>\n> Body text.\n',
  [
    ['is an alert', has('markdown-alert-tip')],
    ['uses the custom title', has('>Start here</p>')],
    ['no empty paragraph', lacks('<p></p>')],
  ]
);

// Code blocks and inline code inside an alert survive.
check(
  'code inside an alert survives',
  '> [!NOTE]\n> Text before.\n> ```csharp\n> var test = "code";\n> ```\n> `inline code`\n',
  [
    ['is an alert', has('markdown-alert-note')],
    ['keeps the fenced block', has('<pre><code class="language-csharp">')],
    ['keeps the inline code', has('<code>inline code</code>')],
    ['no marker left', lacks('[!NOTE]')],
  ]
);

// Multiple paragraphs, and a nested blockquote that must stay a blockquote but
// still be inside the alert.
check(
  'multiple paragraphs and a nested quote',
  '> [!WARNING]\n> First paragraph.\n>\n> Second paragraph.\n>\n> > Nested quote\n>\n> Final line.\n',
  [
    ['is an alert', has('markdown-alert-warning')],
    ['keeps both paragraphs', (html) => (html.match(/<p>/g) || []).length >= 4],
    ['the nested quote stays a blockquote', has('<blockquote>')],
    ['and it is nested inside the alert', before('markdown-alert-warning', '<blockquote>')],
    ['keeps the last line', has('Final line.')],
    ['no marker left', lacks('[!WARNING]')],
  ]
);

// An ordinary blockquote is untouched, and two alerts do not confuse each other.
check(
  'a plain blockquote is untouched',
  '> Just a quote.\n> Still the quote.\n',
  [
    ['stays a blockquote', has('<blockquote>')],
    ['no alert container', lacks('markdown-alert')],
  ]
);

check(
  'two alerts in one document each close correctly',
  '> [!NOTE]\n> First.\n\n> [!CAUTION]\n> Second.\n',
  [
    ['both containers present', has('markdown-alert-note')],
    ['second type present', has('markdown-alert-caution')],
    ['two closes', (html) => (html.match(/<\/div>/g) || []).length === 2],
    ['no markers left', lacks('[!')],
  ]
);

// A plain blockquote before an alert must not steal the alert's close token.
check(
  'a plain quote followed by an alert still closes correctly',
  '> Plain.\n\n> [!TIP]\n> Alert body.\n\n> Plain again.\n',
  [
    ['the alert is rendered', has('markdown-alert-tip')],
    ['both plain quotes survive', (html) => (html.match(/<blockquote>/g) || []).length === 2],
    ['the alert div closes', (html) => (html.match(/<\/div>/g) || []).length === 1],
  ]
);

console.log('');
if (failures > 0) {
  console.log(failures + ' test(s) failed');
  process.exit(1);
}
console.log('all tests passed');
