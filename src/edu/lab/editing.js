export function noteValues(note) {
  return {
    title: note.title || "", body: note.body || "", kind: note.kind || "", scope: note.scope || "", source: note.source || "",
    tags: Array.isArray(note.tags) ? note.tags.join(", ") : "",
  };
}

// Only send fields the editor changed. In particular, opening a tags input must
// not reinterpret commas or whitespace already present in an external tag.
export function notePatch(base, draft) {
  const before = noteValues(base);
  const patch = Object.fromEntries(Object.entries(before).filter(([field, value]) => draft[field] !== value).map(([field]) => [field, draft[field]]));
  if (Object.hasOwn(patch, "tags")) patch.tags = patch.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  return patch;
}
