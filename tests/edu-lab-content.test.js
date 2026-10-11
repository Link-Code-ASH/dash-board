import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contentText, itemChoices, itemFigures, safeMarkdownUrl, safeSvgAttribute } from "../src/edu/lab/content.js";

const require = createRequire(import.meta.url);
const compilation = await build({
  stdin: {
    contents: 'export { default as LabMarkdown } from "./src/edu/lab/LabMarkdown.jsx"; export { default as ItemPaper } from "./src/edu/lab/ItemPaper.jsx";',
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    loader: "jsx",
  },
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{
    name: "test-component-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /\.css$/ }, () => ({ path: "ignored-css", namespace: "empty-css" }));
      builder.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "", loader: "js" }));
      builder.onResolve({ filter: /^[^./]/ }, ({ path }) => ({ path: pathToFileURL(require.resolve(path)).href, external: true }));
    },
  }],
});
const { LabMarkdown, ItemPaper } = await import(`data:text/javascript;base64,${Buffer.from(compilation.outputFiles[0].text).toString("base64")}`);
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test("outside-written optional item values do not crash or invent content", () => {
  assert.equal(contentText({ body: "wrong" }), "");
  assert.deepEqual(itemChoices(null), []);
  assert.deepEqual(itemFigures({ svg: "wrong" }), []);
  assert.deepEqual(itemChoices(["첫째", { label: "②", text: "둘째" }, null, 42, { body: "셋째" }]), [
    { label: "1", text: "첫째" }, { label: "②", text: "둘째" }, { label: "5", text: "셋째" },
  ]);
  assert.deepEqual(itemFigures([null, "wrong", { svg: "<svg/>", caption: 3 }]), [{ svg: "<svg/>", caption: "" }]);
  assert.doesNotThrow(() => render(ItemPaper, { item: { choices: { bad: true }, figures: [null], stem: null } }));
});

test("science Markdown renders fractions and only attribute-free scientific HTML", () => {
  const html = render(LabMarkdown, { children: "H<sub>2</sub>O, x<sup>2</sup>, $\\frac{mv^2}{2}$. <script>alert(1)</script> <sup onclick=\"alert(1)\">3</sup>" });
  assert.match(html, /H<sub>2<\/sub>O/);
  assert.match(html, /x<sup>2<\/sup>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /<mfrac>/);
  assert.doesNotMatch(html, /<script|onclick=|<sup onclick/);
});

test("Markdown never embeds remote images or script links and KaTeX trust stays disabled", () => {
  const html = render(LabMarkdown, { children: '![그림](https://evil.example/track.svg) [위험](javascript:alert%281%29) [자료](https://example.org) $\\href{javascript:alert(1)}{x}$' });
  assert.doesNotMatch(html, /<img|href="javascript:|src="https:\/\/evil/);
  assert.match(html, /href="https:\/\/example.org"/);
  assert.match(html, /rel="noopener noreferrer"/);
  for (const url of ["javascript:alert(1)", "data:text/html,evil", "//evil.example", "java\nscript:alert(1)", "https:\\evil.example"]) assert.equal(safeMarkdownUrl(url), "");
  for (const url of ["https://example.org", "mailto:a@example.org", "#source", "./source"]) assert.equal(safeMarkdownUrl(url), url);
});

test("SVG policy permits diagram geometry and local markers but rejects executable or remote resources", () => {
  for (const [name, value] of [["d", "M0 0 L20 40"], ["viewBox", "0 0 200 100"], ["fill", "#aabbcc"], ["stroke", "rgb(10, 20, 30)"], ["marker-end", "url(#arrow)"], ["clip-path", "url(#clip-1)"]]) {
    assert.equal(safeSvgAttribute(name, value), true, `${name}=${value}`);
  }
  for (const [name, value] of [["onload", "alert(1)"], ["style", "fill:url(https://evil.example)"], ["href", "#shape"], ["xlink:href", "javascript:alert(1)"], ["fill", "url(https://evil.example)"], ["stroke", "url(data:image/svg+xml,evil)"], ["mask", "url(//evil.example)"], ["fill", "u\\72l(https://evil.example)"]]) {
    assert.equal(safeSvgAttribute(name, value), false, `${name}=${value}`);
  }
});

test("screen answers collapse and print answers are controlled by explicit selection", () => {
  const item = { title: "운동량", stem: "문제 본문", choices: ["1 kg", "2 kg"], answer: "SECRET ANSWER", explanation: "SECRET EXPLANATION" };
  const screen = render(ItemPaper, { item, number: 2 });
  assert.match(screen, /<details class="lab-paper-answers">/);
  assert.match(screen, /2\. /);
  assert.match(screen, /SECRET ANSWER/);
  const questionsOnly = render(ItemPaper, { item, showAnswers: false, collapsible: false });
  assert.doesNotMatch(questionsOnly, /SECRET ANSWER|SECRET EXPLANATION|<details/);
  const withAnswers = render(ItemPaper, { item, showAnswers: true, collapsible: false });
  assert.match(withAnswers, /SECRET ANSWER/);
  assert.match(withAnswers, /SECRET EXPLANATION/);
  assert.doesNotMatch(withAnswers, /<details/);
});
