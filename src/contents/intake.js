// Reads an image out of a drop or a paste: a real file when the browser gives one (copied image, file from
// the desktop), otherwise the image address from the page it came from (dragging from Google Images).
const IMAGE_FILE = /^image\/(png|jpeg|webp|gif|avif|bmp)$/;
const LOOKS_LIKE_IMAGE = /^data:image\/|\.(png|jpe?g|webp|gif|avif)(\?|#|$)|encrypted-tbn\d*\.gstatic\.com|pstatic\.net|mzstatic\.com/i;

export function imageFromTransfer(transfer) {
  if (!transfer) return null;
  const file = [...(transfer.files || [])].find((entry) => IMAGE_FILE.test(entry.type));
  if (file) return { file };
  const read = (type) => { try { return transfer.getData(type) || ""; } catch { return ""; } };
  const html = read("text/html");
  // The <img> in dragged or copied page content is the picture itself, unlike links around it.
  const src = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&");
  if (src && /^(https?:|data:image\/)/.test(src)) return { url: src };
  const links = [read("text/uri-list"), read("text/plain")].join("\n").split(/\s+/).filter((line) => /^(https?:|data:image\/)/.test(line));
  const url = links.find((line) => LOOKS_LIKE_IMAGE.test(line));
  return url ? { url } : null;
}

// True while something being dragged could be an image (files, or a picture from another page).
export const mayHoldImage = (transfer) => [...(transfer?.types || [])].some((type) => ["Files", "text/uri-list", "text/html"].includes(type));

// Center-crop box that turns any picture into the 3:4 cover shape (small differences are left alone).
export function coverCrop(width, height, ratio = 3 / 4) {
  const current = width / height;
  if (Math.abs(current - ratio) / ratio < 0.04) return { x: 0, y: 0, width, height };
  return current > ratio
    ? { x: Math.round((width - height * ratio) / 2), y: 0, width: Math.round(height * ratio), height }
    : { x: 0, y: Math.round((height - width / ratio) / 2), width, height: Math.round(width / ratio) };
}
