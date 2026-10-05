import { accountClient } from "../accountSync.js";
import {
  assetIds,
  copy,
  DOCUMENT_VERSION,
  migrateLegacy,
  uid,
  validateWorkspace,
} from "./documentModel.js";

const DB = "hub-mindfold-v3";
const BUCKET = "mindfold-assets";
let database;
let pendingLocal = Promise.resolve();
function openDb() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => {
        for (const name of ["workspaces", "assets", "recovery"])
          request.result.createObjectStore(name, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return database;
}
async function store(name, action, mode = "readonly") {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    const request = action(transaction.objectStore(name));
    let result;
    if (request)
      request.onsuccess = () => {
        result = request.result;
      };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("로컬 저장에 실패했습니다."));
  });
}
export const ownerKey = (userId) => userId || "local";
export const readLocal = (userId) =>
  store("workspaces", (s) => s.get(ownerKey(userId)));
export const saveLocal = (userId, workspace) => {
  const snapshot = copy(workspace);
  const operation = pendingLocal
    .catch(() => {})
    .then(() =>
      store(
        "workspaces",
        (s) => s.put({ id: ownerKey(userId), workspace: snapshot }),
        "readwrite",
      ),
    );
  pendingLocal = operation;
  return operation;
};
export const preserve = (userId, value, reason) =>
  store(
    "recovery",
    (s) =>
      s.put({
        id: `${ownerKey(userId)}:${Date.now()}:${uid()}`,
        userId: ownerKey(userId),
        value: copy(value),
        reason,
        at: new Date().toISOString(),
      }),
    "readwrite",
  );
export const getAsset = (id) => store("assets", (s) => s.get(id));
export const putAsset = (record) =>
  store("assets", (s) => s.put(record), "readwrite");

export async function loadWorkspace(userId, legacy) {
  const local = await readLocal(userId);
  if (local) return validateWorkspace(local.workspace);
  await preserve(userId, legacy || {}, "before-v3-migration");
  const workspace = migrateLegacy(legacy);
  workspace.metadataRevision = 0;
  workspace.dirtyMetadata = true;
  workspace.pages.forEach((page) => {
    page.dirty = true;
  });
  await saveLocal(userId, workspace);
  return workspace;
}

