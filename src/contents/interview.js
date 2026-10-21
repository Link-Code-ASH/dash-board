// Built-in questions for the Q&A review, used until (or instead of) Claude asking them.
// The order runs from first impressions to a closing line; each question is asked once per title.
const OPENING = [
  "다 보고 나서 가장 먼저 든 생각은 뭐였어요?",
  "처음에 이 작품을 보게 된 계기가 있었어요?",
];
const BY_TYPE = {
  webtoon: ["가장 기억에 남는 화나 컷이 있어요?", "그림체와 연출은 이야기와 잘 맞았나요?"],
  drama: ["가장 마음이 간 인물은 누구였어요? 왜요?", "몰아서 봤어요, 아니면 한 회씩 아껴 봤어요?"],
  movie: ["극장을 나오며(또는 화면을 끄며) 머리에 남은 장면은 뭐였어요?", "음악이나 영상미에서 기억나는 게 있어요?"],
  anime: ["작화나 연출에서 소름 돋은 순간이 있었어요?", "가장 좋아하게 된 캐릭터는 누구예요?"],
  novel: ["문장이나 대사 중에 남겨 두고 싶은 게 있어요?", "읽는 동안 머릿속에 그려진 장면 중 가장 선명한 건요?"],
  game: ["플레이하면서 가장 짜릿했던 순간은 언제였어요?", "가장 오래 붙잡고 있던 구간이나 보스가 있어요?"],
  etc: ["가장 기억에 남는 순간은 뭐였어요?", "비슷한 다른 작품이 떠올랐어요?"],
};
const LIKED = [
  "이 작품을 가장 좋아하게 만든 한 가지를 꼽는다면요?",
  "누군가에게 추천한다면 어떤 사람에게, 뭐라고 말할 거예요?",
];
const MIXED = [
  "좋았던 점과 아쉬웠던 점을 하나씩 꼽아 볼까요?",
  "어떤 부분이 조금만 달랐으면 별을 더 줬을 것 같아요?",
];
const DISLIKED = [
  "가장 아쉬웠던 부분은 뭐였어요?",
  "그래도 건질 만했던 점이 있었다면요?",
];
const CLOSING = [
  "다시 본다면 이번엔 무엇에 집중해서 볼 것 같아요?",
  "마지막으로, 이 작품을 한 문장으로 남긴다면?",
];

export function questionPlan(item) {
  const mood = item.rating >= 4 ? LIKED : item.rating > 0 && item.rating < 2.5 ? DISLIKED : MIXED;
  return [...OPENING, ...(BY_TYPE[item.type] || BY_TYPE.etc), ...mood, ...CLOSING];
}

// The next built-in question this title has not been asked yet, or null when the plan is finished.
export function nextQuestion(item) {
  const asked = new Set((item.dialogue || []).filter((entry) => entry.role !== "me").map((entry) => entry.text));
  return questionPlan(item).find((question) => !asked.has(question)) || null;
}

// True when the last question in the dialogue still waits for an answer.
export const awaitingAnswer = (dialogue = []) => dialogue.length > 0 && dialogue.at(-1).role !== "me";
