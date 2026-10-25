// Reads Japanese aloud with the device's own text-to-speech voices (free, no
// network). Kana readings are spoken when present so kanji are never misread.

const PREFERRED = /google|kyoko|otoya|nanami|keita|haruka|ayumi|ichiro|sayaka/i;

/** The text to speak for a word or its example: the kana reading when there is one. */
export function speechText(written = "", reading = "") {
  return String(reading || written || "").replace(/\s+/g, " ").trim();
}

/** The best Japanese voice among `voices`, or null to let the device pick one for ja-JP. */
export function pickJapaneseVoice(voices = []) {
  const japanese = voices.filter((voice) => /^ja([-_]|$)/i.test(voice.lang || ""));
  return japanese.find((voice) => PREFERRED.test(voice.name || "")) || japanese.find((voice) => voice.localService) || japanese[0] || null;
}

export function canSpeak(win = globalThis.window) {
  return Boolean(win?.speechSynthesis && win.SpeechSynthesisUtterance);
}

export function speakJapanese(text, win = globalThis.window) {
  if (!text || !canSpeak(win)) return false;
  const synth = win.speechSynthesis;
  synth.cancel();
  const utterance = new win.SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.9;
  const voice = pickJapaneseVoice(synth.getVoices());
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}
