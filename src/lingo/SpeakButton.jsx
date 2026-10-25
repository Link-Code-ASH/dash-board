import React from "react";
import { Volume2 } from "lucide-react";
import { canSpeak, speakJapanese } from "./speech.js";

/** Speaker button that reads `text` aloud in Japanese; hidden where the device cannot speak. */
export default function SpeakButton({ text, label, className = "", size = 16, children }) {
  if (!text || !canSpeak()) return null;
  return <button type="button" className={`lingo-speak ${className}`.trim()} aria-label={label} title={label}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); speakJapanese(text); }}><Volume2 size={size} />{children}</button>;
}
