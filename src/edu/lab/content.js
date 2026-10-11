import DOMPurify from "dompurify";

export function contentText(value) {
  return typeof value === "string" ? value : "";
}

// Records can be written outside the app, including by older clients. A damaged
// optional field must not stop the rest of the question from being displayed.
export function itemChoices(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((choice, index) => {
    if (typeof choice === "string") return [{ label: String(index + 1), text: choice }];
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) return [];
    const body = [choice.text, choice.body, choice.content].find((text) => typeof text === "string");
    if (body === undefined) return [];
    return [{ label: contentText(choice.label) || String(index + 1), text: body }];
  });
}

export function itemFigures(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((figure) => figure && typeof figure === "object" && typeof figure.svg === "string")
    .map((figure) => ({ svg: figure.svg, caption: contentText(figure.caption) }));
}

export function safeMarkdownUrl(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return "";
  if (/^(?:https?:\/\/|mailto:)/i.test(url)) return url;
  if (url.startsWith("//") || /^[^/?#]*:/.test(url)) return "";
  return url;
}

function scriptTag(node) {
  if (node.type !== "html") return null;
  const match = /^<(\/)?(sup|sub)>$/i.exec(node.value);
  return match ? { closing: Boolean(match[1]), tag: match[2].toLowerCase() } : null;
}

function scientificChildren(nodes) {
  const output = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const opening = scriptTag(node);
    if (!opening || opening.closing) { output.push(node); continue; }
    const stack = [opening.tag];
    let end = index + 1;
    for (; end < nodes.length; end += 1) {
      const tag = scriptTag(nodes[end]);
      if (!tag) continue;
      if (!tag.closing) stack.push(tag.tag);
      else if (tag.tag === stack.at(-1)) stack.pop();
      else break;
      if (stack.length === 0) break;
    }
    if (stack.length) { output.push(node); continue; }
    output.push({ type: "eduScript", data: { hName: opening.tag }, children: scientificChildren(nodes.slice(index + 1, end)) });
    index = end;
  }
  return output;
}

// Permit only attribute-free scientific superscript/subscript tags. Other HTML
// remains an HTML node and is discarded by ReactMarkdown's skipHtml setting.
export function remarkScientificTags() {
  return (tree) => {
    function visit(node) {
      if (!Array.isArray(node.children)) return;
      node.children.forEach(visit);
      node.children = scientificChildren(node.children);
    }
    visit(tree);
  };
}

const SVG_TAGS = new Set([
  "svg", "g", "defs", "marker", "clippath", "mask", "path", "rect", "circle", "ellipse",
  "line", "polyline", "polygon", "text", "tspan", "title", "desc",
]);
const SVG_ATTRS = new Set([
  "xmlns", "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "transform", "id", "fill", "stroke", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity",
  "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "dx", "dy", "rotate",
  "marker-start", "marker-mid", "marker-end", "markerwidth", "markerheight", "markerunits", "refx", "refy", "orient",
  "clip-path", "clippathunits", "mask", "maskunits", "maskcontentunits", "preserveaspectratio", "vector-effect",
]);
const SVG_REFERENCE_ATTRS = new Set(["marker-start", "marker-mid", "marker-end", "clip-path", "mask"]);

export function safeSvgAttribute(name, value) {
  const attribute = name.toLowerCase();
  if (!SVG_ATTRS.has(attribute)) return false;
  if (attribute === "xmlns") return value === "http://www.w3.org/2000/svg";
  const localReference = /^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/i.test(value);
  if (SVG_REFERENCE_ATTRS.has(attribute)) return value === "none" || localReference;
  if (attribute === "fill" || attribute === "stroke") {
    return localReference || /^(?:[a-z]+|#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+/-]+\))$/i.test(value);
  }
  // No styles, hrefs, embedded images, animations or external resource URLs.
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) && !/url\s*\(|(?:https?|data|javascript):|\\/i.test(value);
}

export function svgImageSource(value) {
  if (typeof value !== "string" || !value.trim() || !DOMPurify.isSupported) return "";
  try {
    const clean = DOMPurify.sanitize(value, {
      USE_PROFILES: { svg: true },
      FORBID_TAGS: ["script", "foreignObject", "style", "image", "use", "a", "animate", "animateMotion", "animateTransform", "set"],
      FORBID_ATTR: ["style", "href", "xlink:href"],
      RETURN_DOM: true,
    });
    const svg = clean.querySelector("svg");
    if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg") return "";
    for (const element of [svg, ...svg.querySelectorAll("*")]) {
      if (!SVG_TAGS.has(element.localName.toLowerCase())) { element.remove(); continue; }
      for (const attribute of [...element.attributes]) {
        if (!safeSvgAttribute(attribute.name, attribute.value)) element.removeAttribute(attribute.name);
      }
    }
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const serialized = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
  } catch {
    return "";
  }
}
