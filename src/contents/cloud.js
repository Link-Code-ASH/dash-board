import { accountClient } from "../accountSync.js";
import { getCover, putCover } from "./storage.js";

const BUCKET = "contents-covers";
const timeout = () => AbortSignal.timeout(20000);

// Covers are uploaded before the row that points at them, so other devices never see a missing image.
async function uploadCover(userId, id) {
  const record = await getCover(id);
  if (!record || record.uploaded) return;
  if (record.owner !== userId && record.owner !== "local") throw new Error("다른 계정의 표지는 업로드할 수 없습니다.");
  const { error } = await accountClient.storage.from(BUCKET)
    .upload(`${userId}/${id}`, record.blob, { contentType: record.type, upsert: true });
  if (error) throw new Error(`표지 업로드 실패: ${error.message}`);
  await putCover({ ...record, owner: userId, uploaded: true });
}

export function cloudAdapter(userId) {
  return {
    async read() {
      const rows = [];
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await accountClient.from("contents_items")
          .select("item_id,payload,revision").eq("user_id", userId).order("item_id")
          .range(offset, offset + 199).abortSignal(timeout());
        if (error) throw error;
        rows.push(...data);
        if (data.length < 200) return rows;
      }
    },
    async write(item, revision) {
      if (item.cover) await uploadCover(userId, item.cover);
      const value = { payload: item, revision: revision + 1 };
      const query = revision
        ? accountClient.from("contents_items").update(value).eq("user_id", userId).eq("item_id", item.id).eq("revision", revision)
        : accountClient.from("contents_items").insert({ ...value, user_id: userId, item_id: item.id });
      const { data, error } = await query.select("revision").maybeSingle().abortSignal(timeout());
      if (error?.code === "23505" || (!error && !data)) throw Object.assign(new Error("다른 기기의 변경을 다시 확인합니다."), { code: "CONTENTS_CONFLICT" });
      if (error) throw error;
      return data.revision;
    },
  };
}

export async function saveCover(userId, blob) {
  const id = `${crypto.randomUUID()}.webp`;
  await putCover({ id, owner: userId || "local", blob, type: blob.type, uploaded: false });
  return id;
}

const urls = new Map();
export async function coverUrl(userId, id) {
  if (urls.has(id)) return urls.get(id);
  let record = await getCover(id);
  if (!record) {
    if (!userId) throw new Error("표지를 찾을 수 없습니다.");
    const { data, error } = await accountClient.storage.from(BUCKET).download(`${userId}/${id}`);
    if (error) throw error;
    record = { id, owner: userId, blob: data, type: data.type, uploaded: true };
    await putCover(record);
  }
  const url = URL.createObjectURL(record.blob);
  urls.set(id, url);
  return url;
}

// Shrinks any picked or pasted image to a light WebP so covers stay small in Storage.
export async function prepareCover(file, maxHeight = 900) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("PNG, JPG, WEBP, GIF 이미지만 사용할 수 있습니다.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxHeight / bitmap.height, 640 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("이미지를 변환하지 못했습니다.");
  return blob;
}
