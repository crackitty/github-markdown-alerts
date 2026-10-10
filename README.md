# GitHub markdown alerts

A tiny VS Code extension that teaches the built-in **markdown preview** GitHub's
alert syntax:

```markdown
> [!TIP]
> Run `labctl list` to see the labs.
```

It renders the five types GitHub supports — `NOTE`, `TIP`, `IMPORTANT`,
`WARNING`, `CAUTION` — as coloured callouts with GitHub's own icons, in the
preview and in the markdown editor of VS Code (web), which is what students use.

## Why this exists, and why we own it

The same markdown is read in three places: on github.com, on the docs site (Hugo,
which renders alerts through Hextra), and in the workspace's markdown preview.
GitHub and the docs site understand alerts; VS Code's preview does not, so the
reader gets a quoted paragraph with a literal `[!TIP]` in it.

The obvious fix is an extension, and the one usually recommended —
`saeris.markdown-github-alerts` — **is not on Open VSX**, which is the only
registry code-server can install from at runtime. Rather than vendor someone
else's VSIX or point the editor at the Microsoft Marketplace (which its terms do
not allow for non-VS Code products), this is our own: about 150 lines, no
dependencies, MIT.

## What it does, precisely

The recogniser follows the reference tests in
[Markdig's `AlertBlockSpecs.md`](https://github.com/xoofx/markdig/blob/main/src/Markdig.Tests/Specs/AlertBlockSpecs.md),
which encode GitHub's behaviour, and matches GitHub so the preview and github.com
never disagree:

| Input                                              | Result                                                  |
| -------------------------------------------------- | ------------------------------------------------------- |
| `> [!NOTE]` then a newline, then body              | an alert                                                |
| `> [!NOTE]` then a blank quote line, then the body | an alert                                                |
| `> [!NOTE]   ` (trailing spaces) then a newline    | an alert                                                |
| `> [!Tip]`, `> [!note]` (any case)                 | an alert — GitHub matches case-insensitively            |
| `> [!NOTE] Start here` (text after the marker)     | an alert **with "Start here" as the title** — see below |
| `> text, then [!NOTE]`                             | **not** an alert — the marker must come first           |

### Titles, and the one deliberate divergence from GitHub

Hugo lets an alert carry its own heading:

```markdown
> [!TIP] Start here
> Everything under this heading is the alert body.
```

That renders as a **Tip**-styled callout headed _Start here_, and with nothing after
the marker it falls back to the label — `> [!TIP]` still reads "Tip". Verified against
the Hugo version this site pins: it renders the title, and any other spelling, such as
`> [!TIP:Start here]`, is left completely alone by Hugo, GitHub and VS Code alike.

**The catch:** GitHub treats text after the marker as "not an alert at all", so that
block is an ordinary quote on github.com. This extension follows **Hugo**, not GitHub,
because the docs site and this preview are where the material is actually read — but it
is a trade, so:

- **Docs pages** (read on the docs site, rendered by Hugo): custom titles are fine.
- **Anything also read on GitHub** (the lab steps, for instance): use the canonical
  title and a bold lead-in on the body's first line instead. That renders as an alert
  everywhere:

```markdown
> [!TIP]
> **Start here** — everything under this heading is the alert body.
```

Inline markup in a title is **rendered**, matching Hugo: code spans, bold and links in
a heading are formatted on the docs site and in the preview alike. (Raw HTML in a title
follows the preview's own HTML setting, exactly as Hugo's does.)

The case rule was got wrong at first: the extension required uppercase, on the
strength of reference tests that only ever show uppercase. GitHub is in fact
case-insensitive, as is Hugo's renderer in the version this site pins, so the
uppercase-only rule made the preview stricter than the thing it was imitating —
a mixed-case marker then rendered in neither. The tests cover `[!Tip]` and
`[!note]` specifically so that cannot come back.

Bodies keep working as markdown: code fences, inline code, multiple paragraphs and
nested blockquotes all survive, and a nested quote stays a quote inside the alert.

## Install

There is no VSIX to build: the extension is plain CommonJS, so it is installed by
copying the directory into code-server's extensions directory under the
`<publisher>.<name>-<version>` name VS Code expects:

```bash
cp -r github-markdown-alerts \
  ~/.local/share/code-server/extensions/k8s4ops.markdown-alerts-1.0.0
```

In the course workspace the image carries a copy at `/opt/k8s4ops-extensions/` and
the startup script performs that copy on every start, so a workspace picks up any
change on its next start without an image rebuild of the home directory. Restart
the workspace (or the code-server process) for it to load.

To check it is installed:

```bash
code-server --list-extensions | grep markdown-alerts
```

## Test

The tests are ported from the reference cases above, so a failure means the
preview would disagree with GitHub about what an alert is:

```bash
npm install markdown-it --no-save
npm test
```

They run against real `markdown-it`, no VS Code required, which is the point: the
plugin is where every interesting decision lives, and the VS Code wiring around it
is three declarative keys in `package.json`.
