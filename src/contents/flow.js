import { releasesOn, typeLabel } from "./model.js";

/** Shows each title's release date in Flow's two-week schedule. */
export function createContentsFlowSource({ getItems, subscribe }) {
  return {
    id: "contents",
    getItems(date) {
      return releasesOn(getItems(), date).map((item) => ({
        id: item.id,
        title: `${item.title} 출시`,
        displayTitle: item.title,
        kind: "release",
        sourceLabel: `Contents · ${typeLabel(item.type)}`,
        statusLabel: `${typeLabel(item.type)} 출시`,
      }));
    },
    subscribe,
    openTarget(id) {
      if (!getItems().some((item) => item.id === id && !item.deletedAt)) throw new Error("작품을 찾을 수 없습니다.");
      return { moduleId: "contents", section: `item:${id}` };
    },
  };
}
