'use strict';

/*
 * GitHub alerts in the built-in markdown preview.
 *
 *   > [!NOTE]
 *   > Something worth knowing.
 *
 * GitHub renders those five blockquote types as coloured alert boxes, and the
 * syntax is documented in the discussion that introduced it:
 * https://github.com/orgs/community/discussions/16925
 *
 * VS Code's built-in preview does not understand them, so a student reading the
 * lab material in the editor sees a quoted paragraph with a literal "[!TIP]" in
 * it. This extension teaches the preview the same syntax.
 *
 * HOW IT PLUGS IN
 *
 * VS Code's markdown extension accepts markdown-it plugins from other extensions
 * through the `markdown.markdownItPlugins` contribution. We declare it in
 * package.json and return `extendMarkdownIt` from `activate`, which is handed the
 * live markdown-it instance. No dependency on markdown-it ourselves: we only
 * register a rule.
 *
 * This runs in the extension host, which inside code-server is the browser's web
 * worker, so the file must be plain CommonJS with no Node APIs. It is.
 *
 * THE RULES, AND WHY THEY ARE THIS STRICT
 *
 * The recogniser follows the reference tests in Markdig's AlertBlockSpecs, which
 * encode GitHub's behaviour:
 *
 *   * the marker must be the FIRST thing in the blockquote;
 *   * the marker may be followed by a TITLE, then the end of its line:
 *     `> [!TIP] Start here` renders with "Start here" as the heading. With nothing
 *     after the marker the canonical label is used, so plain `> [!TIP]` reads "Tip".
 *
 * That title rule is a DELIBERATE DIVERGENCE FROM GITHUB, and the only one here.
 * GitHub treats any text after the marker as "not an alert at all", so
 * `> [!TIP] Start here` is an ordinary quote there. Hugo -- which renders the course
 * docs, and is where the material is actually read -- supports the title and does
 * exactly what this does. Matching Hugo rather than GitHub is the right trade, but
 * it is still a trade, and worth knowing for each case: that block will look like a
 * plain quote on github.com.
 *
 * For content that has to read well on GitHub too -- the lab steps, say -- use the
 * canonical title and put a bold lead-in on the body's first line instead, which
 * renders as an alert everywhere:
 *
 *   > [!TIP]
 *   > **Start here** -- then the rest of the sentence.
 *
 *
 * That second rule was implemented wrongly at first, and it is worth recording
 * because the wording in the reference tests is easy to misread: "must be followed
 * by optional spaces with a new line" means THE MARKER'S LINE ENDS THERE, not
 * "the body has to continue on the next line". The first version required a
 * newline inside the marker's paragraph, which rejected the most natural way
 * anyone writes an alert with a paragraph body:
 *
 *   > [!TIP]
 *   >
 *   > Don't forget to bring a towel!
 *
 * The blank quote line ends the marker's paragraph, so there was no newline left
 * inside it and the marker never matched. The rule is now `(\r?\n|$)` -- end of
 * line, or end of the paragraph -- and a marker whose paragraph ends up empty has
 * that empty paragraph removed so it does not render as a stray `<p></p>`.
 *
 *   * the keyword is matched CASE-INSENSITIVELY, which is what GitHub does:
 *     `[!TIP]`, `[!Tip]` and `[!note]` all render.
 *
 * That last rule is a correction. The first version of this file required
 * uppercase, because the reference tests only ever show uppercase and it seemed
 * the safer reading of "match GitHub exactly". It was wrong, and wrong in the
 * worst way: a mixed-case marker rendered in neither the preview nor anywhere
 * else, which is precisely the disagreement this extension exists to prevent.
 * Being stricter than the thing you are imitating is not the same as being
 * faithful to it.
 *
 * Matching the surface that renders the same files still matters, which is why the
 * first, case and blank-line rules follow GitHub exactly. The title is the single
 * exception, and it is the one worth knowing about, because the two references
 * genuinely disagree: GitHub has no titles, Hugo does. We follow Hugo, so the docs
 * site and the preview agree with each other -- and GitHub shows those particular
 * blocks as plain quotes.
 */

// GitHub's own icons, from the discussion above. fill="currentColor" so the icon
// takes the alert colour from the stylesheet, and `viewBox`/`width`/`height` are
// kept as GitHub emits them.
const ICONS = {
  NOTE:
    '<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
  TIP:
    '<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
  IMPORTANT:
    '<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
  WARNING:
    '<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
  CAUTION:
    '<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
};

const TITLES = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};

// First in the blockquote: the marker, then an optional title, then the end of the
// line (or the end of the paragraph). Case-insensitive, because GitHub is. The title
// is what Hugo calls the alert heading; see the header for why we follow Hugo here
// and not GitHub.
const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+([^\r\n]*?))?[ \t]*(?:\r?\n|$)/i;

/**
 * Remove the marker from an inline token, children first so the rendered output
 * loses it too.
 *
 * The marker's own newline is not a character in the token stream: markdown-it
 * turns an intra-paragraph newline into a `softbreak` token of its own. Trimming
 * only text therefore leaves a stray line break at the top of the alert body, so
 * this removes the text characters and then exactly one softbreak, which is the
 * one the marker's newline became.
 */
