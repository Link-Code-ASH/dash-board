import test from "node:test";
import assert from "node:assert/strict";
import { exampleSegments } from "../src/lingo/furigana.js";

const assertLossless = (text, segments) => assert.equal(segments.map((segment) => segment.text).join(""), text);

test("example readings align to Han runs with kana anchors", () => {
  const example = "朝ご飯を食べます。";
  const segments = exampleSegments(example, "あさごはんをたべます。");
  assert.deepEqual(segments, [
    { text: "朝", reading: "あさ" }, { text: "ご" }, { text: "飯", reading: "はん" },
    { text: "を" }, { text: "食", reading: "た" }, { text: "べます。" },
  ]);
  assertLossless(example, segments);
  assert.deepEqual(exampleSegments("図書館で日本語を勉強します。", "としょかんでにほんごをべんきょうします。"), [
    { text: "図書館", reading: "としょかん" }, { text: "で" },
    { text: "日本語", reading: "にほんご" }, { text: "を" },
    { text: "勉強", reading: "べんきょう" }, { text: "します。" },
  ]);
});

test("kana-only text and missing readings stay plain", () => {
  assert.deepEqual(exampleSegments("パンをたべます。", "ぱんをたべます。"), [{ text: "パンをたべます。" }]);
  assert.deepEqual(exampleSegments("ありがとう", "異なる値"), [{ text: "ありがとう" }]);
  for (const reading of [undefined, null, "", " \n\t"]) assert.deepEqual(exampleSegments("食べる", reading), [{ text: "食べる" }]);
  assert.deepEqual(exampleSegments("", "から"), []);
});

test("katakana, decomposed kana and half-width readings match without changing display strings", () => {
  assert.deepEqual(exampleSegments("パンを食べる。", "ぱんをたべる。"), [
    { text: "パンを" }, { text: "食", reading: "た" }, { text: "べる。" },
  ]);
  assert.deepEqual(exampleSegments("飯か\u3099好き", "はんがすき"), [
    { text: "飯", reading: "はん" }, { text: "か\u3099" }, { text: "好", reading: "す" }, { text: "き" },
  ]);
  assert.deepEqual(exampleSegments("学校へ行く。", "か\u3099っこうへいく。"), [
    { text: "学校", reading: "か\u3099っこう" }, { text: "へ" }, { text: "行", reading: "い" }, { text: "く。" },
  ]);
  assert.deepEqual(exampleSegments("学校ヘ行ク", "ｶﾞｯｺｳへｲく"), [
    { text: "学校", reading: "ｶﾞｯｺｳ" }, { text: "ヘ" }, { text: "行", reading: "ｲ" }, { text: "ク" },
  ]);
});

test("supplementary Han, variation selectors and iteration marks retain all code points", () => {
  const example = "𠮷野へ行く。";
  const segments = exampleSegments(example, "よしのへいく。");
  assert.deepEqual(segments, [
    { text: "𠮷野", reading: "よしの" }, { text: "へ" }, { text: "行", reading: "い" }, { text: "く。" },
  ]);
  assertLossless(example, segments);
  const variant = "葛\u{E0100}の葉";
  const variantSegments = exampleSegments(variant, "かずらのは");
  assert.deepEqual(variantSegments, [{ text: "葛\u{E0100}", reading: "かずら" }, { text: "の" }, { text: "葉", reading: "は" }]);
  assertLossless(variant, variantSegments);
  assert.deepEqual(exampleSegments("時々雨", "ときどきあめ"), [{ text: "時々雨", reading: "ときどきあめ" }]);
});

test("ambiguous repeated anchors and mismatches fall back to the complete supplied reading", () => {
  for (const [text, reading] of [
    ["木の葉", "きのこのは"], ["木の子の葉", "きのこのは"],
    ["朝ご飯", "あさはん"], ["学校へ行く。", "がっこうへいく!"],
    ["朝ご飯", "あさ、ごはん"], ["日本\n猫", "にほんねこ"],
    ["食べる", "べる"], ["猫", "cat"],
  ]) {
    const segments = exampleSegments(text, reading);
    assert.deepEqual(segments, [{ text, reading }]);
    assertLossless(text, segments);
  }
});

test("literal punctuation, whitespace, multiline content and HTML-like text remain literal", () => {
  const example = "東京 に行く。\n";
  const segments = exampleSegments(example, "とうきょう にいく。\n");
  assert.deepEqual(segments, [
    { text: "東京", reading: "とうきょう" }, { text: " に" }, { text: "行", reading: "い" }, { text: "く。\n" },
  ]);
  assertLossless(example, segments);
  assert.deepEqual(exampleSegments("日本\n猫", "にほん\nねこ"), [
    { text: "日本", reading: "にほん" }, { text: "\n" }, { text: "猫", reading: "ねこ" },
  ]);
  const htmlLike = "<script>食べる</script>";
  const literal = exampleSegments(htmlLike, "<script>たべる</script>");
  assert.deepEqual(literal, [{ text: "<script>" }, { text: "食", reading: "た" }, { text: "べる</script>" }]);
  assertLossless(htmlLike, literal);
});

test("long examples use a bounded search and preserve their complete fallback", { timeout: 3000 }, () => {
  const example = Array.from({ length: 1250 }, (_, index) => `漢あ${String(index).padStart(5, "0")}`).join("");
  const reading = Array.from({ length: 1250 }, (_, index) => `かんあ${String(index).padStart(5, "0")}`).join("");
  assert.equal(reading.length, 10000);
  assert.deepEqual(exampleSegments(example, reading), [{ text: example, reading }]);
  const repeated = "漢あ".repeat(5000), repeatedReading = "かんあ".repeat(5000);
  assert.deepEqual(exampleSegments(repeated, repeatedReading), [{ text: repeated, reading: repeatedReading }]);
  const kana = "あ".repeat(10000);
  assert.deepEqual(exampleSegments(kana, kana), [{ text: kana }]);
});
