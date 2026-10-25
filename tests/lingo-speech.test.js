import test from "node:test";
import assert from "node:assert/strict";
import { pickJapaneseVoice, speechText, speakJapanese, canSpeak } from "../src/lingo/speech.js";

test("kana reading is spoken instead of the kanji when present", () => {
  assert.equal(speechText("寿司", "すし"), "すし");
  assert.equal(speechText("すし", ""), "すし");
  assert.equal(speechText("", ""), "");
});

test("a Japanese voice is chosen, preferring good named voices", () => {
  const voices = [{ name: "Samantha", lang: "en-US" }, { name: "Other", lang: "ja-JP" }, { name: "Google 日本語", lang: "ja-JP" }];
  assert.equal(pickJapaneseVoice(voices).name, "Google 日本語");
  assert.equal(pickJapaneseVoice([{ name: "X", lang: "ja_JP" }]).name, "X");
  assert.equal(pickJapaneseVoice([{ name: "Samantha", lang: "en-US" }]), null);
});

test("speaking cancels the previous utterance and asks for Japanese", () => {
  const calls = [];
  class SpeechSynthesisUtterance { constructor(text) { this.text = text; } }
  const win = { SpeechSynthesisUtterance, speechSynthesis: { cancel: () => calls.push("cancel"), getVoices: () => [], speak: (u) => calls.push(u) } };
  assert.equal(speakJapanese("すし", win), true);
  assert.equal(calls[0], "cancel");
  assert.equal(calls[1].lang, "ja-JP");
  assert.equal(calls[1].text, "すし");
  assert.equal(canSpeak({}), false);
  assert.equal(speakJapanese("すし", {}), false);
});
