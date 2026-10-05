import React, { useEffect, useRef } from "react";
import { Picker } from "emoji-mart";
import data from "@emoji-mart/data";
import i18n from "@emoji-mart/data/i18n/ko.json";

export default function EmojiPicker({ onPick }) {
  const ref = useRef(null),
    callback = useRef(onPick);
  callback.current = onPick;
  useEffect(() => {
    const picker = new Picker({
      data,
      i18n,
      theme: "light",
      set: "native",
      previewPosition: "none",
      navPosition: "top",
      skinTonePosition: "none",
      perLine: 8,
      onEmojiSelect: (emoji) => callback.current(emoji.native),
    });
    ref.current.replaceChildren(picker);
    return () => picker.remove();
  }, []);
  return <div className="mf3-emoji-picker" ref={ref} />;
}
