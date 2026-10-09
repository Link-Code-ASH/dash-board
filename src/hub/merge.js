const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const field = (value, key) => record(value) && own(value, key) ? value[key] : undefined;
const pointer = (path, key) => `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
const memoTextFields = ["leftText", "leftTextExtra", "centerText", "centerTextExtra", "rightText", "rightTextExtra"];

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (record(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, copy(item)]));
  }
  return value;
}

// Timestamps are not content edits, including in delete-versus-edit decisions.
function equal(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((item, index) => equal(item, right[index]));
  }
  if (!record(left) || !record(right)) return false;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => key === "updatedAt" || equal(field(left, key), field(right, key)));
}

function identityKey(arrays) {
  return ["planKey", "id", "key"].find((key) => arrays.every((items) => {
    const seen = new Set();
    return items.every((item) => {
      const id = field(item, key);
      if (!(typeof id === "string" && id.length > 0)
        && !(typeof id === "number" && Number.isFinite(id))) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }));
}

function sameOrder(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function reordered(base, branch) {
  const baseSet = new Set(base);
  const branchSet = new Set(branch);
  return !sameOrder(base.filter((id) => branchSet.has(id)), branch.filter((id) => baseSet.has(id)));
}

/** Merge acyclic JSON-like dashboard values; undefined means absent/deleted. */
export function mergeDashboard(base, local, remote) {
  const conflicts = [];
  const report = (path, kind, before, here, there) => {
    conflicts.push({ path, kind, base: copy(before), local: copy(here), remote: copy(there) });
  };

  function mergeArray(before, here, there, path, key) {
    const maps = [before, here, there].map((items) => new Map(items.map((item) => [item[key], item])));
    const [baseMap, localMap, remoteMap] = maps;
    const merged = new Map();
    for (const id of new Set(maps.flatMap((map) => [...map.keys()]))) {
      const value = merge(baseMap.get(id), localMap.get(id), remoteMap.get(id),
        pointer(path, `@${key}=${JSON.stringify(id)}`), path === "/memos/cards");
      if (value !== undefined) merged.set(id, value);
    }

    const [baseIds, localIds, remoteIds] = maps.map((map) => [...map.keys()].filter((id) => merged.has(id)));
    const localSet = new Set(localIds);
    const remoteSet = new Set(remoteIds);
    const sharedAddition = localIds.some((id) => !baseMap.has(id) && remoteSet.has(id));
    const localChanged = reordered(baseIds, localIds) || sharedAddition;
    const remoteChanged = reordered(baseIds, remoteIds) || sharedAddition;
    if (localChanged && remoteChanged
      && !sameOrder(localIds.filter((id) => remoteSet.has(id)), remoteIds.filter((id) => localSet.has(id)))) {
      report(path, "order", before.map((item) => item[key]), here.map((item) => item[key]), there.map((item) => item[key]));
    }

    const [primary, secondary] = !localChanged && remoteChanged
      ? [remoteIds, localIds] : [localIds, remoteIds];
    const order = [...primary];
    // Preserve the chosen side's order. Place other-side additions by its nearest
    // preceding surviving anchor, or its following anchor when none precedes it.
    for (let index = 0; index < secondary.length; index += 1) {
      const id = secondary[index];
      if (order.includes(id)) continue;
      const preceding = secondary.slice(0, index).reverse().find((anchor) => order.includes(anchor));
      const following = secondary.slice(index + 1).find((anchor) => order.includes(anchor));
      const position = preceding !== undefined ? order.indexOf(preceding) + 1
        : following !== undefined ? order.indexOf(following) : order.length;
      order.splice(position, 0, id);
    }
    return order.map((id) => merged.get(id));
  }

  function mergeMemoCard(before, here, there, path) {
    const stripPairs = (card) => card === undefined ? undefined : Object.fromEntries(
      Object.entries(card).filter(([key]) => !memoTextFields.includes(key)).map(([key, value]) => [key,
        key === "textFormats" && record(value)
          ? Object.fromEntries(Object.entries(value).filter(([name]) => !memoTextFields.includes(name))) : value,
      ]),
    );
    const result = merge(stripPairs(before), stripPairs(here), stripPairs(there), path);
    for (const name of memoTextFields) {
      const pair = (card) => ({ text: field(card, name), marks: field(field(card, "textFormats"), name) });
      const [b, l, r] = [before, here, there].map(pair);
      let selected = l;
      if (equal(l, b)) selected = r;
      else if (!equal(l, r) && !equal(r, b)) {
        report(pointer(path, name), "value", b, l, r);
        conflicts[conflicts.length - 1].relatedPaths = [pointer(pointer(path, "textFormats"), name)];
      }
      if (selected.text !== undefined) result[name] = copy(selected.text);
      if (selected.marks !== undefined) {
        result.textFormats = { ...result.textFormats, [name]: copy(selected.marks) };
      }
    }
    return result;
  }

  function merge(before, here, there, path, memoCard = false) {
    if (record(here) && record(there) && (record(before) || before === undefined)) {
      // Mark offsets belong to their text, not to independently mergeable fields.
      if (memoCard && [before, here, there].every((card) =>
        field(card, "textFormats") === undefined || record(field(card, "textFormats")))) {
        return mergeMemoCard(before, here, there, path);
      }
      const result = [];
      const keys = new Set([...Object.keys(before || {}), ...Object.keys(here), ...Object.keys(there)]);
      for (const key of keys) {
        const b = field(before, key);
        const l = field(here, key);
        const r = field(there, key);
        const value = key === "updatedAt"
          ? copy(equal(l, b) ? r : l)
          : merge(b, l, r, pointer(path, key));
        if (value !== undefined) result.push([key, value]);
      }
      return Object.fromEntries(result);
    }
    if (Array.isArray(here) && Array.isArray(there) && (Array.isArray(before) || before === undefined)) {
      const key = identityKey([before || [], here, there]);
      if (key) return mergeArray(before || [], here, there, path, key);
    }
    if (equal(here, there)) return copy(here);
    if (equal(here, before)) return copy(there);
    if (equal(there, before)) return copy(here);
    report(path, here === undefined || there === undefined ? "delete-edit" : "value", before, here, there);
    return copy(here);
  }

  return { data: merge(base, local, remote, ""), conflicts };
}
