import { normalizeWeeklyGroups } from "../dashboard/model.js";

// Each group colour: ink for the dot and title, tint for the category cells.
export const weeklyGroupPalette = {
  blue: { label: "파랑", ink: "#3e6fb8", tint: "#eef3fb" },
  green: { label: "초록", ink: "#2f8a57", tint: "#eaf5ee" },
  orange: { label: "주황", ink: "#c46a1f", tint: "#fbf0e6" },
  purple: { label: "보라", ink: "#7550b8", tint: "#f2eefa" },
  rose: { label: "분홍", ink: "#c24a6a", tint: "#fbecf0" },
  teal: { label: "청록", ink: "#23838a", tint: "#e7f4f5" },
  amber: { label: "노랑", ink: "#a77c0e", tint: "#faf3df" },
  slate: { label: "회색", ink: "#5b6778", tint: "#eef0f3" },
};

export const groupStyle = (group) => {
  const color = weeklyGroupPalette[group?.color];
  return color ? { "--wk-group-ink": color.ink, "--wk-group-tint": color.tint } : undefined;
};

// Categories in the order they are shown: group by group (in group order),
// then the ungrouped ones. Inside a group the stored order is kept.
export function groupWeeklyCategories(categories, weeklyGroups) {
  const { groups, members } = normalizeWeeklyGroups(weeklyGroups);
  const known = new Set(groups.map((group) => group.key));
  const groupOf = (category) => known.has(members[category.key]) ? members[category.key] : "";
  const sections = groups.map((group) => ({ group, rows: categories.filter((category) => groupOf(category) === group.key) }));
  const loose = categories.filter((category) => !groupOf(category));
  if (loose.length || groups.length) sections.push({ group: null, rows: loose });
  return { groups, sections, groupOf };
}