function stripMarker(inline, markerText) {
  const children = inline.children || [];
  const textLength = markerText.replace(/\r?\n$/, '').length;

  // Removal walks across token TYPES, not just plain text: a custom title may contain
  // inline markup, and then the characters to drop live in code_inline, html_inline,
  // strong/em pairs and so on. Consuming only text tokens left the tail of the title
  // behind in the body -- `> [!TIP] Run `labctl check` first` lost everything up to
  // the code span and kept " first".
  let remaining = textLength;
  let i = 0;
  while (i < children.length && remaining > 0) {
    const child = children[i];
    const content = typeof child.content === 'string' ? child.content : '';

    // A line break inside the marker's own line cannot happen, so hitting one means
    // the text we are removing is done; stop rather than eat into the body.
    if (child.type === 'softbreak' || child.type === 'hardbreak') {
      break;
    }

    if (content === '') {
      // Markup tokens that carry no text (an opening emphasis, say) are part of the
      // marker while we are still inside it, so drop them. Anything opened inside the
      // title is also closed inside it, so this cannot unbalance the output.
      children.splice(i, 1);
      continue;
    }

    const take = Math.min(remaining, content.length);
    child.content = content.slice(take);
    remaining -= take;
    if (child.content.length === 0) {
      children.splice(i, 1);
    } else {
      i += 1;
    }
  }

  if (/[\r\n]$/.test(markerText) && children[i] && children[i].type === 'softbreak') {
    children.splice(i, 1);
  }

  if (inline.content) {
    inline.content = inline.content.slice(markerText.length);
  }
}

function githubAlerts(md) {
  md.core.ruler.push('k8s4ops_github_alerts', (state) => {
    const tokens = state.tokens;

    // Track open blockquotes so a close token can be found without assuming that
    // alert bodies contain no blockquotes of their own -- they may, and the
    // reference tests cover exactly that case.
    const openAlerts = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === 'blockquote_close') {
        if (openAlerts.length > 0) {
          token.tag = 'div';
          openAlerts.pop();
        }
        continue;
      }

      if (token.type !== 'blockquote_open') {
        continue;
      }

      // A plain quote: leave it alone, and remember that the next close belongs
      // to a blockquote rather than one of our divs.
      const paraOpen = tokens[i + 1];
      const inline = tokens[i + 2];
      if (!paraOpen || paraOpen.type !== 'paragraph_open' || !inline || inline.type !== 'inline') {
        continue;
      }

      const match = MARKER.exec(inline.content);
      if (!match) {
        continue;
      }

      // Matched case-insensitively, so normalise before the lookups: the titles
      // and icons are keyed by the canonical uppercase name.
      const type = match[1].toUpperCase();

      // An optional custom title may follow the marker on the same line. With none,
      // the canonical label is used, so `> [!TIP]` still reads "Tip".
      const titleText = (match[2] || '').trim() || TITLES[type];

      token.tag = 'div';
      token.attrJoin('class', 'markdown-alert markdown-alert-' + type.toLowerCase());
      openAlerts.push(i);

      stripMarker(inline, match[0]);

      // If the marker was the whole paragraph -- `> [!TIP]` alone on its line, with
      // the body after a blank quote line -- then the paragraph that held it is now
      // empty. Drop it, or it renders as a stray <p></p> between title and body.
      const paragraphClose = tokens[i + 3];
      if (inline.content === '' && paragraphClose && paragraphClose.type === 'paragraph_close') {
        tokens.splice(i + 1, 3);
      }

      // The title is its own block, matching GitHub's structure, and is built as
      // an html_block token: manually created html tokens are rendered verbatim
      // regardless of whether the preview has raw HTML parsing enabled.
      //
      // The constructor is taken from an existing token rather than from
      // `state.Token`, because VS Code bundles its own markdown-it and this has to
      // work with whatever version is in there. `state.Token` exists in
      // markdown-it 14, which is what the test suite uses; if the bundled version
      // is older it does not, and reaching for it would throw inside the render --
      // which would look exactly like the plugin never running. A plain object
      // with the fields the renderer reads is the last resort: for html_block that
      // is type, content, block and hidden.
      const Token = state.Token || (tokens[0] && tokens[0].constructor);
      const title = Token
        ? new Token('html_block', '', 0)
        : { type: 'html_block', content: '', block: true, hidden: false, level: 0 };
      // The title goes through markdown-it's INLINE renderer rather than being escaped
      // by hand, because that is what Hugo does with a heading: markup in a title is
      // rendered, so a title containing a code span or bold shows that formatting on
      // the docs site and in the preview alike -- verified against the pinned Hugo.
      // renderInline runs only the inline rules, so it cannot re-enter this core rule.
      title.content =
        '<p class="markdown-alert-title">' + ICONS[type] + md.renderInline(titleText) + '</p>\n';
      tokens.splice(i + 1, 0, title);

      // Skip past what we just inserted so the title token is not treated as a
      // blockquote body, and so `i` still points at our open token.
      i += 1;
    }

    return true;
  });
}

function activate() {
  return {
    extendMarkdownIt(md) {
      return md.use(githubAlerts);
    },
  };
}

function deactivate() {}

module.exports = { activate, deactivate, githubAlerts };
