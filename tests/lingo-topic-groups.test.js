import test from "node:test";
import assert from "node:assert/strict";
import { TOPIC_GROUPS, topicGroup, wordTopicGroups } from "../src/lingo/topicGroups.js";
import { collectWordEntries, filterWordEntries } from "../src/lingo/filter.js";

test("fine 특성 tags fold into a few shared groups; stored tags are untouched", () => {
  assert.ok(TOPIC_GROUPS.length <= 20);
  const tags = TOPIC_GROUPS.flatMap(([, list]) => list.split(" "));
  assert.equal(new Set(tags).size, tags.length, "each tag belongs to one group");
  assert.equal(topicGroup("초밥"), "음식·요리");
  assert.equal(topicGroup("청소"), "집·생활");
  assert.equal(topicGroup("새로운태그"), "새로운태그");
  const word = { topics: ["음식", "외식", "인사"] };
  assert.deepEqual(wordTopicGroups(word), ["음식·요리", "말·소통"]);
  assert.deepEqual(word.topics, ["음식", "외식", "인사"]);
});

test("filtering by a group finds every word with any tag in it", () => {
  const deck = { id: "pool", name: "전체 단어", words: [
    { id: "a", japanese: "寿司", meaning: "초밥", stage: 1, partsOfSpeech: ["명사"], jlpt: "N4", topics: ["초밥"] },
    { id: "b", japanese: "掃除", meaning: "청소", stage: 1, partsOfSpeech: ["する동사"], jlpt: "N4", topics: ["청소"] },
    { id: "c", japanese: "外食", meaning: "외식", stage: 1, partsOfSpeech: ["명사"], jlpt: "N3", topics: ["외식"] },
  ] };
  const found = filterWordEntries(collectWordEntries([deck]), { topics: ["음식·요리"] }).map(({ word }) => word.id);
  assert.deepEqual(found, ["a", "c"]);
  const n4food = filterWordEntries(collectWordEntries([deck]), { jlpt: ["N4"], topics: ["음식·요리"] }).map(({ word }) => word.id);
  assert.deepEqual(n4food, ["a"]);
});
