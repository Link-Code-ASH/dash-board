import React, {
  lazy,
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Circle, X, Eraser } from "lucide-react";
import { symbolMap } from "./symbols.js";
import { useDashboardData } from "./context.jsx";

const SymbolPicker = lazy(() => import("./SymbolPicker.jsx"));

export default function ItemIconButton({ itemKey, label }) {
  const d = useDashboardData();
  const value = d.data.itemIcons?.[itemKey] || "";
  const symbol = d.data.itemSymbols?.[itemKey];
  const Icon = symbolMap[symbol?.name]?.Icon;
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const dialog = useRef(null);
  const titleId = useId();
  const open = position !== null;
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current.getBoundingClientRect();
      const panel = dialog.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      const x = viewport?.offsetLeft || 0;
      const y = viewport?.offsetTop || 0;
      const left = Math.max(x + 8, Math.min(anchor.left, x + width - panel.width - 8));
      const preferredTop = anchor.bottom + 6 + panel.height <= y + height - 8
        ? anchor.bottom + 6 : anchor.top - panel.height - 6;
      const top = Math.max(y + 8, Math.min(preferredTop, y + height - panel.height - 8));
      setPosition((current) => current && (current.left !== left || current.top !== top)
        ? { left, top } : current);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(dialog.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open]);
  const close = () => {
    setPosition(null);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!position) return;
    dialog.current?.querySelector("button")?.focus();
    const key = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
      if (event.key === "Tab") {
        const controls = [
          ...dialog.current.querySelectorAll("button, input, [tabindex='0']"),
        ].filter((el) => !el.disabled && el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [position]);
  const pick = (icon) => {
    d.updateItemSymbol(itemKey, icon);
    if (!icon) close();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="hub-item-icon"
        aria-label={`${label} 아이콘 변경`}
        title={`${label} 아이콘`}
        aria-haspopup="dialog"
        aria-expanded={!!position}
        onClick={() => {
          if (position) return close();
          setPosition({ left: 8, top: 8 });
        }}
      >
        {Icon ? (
          <Icon size={18} strokeWidth={1.8} style={{ color: symbol.color }} />
        ) : (
          value || <Circle size={17} strokeWidth={1.6} />
        )}
      </button>
      {position &&
        createPortal(
          <div
            className="hub-icon-backdrop"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <section
              ref={dialog}
              className="hub-icon-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              style={position}
            >
              <header>
                <strong id={titleId}>{label}</strong>
                <button
                  type="button"
                  aria-label="아이콘 선택창 닫기"
                  onClick={close}
                >
                  <X size={18} />
                </button>
              </header>
              <Suspense fallback={<p role="status">불러오는 중…</p>}>
                <SymbolPicker value={symbol} onChange={pick} />
              </Suspense>
              <button
                type="button"
                className="hub-icon-remove"
                disabled={!value && !symbol}
                onClick={() => pick(null)}
              >
                <Eraser size={16} />
                아이콘 제거
              </button>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