export async function readCloud(userId, baseline = null) {
  const metadata = await accountClient
    .from("mindfold_workspaces")
    .select("metadata, revision")
    .eq("user_id", userId)
    .maybeSingle();
  if (metadata.error) throw metadata.error;
  if (!metadata.data) return null;
  if (metadata.data.metadata?.version !== DOCUMENT_VERSION)
    throw Object.assign(
      new Error(
        "새 버전의 Mindfold 문서입니다. 자동 업로드를 중지했습니다. 앱을 새로고침해 주세요.",
      ),
      { code: "MINDFOLD_READ_ONLY" },
    );
  const readPages = async (fields) => {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const result = await accountClient
        .from("mindfold_pages")
        .select(fields)
        .eq("user_id", userId)
        .order("page_id")
        .range(offset, offset + 499);
      if (result.error) throw result.error;
      rows.push(...result.data);
      if (result.data.length < 500) return rows;
    }
  };
  // Poll revision numbers first so unchanged documents are not downloaded again.
  if (baseline && baseline.metadataRevision === metadata.data.revision) {
    const revisions = await readPages("page_id, revision");
    const known = new Map(
      baseline.pages.map((page) => [page.id, page.revision]),
    );
    if (
      revisions.length === known.size &&
      revisions.every((row) => known.get(row.page_id) === row.revision)
    )
      return null;
  }
  const pages = await readPages("page_id, payload, revision, updated_at");
  try {
    return validateWorkspace({
      ...metadata.data.metadata,
      metadataRevision: metadata.data.revision,
      dirtyMetadata: false,
      pages: pages.map((row) => ({
        ...row.payload,
        id: row.page_id,
        revision: row.revision,
        dirty: false,
        cloudUpdatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    throw Object.assign(error, { code: "MINDFOLD_READ_ONLY" });
  }
}

async function writeRow(table, userId, key, value, revision, extra = {}) {
  let query;
  if (!revision)
    query = accountClient
      .from(table)
      .insert({ user_id: userId, [key]: value, revision: 1, ...extra });
  else
    query = accountClient
      .from(table)
      .update({ [key]: value, revision: revision + 1 })
      .eq("user_id", userId)
      .eq("revision", revision);
  if (extra.page_id && revision) query = query.eq("page_id", extra.page_id);
  const result = await query.select("revision").maybeSingle();
  if (result.error?.code === "23505" || (!result.error && !result.data))
    throw new Error("MINDFOLD_CONFLICT");
  if (result.error) throw result.error;
  return result.data.revision;
}
export async function saveCloudPage(userId, page) {
  const { revision, dirty, cloudUpdatedAt, localEditId, ...payload } = page;
  await uploadDocumentAssets(userId, { pages: [page] });
  return writeRow("mindfold_pages", userId, "payload", payload, revision, {
    page_id: page.id,
  });
}
export function saveCloudMetadata(userId, workspace) {
  const { pages, metadataRevision, dirtyMetadata, ...metadata } = workspace;
  return writeRow(
    "mindfold_workspaces",
    userId,
    "metadata",
    metadata,
    metadataRevision || 0,
  );
}

export async function addImage(userId, file) {
  const types = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!types.includes(file.type))
    throw new Error("PNG, JPEG, WebP, GIF 이미지를 선택해 주세요.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("이미지는 파일당 10MB까지 넣을 수 있습니다.");
  const id = uid();
  const record = {
    id,
    owner: ownerKey(userId),
    blob: file,
    name: file.name || "image",
    type: file.type,
    uploaded: false,
  };
  await putAsset(record);
  return record;
}
export async function uploadDocumentAssets(userId, workspace) {
  for (const id of assetIds(workspace)) {
    const record = await getAsset(id);
    if (!record || record.uploaded) continue;
    if (record.owner !== userId && record.owner !== "local")
      throw new Error("다른 계정의 이미지는 업로드할 수 없습니다.");
    const { error } = await accountClient.storage
      .from(BUCKET)
      .upload(`${userId}/${id}`, record.blob, {
        contentType: record.type,
        upsert: true,
      });
    if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
    await putAsset({ ...record, owner: userId, uploaded: true });
  }
}
export async function resolveAsset(userId, id) {
  const cached = await getAsset(id);
  if (cached && (cached.owner === ownerKey(userId) || cached.owner === "local"))
    return URL.createObjectURL(cached.blob);
  if (!userId) throw new Error("이미지를 찾을 수 없습니다.");
  const { data, error } = await accountClient.storage
    .from(BUCKET)
    .download(`${userId}/${id}`);
  if (error) throw error;
  await putAsset({
    id,
    owner: userId,
    blob: data,
    type: data.type,
    name: "image",
    uploaded: true,
  });
  return URL.createObjectURL(data);
}

export async function backupWorkspace(userId) {
  await pendingLocal;
  const record = await readLocal(userId);
  const workspace = record
    ? validateWorkspace(record.workspace)
    : userId
      ? await readCloud(userId)
      : null;
  if (!workspace) return null;
  const assets = [];
  for (const id of assetIds(workspace)) {
    let image = await getAsset(id);
    if (!image && userId) {
      const url = await resolveAsset(userId, id);
      URL.revokeObjectURL(url);
      image = await getAsset(id);
    }
    if (!image)
      throw new Error("이미지를 찾을 수 없어 완전한 백업을 만들지 못했습니다.");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(image.blob);
    });
    assets.push({ id, name: image.name, type: image.type, dataUrl });
  }
  return { workspace, assets };
}
export async function restoreWorkspace(userId, backup) {
  const workspace = validateWorkspace(backup.workspace);
  const previous = await readLocal(userId);
  if (previous) await preserve(userId, previous.workspace, "before-import");
  for (const asset of backup.assets || []) {
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(asset.dataUrl || ""))
      throw new Error("백업의 이미지 형식이 올바르지 않습니다.");
    const response = await fetch(asset.dataUrl);
    await putAsset({
      id: asset.id,
      owner: ownerKey(userId),
      blob: await response.blob(),
      name: asset.name,
      type: asset.type,
      uploaded: false,
    });
  }
  const cloud = userId ? await readCloud(userId) : null;
  workspace.metadataRevision = cloud?.metadataRevision || 0;
  workspace.dirtyMetadata = true;
  const incoming = new Set(workspace.pages.map((page) => page.id));
  workspace.pages.forEach((page) => {
    page.revision = cloud?.pages.find((p) => p.id === page.id)?.revision || 0;
    page.dirty = true;
  });
  for (const page of cloud?.pages || [])
    if (!incoming.has(page.id))
      workspace.pages.push({
        ...page,
        deletedAt: new Date().toISOString(),
        dirty: true,
      });
  await saveLocal(userId, workspace);
  window.dispatchEvent(
    new CustomEvent("mindfold:restored", { detail: ownerKey(userId) }),
  );
  return workspace;
}
