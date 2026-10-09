import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MemoEditor, { MemoFormatToolbar } from "../MemoEditor.jsx";
import {
  SYNC_PIN_KEY,
  SYNC_REMEMBER_KEY,
  h,
  weekDays,
  monthNames,
  getOrderedMonthIndexes,
  calendarDutyOptions,
  scoreNumber,
  normalizeDateMarkers,
  getMindfoldEditableSelection,
  setMindfoldEditableSelection,
  latestAccountDraftKey,
  toDateKey,
  formatDayLabel,
  formatDateControlLabel,
  formatScore,
  addDays,
  formatDDay,
  getWeekStart,
  formatCompactDate,
  getWeeklyPlanItems,
  encodeWeeklyPlanItems,
  getWeeklyPlanEntry,
  getWeekdayKey,
  panelClickIsInteractive,
  CollapsiblePanel,
} from "./model.js";

export function MobileDashboardView({ activeSection, onChangeSection, selectedDate, shiftDate, views }) {
  const screenRef = useRef(null);
  const tabSwipeRef = useRef(null);
  const sections = [
    { id: "schedule", label: "Schedule" },
    { id: "routine", label: "Routine" },
    { id: "memo", label: "Memo" },
    { id: "calendar", label: "Calendar" },
  ];
  useEffect(() => {
    if (screenRef.current) screenRef.current.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0 });
  }, [activeSection]);
  const finishTabSwipe = (clientX, clientY) => {
    const start = tabSwipeRef.current;
    tabSwipeRef.current = null;
    if (!start) return;
    const deltaX = clientX - start.x;
    const deltaY = clientY - start.y;
    if (Math.abs(deltaX) < 58 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    const currentIndex = Math.max(0, sections.findIndex((section) => section.id === activeSection));
    const nextIndex = Math.max(0, Math.min(sections.length - 1, currentIndex + (deltaX < 0 ? 1 : -1)));
    if (nextIndex !== currentIndex) onChangeSection(sections[nextIndex].id);
  };
  return h(
    "section",
    { className: `mobile-dashboard-view section-${activeSection}`, "aria-label": "모바일 대시보드" },
    activeSection !== "memo" && h(
      "header",
      { className: "mobile-dashboard-header" },
      h("button", { type: "button", "aria-label": "이전 날짜", onClick: () => shiftDate(-1) }, "‹"),
      h("strong", null, formatDayLabel(selectedDate)),
      h("button", { type: "button", "aria-label": "다음 날짜", onClick: () => shiftDate(1) }, "›"),
    ),
    h(
      "div",
      {
        className: `mobile-dashboard-screen section-${activeSection}`,
        ref: screenRef,
        onPointerCancel: () => { tabSwipeRef.current = null; },
        onPointerDown: (event) => {
          if (event.target.closest("input, textarea, button")) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          tabSwipeRef.current = { x: event.clientX, y: event.clientY };
        },
        onPointerUp: (event) => finishTabSwipe(event.clientX, event.clientY),
      },
      ...(views[activeSection] || views.schedule),
    ),
    h(
      "nav",
      { className: "mobile-dashboard-nav", "aria-label": "모바일 대시보드 메뉴" },
      sections.map((section) => h(
        "button",
        {
          className: activeSection === section.id ? "active" : "",
          type: "button",
          key: section.id,
          "aria-current": activeSection === section.id ? "page" : undefined,
          onClick: () => onChangeSection(section.id),
        },
        section.label,
      )),
    ),
  );
}

export function MobileSevenDaySchedule({ calendar, calendarDuties, selectedDate }) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index));
  return h(
    "section",
    { className: "mobile-glass-card mobile-seven-day-schedule", "aria-label": "Seven day schedule" },
    h(
      "header",
      { className: "mobile-card-heading" },
      h("div", null, h("span", null, "NEXT 7 DAYS"), h("strong", null, "주간 일정")),
      h("small", null, `${formatCompactDate(dates[0]).month}.${formatCompactDate(dates[0]).day} - ${formatCompactDate(dates[6]).month}.${formatCompactDate(dates[6]).day}`),
    ),
    h(
      "div",
      { className: "mobile-seven-day-list" },
      dates.map((dateKey, index) => {
        const date = new Date(`${dateKey}T00:00:00`);
        const compact = formatCompactDate(dateKey);
        const duties = calendarDutyOptions.filter((option) => calendarDuties?.[dateKey]?.[option.key]);
        const lines = String(calendar[dateKey] || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
        return h(
          "article",
          { className: index === 0 ? "today" : "", key: dateKey },
          h(
            "div",
            { className: "mobile-seven-day-date" },
            h("strong", null, index === 0 ? "TODAY" : weekDays[(date.getDay() + 6) % 7].label),
            h("span", null, `${compact.month}.${compact.day}`),
          ),
          h(
            "div",
            { className: `mobile-seven-day-items ${duties.length || lines.length ? "" : "empty"}` },
            duties.length
              ? h("div", { className: "mobile-duty-group" }, duties.map((option) => h("b", { key: option.key }, option.label)))
              : null,
            lines.length ? lines.map((line, lineIndex) => h("span", { key: `${dateKey}-${lineIndex}` }, line)) : duties.length ? null : h("i", null, "No schedule"),
          ),
        );
      }),
    ),
  );
}

export function MobileScorePanel({ carryPenaltyMarked, entryCount, onAdjustCarry, onResetCarry, onToggleAttempt, onToggleCarryPenalty, routineTried, scoreInfo }) {
  const totalClass = scoreInfo.total < 0 ? "negative" : scoreInfo.total > 0 ? "positive" : "neutral";
  return h(
    "section",
    { className: "mobile-glass-card mobile-score-card", "aria-label": "Score summary" },
    h(
      "header",
      { className: "mobile-card-heading" },
      h("div", null, h("span", null, "TOTAL SCORE"), h("strong", null, "오늘의 점수")),
      h(
        "div",
        { className: "mobile-carry-controls", "aria-label": "Carry controls" },
        h("button", { type: "button", "aria-label": "Decrease Carry", onClick: () => onAdjustCarry(-1) }, "−"),
        h("button", { type: "button", "aria-label": "Reset Carry", onClick: onResetCarry }, "R"),
        h("button", { type: "button", "aria-label": "Increase Carry", onClick: () => onAdjustCarry(1) }, "+"),
      ),
    ),
    h(
      "div",
      { className: "mobile-score-main" },
      h("strong", { className: `mobile-score-total ${totalClass}` }, formatScore(scoreInfo.total)),
      h(
        "div",
        { className: "mobile-score-checks icon-only" },
        h(
          "button",
          { className: `mobile-score-check good ${routineTried ? "active" : ""}`, type: "button", "aria-label": "Tried today", "aria-pressed": String(routineTried), onClick: onToggleAttempt },
          h("span", { "aria-hidden": "true" }, routineTried ? "✓" : ""),
        ),
        h(
          "button",
          { className: `mobile-score-check bad ${carryPenaltyMarked ? "active" : ""}`, type: "button", "aria-label": "Add -2 Carry", "aria-pressed": String(carryPenaltyMarked), onClick: onToggleCarryPenalty },
          h("span", { "aria-hidden": "true" }, carryPenaltyMarked ? "✓" : ""),
        ),
      ),
    ),
    h(
      "div",
      { className: "mobile-score-metrics" },
      [["Carry", scoreInfo.carry], ["Plus", scoreInfo.plus], ["Minus", scoreInfo.minus], ["Records", entryCount]].map(([label, value]) =>
        h("div", { key: label }, h("span", null, label), h("strong", null, label === "Records" ? value : formatScore(value))),
      ),
    ),
  );
}

export function MobileCalendarPanel({ calendar, calendarDuties, selectedDate, setSelectedDate, toggleCalendarDuty, updateCalendarNote }) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const year = selected.getFullYear();
  const monthIndex = selected.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayIndex = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstDayIndex }, (_, index) => ({ key: `blank-${index}`, blank: true })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ key: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`, day: index + 1 })),
  ];
  while (cells.length % 7) cells.push({ key: `blank-end-${cells.length}`, blank: true });
  const changeMonth = (offset) => {
    const next = new Date(year, monthIndex + offset, 1);
    setSelectedDate(toDateKey(next));
  };
  const selectedDuties = calendarDuties?.[selectedDate] || {};
  return h(
    "section",
    { className: "mobile-glass-card mobile-calendar-card", "aria-label": "Mobile calendar" },
    h(
      "header",
      { className: "mobile-calendar-heading" },
      h("button", { type: "button", "aria-label": "Previous month", onClick: () => changeMonth(-1) }, "‹"),
      h("div", null, h("strong", null, `${year}. ${String(monthIndex + 1).padStart(2, "0")}`), h("span", null, monthNames[monthIndex])),
      h("button", { type: "button", "aria-label": "Next month", onClick: () => changeMonth(1) }, "›"),
    ),
    h("div", { className: "mobile-calendar-weekdays" }, weekDays.map((day) => h("span", { key: day.key }, day.label.slice(0, 1)))),
    h(
      "div",
      { className: "mobile-calendar-grid" },
      cells.map((cell) => {
        if (cell.blank) return h("span", { className: "blank", key: cell.key, "aria-hidden": "true" });
        const hasNote = Boolean(calendar[cell.key]?.trim());
        const hasDuty = Object.values(calendarDuties?.[cell.key] || {}).some(Boolean);
        return h(
          "button",
          { className: `${cell.key === selectedDate ? "selected" : ""} ${hasNote || hasDuty ? "has-entry" : ""}`, type: "button", key: cell.key, onClick: () => setSelectedDate(cell.key) },
          h("b", null, cell.day),
          h("i", { "aria-hidden": "true" }),
        );
      }),
    ),
    h(
      "div",
      { className: "mobile-calendar-editor" },
      h("div", { className: "mobile-calendar-editor-heading" }, h("strong", null, formatDayLabel(selectedDate)), h("span", null, "일정 편집")),
      h(
        "div",
        { className: "mobile-duty-buttons" },
        calendarDutyOptions.map((option) => h(
          "button",
          { className: selectedDuties[option.key] ? "active" : "", type: "button", key: option.key, "aria-pressed": String(Boolean(selectedDuties[option.key])), onClick: () => toggleCalendarDuty(selectedDate, option.key) },
          h("span", { "aria-hidden": "true" }, selectedDuties[option.key] ? "✓" : ""),
          option.label,
        )),
      ),
      h("textarea", { maxLength: 600, placeholder: "이 날짜의 일정을 입력하세요", value: calendar[selectedDate] || "", onChange: (event) => updateCalendarNote(selectedDate, event.target.value) }),
    ),
  );
}

export function MobileMemoPanel({ activeMemoId, addMemoCard, cards, removeMemoCard, setActiveMemo, updateMemoCard }) {
  const activeIndex = Math.max(0, cards.findIndex((card) => card.id === activeMemoId));
  const activeCard = cards[activeIndex] || cards[0];
  const touchStartRef = useRef(null);
  if (!activeCard) return null;
  const memoAreas = [
    ["left", "leftTitle", "leftText"],
    ["center", "centerTitle", "centerText"],
    ["right", "rightTitle", "rightText"],
    ["left-extra", "leftExtraTitle", "leftTextExtra"],
    ["center-extra", "centerExtraTitle", "centerTextExtra"],
    ["right-extra", "rightExtraTitle", "rightTextExtra"],
  ];
  const goTo = (offset) => {
    const nextIndex = (activeIndex + offset + cards.length) % cards.length;
    setActiveMemo(cards[nextIndex].id);
  };
  return h(
    "section",
    { className: "mobile-glass-card mobile-memo-card", "aria-label": "Memo" },
    h(
      "header",
      {
        className: "mobile-memo-heading",
        onPointerDown: (event) => event.stopPropagation(),
        onPointerUp: (event) => event.stopPropagation(),
        onTouchStart: (event) => {
          event.stopPropagation();
          touchStartRef.current = event.touches?.[0]?.clientX ?? null;
        },
        onTouchEnd: (event) => {
          event.stopPropagation();
          if (touchStartRef.current == null) return;
          const endX = event.changedTouches?.[0]?.clientX ?? touchStartRef.current;
          const delta = endX - touchStartRef.current;
          if (Math.abs(delta) > 48) goTo(delta > 0 ? -1 : 1);
          touchStartRef.current = null;
        },
      },
      h("button", { type: "button", "aria-label": "Previous memo", onClick: () => goTo(-1) }, "‹"),
      h("div", null, h("span", null, `${activeIndex + 1} / ${cards.length}`), h("input", { type: "text", maxLength: 32, "aria-label": "Memo title", value: activeCard.title, onChange: (event) => updateMemoCard(activeCard.id, "title", event.target.value) })),
      h("button", { type: "button", "aria-label": "Next memo", onClick: () => goTo(1) }, "›"),
    ),
    h(
      "div",
      { className: "mobile-memo-toolbar" },
      h("button", { type: "button", onClick: addMemoCard }, "+ Memo"),
      h("button", { className: "danger", type: "button", disabled: cards.length <= 1, title: "Delete memo", "aria-label": "Delete memo", onClick: () => removeMemoCard(activeCard.id) }, "\u00d7"),
      h(MemoFormatToolbar),
    ),
    h(
      "div",
      { className: "mobile-memo-areas" },
      memoAreas.map(([key, titleField, field], index) => h(
        "div",
        { className: "mobile-memo-area", key },
        h("span", { className: "mobile-memo-number" }, String(index + 1).padStart(2, "0")),
        h(MemoArea, { cardId: activeCard.id, field, marks: activeCard.textFormats?.[field], titleField, titleValue: activeCard[titleField] || "", updateMemoCard, value: activeCard[field] || "" }),
      )),
    ),
    h("div", { className: "mobile-memo-dots", "aria-label": "Memo cards" }, cards.map((card, index) => h("button", { className: index === activeIndex ? "active" : "", type: "button", key: card.id, "aria-label": `Memo ${index + 1}`, onClick: () => setActiveMemo(card.id) }))),
  );
}

export function HubBar({ activeView, onToggleVault, setActiveView }) {
  const hubItems = [
    { key: "dashboard", label: "Dashboard", target: "dashboard", active: activeView === "dashboard" },
    { key: "mindfold", label: "Mindfold", target: "mindfold", active: activeView === "mindfold" },
  ];
  return h(
    "div",
    { className: "hub-dock" },
    h(
      "header",
      { className: "hub-bar", "aria-label": "Hub navigation" },
      h(
        "div",
        { className: "hub-brand" },
        h("img", { className: "hub-brand-logo", src: "./app-logo-transparent.png", alt: "" }),
        h("span", null, "Hub"),
      ),
      h(
        "div",
        { className: "hub-actions" },
        h(
          "nav",
          { className: "hub-nav", "aria-label": "Hub sections" },
          hubItems.map((item) =>
            h(
              "button",
              {
                className: `hub-nav-button ${item.active ? "active" : ""}`,
                key: item.key,
                type: "button",
                "aria-current": item.active ? "page" : undefined,
                onClick: () => setActiveView(item.target),
              },
              item.label,
            ),
          ),
        ),
      ),
    ),
    h(
      "button",
      {
        className: `hub-vault-button hub-vault-corner ${activeView === "vault" ? "active" : ""}`,
        type: "button",
        title: "Vault",
        "aria-label": "Vault",
        "aria-current": activeView === "vault" ? "page" : undefined,
        onClick: onToggleVault,
      },
      "\u2699",
    ),
  );
}

export function Topbar({ selectedDate, settingsPanels, setSelectedDate, shiftDate }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const viewLabel = "DASH BOARD";
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeSettings = (event) => {
      if (settingsRef.current?.contains(event.target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("click", closeSettings);
    return () => document.removeEventListener("click", closeSettings);
  }, [settingsOpen]);
  return h(
    "section",
    { className: "topbar", "aria-label": "Date selector", "data-view-label": viewLabel },
    h("div", null, h("p", { className: "eyebrow" }, viewLabel), h("h1", null, formatDayLabel(selectedDate))),
    h(
      "div",
      { className: "topbar-controls" },
      h(
        "div",
        { className: "settings-menu", ref: settingsRef },
        h(
          "button",
          {
            className: "settings-button",
            type: "button",
            title: "Settings",
            "aria-label": "Settings",
            "aria-expanded": settingsOpen,
            onClick: (event) => {
              event.stopPropagation();
              setSettingsOpen((current) => !current);
            },
          },
          "⚙",
        ),
        settingsOpen
          ? h(
              "div",
              { className: "settings-popover", onClick: (event) => event.stopPropagation() },
              settingsPanels,
            )
          : null,
      ),
      h(
        "div",
        { className: "day-switcher" },
        h("button", { className: "icon-button", type: "button", title: "Previous day", "aria-label": "Previous day", onClick: () => shiftDate(-1) }, "\u2039"),
        h(
          "div",
          { className: "date-control" },
          h("span", { className: "date-control-label", "aria-hidden": "true" }, formatDateControlLabel(selectedDate)),
          h("input", { type: "date", value: selectedDate, "aria-label": "Record date", onChange: (event) => setSelectedDate(event.target.value || toDateKey(new Date())) }),
        ),
        h("button", { className: "icon-button", type: "button", title: "Next day", "aria-label": "Next day", onClick: () => shiftDate(1) }, "\u203a"),
      ),
    ),
  );
}

export function VaultView({ settingsPanels }) {
  return h(
    "section",
    { className: "vault-view", "aria-label": "Vault" },
    h(
      "div",
      { className: "vault-heading" },
      h("div", null, h("p", { className: "eyebrow" }, "SETTINGS"), h("h1", null, "설정")),
      h("p", null, "화면 보기, 기기 동기화, 백업과 복원을 한곳에서 관리합니다."),
    ),
    h("div", { className: "vault-grid" }, settingsPanels),
  );
}

export function DisplayModePanel({ displayMode, effectiveMode, isOpen, onChange, onToggle }) {
  const options = [
    { id: "auto", label: "자동", description: "기기 화면 크기에 맞춤" },
    { id: "desktop", label: "데스크탑 보기", description: "넓은 화면 구성 사용" },
    { id: "mobile", label: "모바일 보기", description: "휴대폰 화면 구성 사용" },
  ];
  const effectiveLabel = effectiveMode === "mobile" ? "모바일" : "데스크탑";
  return h(CollapsiblePanel, {
    className: "display-panel",
    controls: "displayBody",
    description: "기기에 맞는 화면 구성을 선택합니다.",
    isOpen,
    onToggle,
    title: "화면 보기",
    children: {
      actions: h("span", { className: "vault-panel-toggle", "aria-hidden": "true" }, isOpen ? "−" : "+"),
      body: h(
        "div",
        { className: "display-mode-body", id: "displayBody" },
        h(
          "div",
          { className: "display-mode-options", role: "group", "aria-label": "화면 표시 방식" },
          ...options.map((option) => h(
            "button",
            {
              className: `display-mode-option ${displayMode === option.id ? "active" : ""}`,
              type: "button",
              key: option.id,
              "aria-pressed": displayMode === option.id,
              onClick: () => onChange(option.id),
            },
            h("strong", null, option.label),
            h("span", null, option.description),
          )),
        ),
        h("p", { className: "display-mode-status" }, `현재 적용: ${effectiveLabel} 보기`),
      ),
    },
  });
}

export function formatAccountSyncDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "알 수 없음" : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

export function AccountSyncControls({ account, onAccountLoad, onAccountRecovery, onAccountRefresh, onAccountSave, onAccountUpload, onGoogleSignIn, onGoogleSignOut, onPrepareReplacement }) {
  const [replacement, setReplacement] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const confirmationRef = useRef(null);

  useEffect(() => {
    setReplacement(null);
    setConfirmation("");
  }, [account.user?.id, account.connected]);

  useEffect(() => {
    if (replacement) confirmationRef.current?.focus();
  }, [replacement]);

  const closeReplacement = () => {
    setReplacement(null);
    setConfirmation("");
  };

  const openReplacement = async () => {
    setPreparing(true);
    try {
      const preview = await onPrepareReplacement();
      if (preview) {
        setConfirmation("");
        setReplacement(preview);
      }
    } finally {
      setPreparing(false);
    }
  };

  const confirmReplacement = async () => {
    if (confirmation !== "교체" || !replacement || submitting || account.busy) return;
    setSubmitting(true);
    try {
      await onAccountUpload(replacement);
      closeReplacement();
    } finally {
      setSubmitting(false);
    }
  };

  const localIsOlder = replacement
    && new Date(replacement.localUpdatedAt).getTime() < new Date(replacement.cloudUpdatedAt).getTime();
  const isLocalPreview = replacement && /^(localhost|127\.0\.0\.1)(:|$)/.test(replacement.sourceHost);

  return h("div", { className: "account-sync" },
    h("div", { className: "account-sync-header" },
      h("strong", null, "Google 계정"),
      account.user ? h("span", null, account.user.email) : null,
    ),
    !account.user
      ? h("button", { className: "text-button account-primary", type: "button", disabled: account.loading || account.busy, onClick: onGoogleSignIn }, account.loading ? "로그인 확인 중..." : "Google로 로그인")
      : h("div", { className: "account-sync-actions" },
        account.connected
          ? h(React.Fragment, null,
            h("button", { className: "text-button", type: "button", disabled: account.busy, onClick: onAccountSave }, "지금 저장"),
            h("button", { className: "text-button", type: "button", disabled: account.busy, onClick: onAccountRefresh }, "새로고침"),
          )
          : h(React.Fragment, null,
            account.cloudAvailable ? h("button", { className: "text-button account-primary", type: "button", disabled: account.busy, onClick: onAccountLoad }, "클라우드 자료 가져오기") : null,
            !account.cloudAvailable ? h("button", { className: "text-button", type: "button", disabled: account.busy, onClick: () => onAccountUpload() }, "이 기기 자료 옮기기") : null,
          ),
        h("button", { className: "text-button", type: "button", disabled: account.busy, onClick: onGoogleSignOut }, "로그아웃"),
      ),
    h("p", { className: "sync-status", role: "status" }, account.status),
    account.user && latestAccountDraftKey(account.user.id)
      ? h("button", { className: "text-button", type: "button", onClick: onAccountRecovery }, "이전 기기 자료 백업 다운로드")
      : null,
    account.user && !account.connected && account.cloudAvailable
      ? h("details", { className: "account-replace-advanced" },
        h("summary", null, "클라우드 자료 교체"),
        h("p", null, "현재 주소에 남아 있는 자료로 Google 클라우드 자료를 덮어쓸 때만 사용합니다."),
        h("button", { className: "text-button", type: "button", disabled: account.busy || preparing, onClick: openReplacement }, preparing ? "자료 확인 중..." : "교체 내용 확인"),
      )
      : null,
    replacement && account.user && !account.connected
      ? createPortal(h("div", { className: "account-replace-backdrop", onMouseDown: (event) => { if (event.target === event.currentTarget && !submitting) closeReplacement(); } },
        h("section", {
          className: "account-replace-dialog",
          role: "alertdialog",
          "aria-modal": "true",
          "aria-labelledby": "account-replace-title",
          "aria-describedby": "account-replace-description",
          onKeyDown: (event) => { if (event.key === "Escape" && !submitting) closeReplacement(); },
        },
          h("h2", { id: "account-replace-title" }, "Google 클라우드 자료 교체"),
          h("p", { id: "account-replace-description" }, "현재 주소의 브라우저 자료가 Google 클라우드 자료를 덮어씁니다. 다른 기기에도 교체된 내용이 표시됩니다."),
          h("dl", { className: "account-replace-comparison" },
            h("div", null, h("dt", null, "Google 클라우드"), h("dd", null, formatAccountSyncDate(replacement.cloudUpdatedAt))),
            h("div", null, h("dt", null, `현재 주소 (${replacement.sourceHost})`), h("dd", null, formatAccountSyncDate(replacement.localUpdatedAt))),
          ),
          isLocalPreview ? h("p", { className: "account-replace-warning" }, "이 주소는 개발용 미리보기입니다. 실제 웹사이트와 저장된 자료가 다를 수 있으니 교체 전에 내용을 확인하세요.") : null,
          localIsOlder ? h("p", { className: "account-replace-warning" }, "현재 주소의 자료가 클라우드 자료보다 오래됐습니다. 진행하면 최신 내용이 예전 내용으로 바뀔 수 있습니다.") : null,
          h("p", { className: "account-replace-backup" }, "교체 전에 기존 클라우드 자료를 백업 파일로 내려받습니다."),
          h("label", { className: "account-replace-confirmation" },
            h("span", null, "진행하려면 '교체'를 입력하세요"),
            h("input", { ref: confirmationRef, type: "text", autoComplete: "off", value: confirmation, onChange: (event) => setConfirmation(event.target.value), onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); confirmReplacement(); } } }),
          ),
          h("div", { className: "account-replace-actions" },
            h("button", { className: "text-button", type: "button", disabled: submitting, onClick: closeReplacement }, "취소"),
            h("button", { className: "text-button account-replace-submit", type: "button", disabled: confirmation !== "교체" || submitting || account.busy, onClick: confirmReplacement }, submitting ? "교체 중..." : "클라우드 자료 교체"),
          ),
        ),
      ), document.body)
      : null,
  );
}

export function SyncPanel({ account, forgetThisDevice, isOpen, onAccountLoad, onAccountRecovery, onAccountRefresh, onAccountSave, onAccountUpload, onConnect, onGenerate, onGoogleSignIn, onGoogleSignOut, onPrepareReplacement, onPull, onPush, onToggle, setSync, sync, syncReady }) {
  return h(CollapsiblePanel, {
    className: "sync-panel",
    controls: "syncBody",
    description: "Google 계정으로 기기 사이의 자료를 연결합니다.",
    isOpen,
    onToggle,
    title: "기기 동기화",
    children: {
      actions: h("span", { className: "vault-panel-toggle", "aria-hidden": "true" }, isOpen ? "−" : "+"),
      body: h(
        "div",
        { className: "sync-body", id: "syncBody" },
        h(AccountSyncControls, { account, onAccountLoad, onAccountRecovery, onAccountRefresh, onAccountSave, onAccountUpload, onGoogleSignIn, onGoogleSignOut, onPrepareReplacement }),
        !account.connected ? h("details", { className: "legacy-sync" },
          h("summary", null, "기존 PIN 동기화"),
        h(
          "div",
          { className: "sync-grid" },
          h("label", null, h("span", null, "Supabase URL"), h("input", { type: "url", autoComplete: "off", placeholder: "https://project.supabase.co", value: sync.backend.supabaseUrl, onChange: (event) => setSync((current) => ({ ...current, backend: { ...current.backend, supabaseUrl: event.target.value.trim() } })) })),
          h("label", null, h("span", null, "Public Key"), h("input", { type: "password", autoComplete: "off", placeholder: "anon public key", value: sync.backend.supabaseAnonKey, onChange: (event) => setSync((current) => ({ ...current, backend: { ...current.backend, supabaseAnonKey: event.target.value.trim() } })) })),
          h("label", null, h("span", null, "Sync ID"), h("input", { type: "text", autoComplete: "off", placeholder: "Generate or enter Sync ID", value: sync.syncId, onChange: (event) => setSync((current) => ({ ...current, syncId: event.target.value })) })),
          h("label", null, h("span", null, "PIN"), h("input", { type: "password", inputMode: "numeric", autoComplete: "current-password", placeholder: "PIN", value: sync.pin, onChange: (event) => setSync((current) => ({ ...current, pin: event.target.value.trim() })) })),
          h(
            "label",
            { className: "remember-device" },
            h("input", {
              type: "checkbox",
              checked: sync.rememberDevice,
              onChange: (event) =>
                setSync((current) => {
                  if (!event.target.checked) {
                    localStorage.removeItem(SYNC_REMEMBER_KEY);
                    localStorage.removeItem(SYNC_PIN_KEY);
                  }
                  return { ...current, rememberDevice: event.target.checked };
                }),
            }),
            h("span", null, "이 기기 기억하기"),
          ),
          h(
            "div",
            { className: "sync-actions" },
            h("button", { className: "text-button", type: "button", onClick: onGenerate }, "ID 생성"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy, onClick: onConnect }, "연결"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy || !syncReady, onClick: onPull }, "불러오기"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy || !syncReady, onClick: onPush }, "올리기"),
            h("button", { className: "text-button danger", type: "button", onClick: forgetThisDevice }, "기기 연결 해제"),
          ),
        ),
        h("p", { className: "sync-status" }, sync.status),
        ) : null,
      ),
    },
  });
}

export function SystemPanel({ copyBackup, exportBackup, importBackup, isOpen, onToggle }) {
  const fileInputRef = useRef(null);
  return h(CollapsiblePanel, {
    className: "system-panel",
    controls: "systemBody",
    description: "대시보드 전체 데이터를 백업하거나 복원합니다.",
    isOpen,
    onToggle,
    title: "백업 및 복원",
    children: {
      actions: h("span", { className: "vault-panel-toggle", "aria-hidden": "true" }, isOpen ? "−" : "+"),
      body: h(
        "div",
        { className: "system-body", id: "systemBody" },
        h(
          "button",
          { className: "system-action export-action", type: "button", onClick: exportBackup },
          h("span", null, "파일로 저장"),
          h("strong", null, "데이터와 메모 이미지를 내려받습니다"),
        ),
        h(
          "button",
          { className: "system-action copy-action", type: "button", onClick: copyBackup },
          h("span", null, "클립보드에 복사"),
          h("strong", null, "백업 데이터를 바로 복사합니다"),
        ),
        h(
          "button",
          {
            className: "system-action import-action",
            type: "button",
            onClick: () => fileInputRef.current?.click(),
          },
          h("span", null, "백업 불러오기"),
          h("strong", null, "JSON 파일에서 데이터를 복원합니다"),
        ),
        h("input", {
          ref: fileInputRef,
          type: "file",
          accept: "application/json,.json",
          className: "backup-file-input",
          onChange: (event) => {
            importBackup(event.target.files?.[0]);
            event.target.value = "";
          },
        }),
      ),
    },
  });
}

export function SchedulePanel({ calendar, calendarDuties, selectedDate }) {
  const weekStart = getWeekStart(selectedDate);
  const weeks = [0, 7].map((offset) => Array.from({ length: 7 }, (_, index) => addDays(weekStart, offset + index)));
  return h(
    "section",
    { className: "schedule-panel two-week-schedule", "aria-label": "Two-week schedule" },
    h("div", { className: "section-heading" }, h("div", null, h("h2", null, "Today's Schedule"))),
    h(
      "div",
      { className: "schedule-weeks" },
      weeks.map((week, weekIndex) =>
        h(
          "div",
          { className: "schedule-week", key: `week-${weekIndex}` },
          h("div", { className: "schedule-week-title" }, weekIndex === 0 ? "This Week" : "Next Week"),
          h(
            "div",
            { className: "schedule-week-scroll" },
            h("div", { className: "schedule-weekdays" }, weekDays.map((day) => h("span", { key: day.key }, day.label))),
            h(
              "div",
              { className: "schedule-week-grid" },
          week.map((dateKey) => {
            const schedule = calendar[dateKey]?.trim() || "";
            const activeDuties = calendarDutyOptions.filter((option) => calendarDuties?.[dateKey]?.[option.key]);
            const lines = schedule.split(/\n+/).filter(Boolean).map((line) => ({ type: "note", label: line }));
            const items = [...(activeDuties.length ? [{ type: "duties", options: activeDuties }] : []), ...lines];
            const dateLabel = formatCompactDate(dateKey);
            const isSelected = dateKey === selectedDate;
            return h(
              "article",
              { className: `schedule-day ${isSelected ? "selected today" : ""}`, key: dateKey },
              h("div", { className: "schedule-date" }, h("b", null, `${dateLabel.month} ${dateLabel.day}`)),
              h(
                "div",
                { className: `schedule-day-items ${items.length ? "" : "empty"}` },
                items.length
                  ? items.map((item, index) =>
                      h(
                        "span",
                        { className: item.type === "duties" ? "schedule-duty-group" : "", key: `${dateKey}-${index}` },
                        item.type === "duties"
                          ? item.options.map((option) => h("label", { key: option.key }, h("input", { type: "checkbox", checked: true, readOnly: true, tabIndex: -1 }), option.label))
                          : item.label,
                      ),
                    )
                  : h("i", null, "No schedule"),
              ),
            );
          }),
            ),
          ),
        ),
      ),
    ),
  );
}

export function MemoPanel({ activeMemoId, addMemoCard, cards, moveMemoCard, removeMemoCard, setActiveMemo, updateMemoCard }) {
  const [drag, setDrag] = useState({ active: false, startX: 0, deltaX: 0 });
  const [dragMemoId, setDragMemoId] = useState("");
  const activeIndex = Math.max(0, cards.findIndex((card) => card.id === activeMemoId));
  const goToOffset = (offset) => {
    if (!cards.length) return;
    const nextIndex = (activeIndex + offset + cards.length) % cards.length;
    setActiveMemo(cards[nextIndex].id);
  };
  const handlePointerDown = (event) => {
    if (panelClickIsInteractive(event.target)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ active: true, startX: event.clientX, deltaX: 0 });
  };
  const handlePointerMove = (event) => {
    if (!drag.active) return;
    setDrag((current) => ({ ...current, deltaX: event.clientX - current.startX }));
  };
  const endDrag = () => {
    if (!drag.active) return;
    if (drag.deltaX > 64) goToOffset(-1);
    if (drag.deltaX < -64) goToOffset(1);
    setDrag({ active: false, startX: 0, deltaX: 0 });
  };
  return h(
    "section",
    { className: "memo-panel stacked-memo-panel", "aria-label": "Memo" },
    h(
      "div",
      { className: "memo-stack-layout" },
      h(
        "div",
        {
          className: `memo-stack ${drag.active ? "dragging" : ""}`,
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          style: { "--drag-x": `${drag.deltaX}px` },
        },
        cards.map((card, index) => {
          const stackIndex = (index - activeIndex + cards.length) % cards.length;
          const visible = stackIndex < Math.min(cards.length, 4);
          const isActive = index === activeIndex;
          const memoAreas = [
            { key: "left", titleField: "leftTitle", titleValue: card.leftTitle || "", field: "leftText", value: card.leftText || "" },
            { key: "center", titleField: "centerTitle", titleValue: card.centerTitle || "", field: "centerText", value: card.centerText || "" },
            { key: "right", titleField: "rightTitle", titleValue: card.rightTitle || "", field: "rightText", value: card.rightText || "" },
            { key: "left-extra", titleField: "leftExtraTitle", titleValue: card.leftExtraTitle || "", field: "leftTextExtra", value: card.leftTextExtra || "" },
            { key: "center-extra", titleField: "centerExtraTitle", titleValue: card.centerExtraTitle || "", field: "centerTextExtra", value: card.centerTextExtra || "" },
            { key: "right-extra", titleField: "rightExtraTitle", titleValue: card.rightExtraTitle || "", field: "rightTextExtra", value: card.rightTextExtra || "" },
          ];
          return h(
            "article",
            {
              className: `memo-card ${isActive ? "active" : ""} ${visible ? "" : "hidden"}`,
              key: card.id,
              style: { "--stack-index": stackIndex },
              onClick: () => {
                if (!isActive) setActiveMemo(card.id);
              },
            },
            h(
              "div",
              { className: "memo-card-grip" },
              h("span", null, String(index + 1).padStart(2, "0")),
              h("input", {
                type: "text",
                maxLength: 32,
                "aria-label": "Memo title",
                value: card.title,
                onChange: (event) => updateMemoCard(card.id, "title", event.target.value),
                disabled: !isActive,
              }),
              h("button", { className: "mini-button danger", type: "button", disabled: cards.length <= 1 || !isActive, title: "Delete memo", onClick: () => removeMemoCard(card.id) }, "\u00d7"),
            ),
            isActive
              ? h(
                  "div",
                  { className: "memo-card-columns memo-six-grid" },
                  memoAreas.map((area) =>
                    h(MemoArea, {
                      cardId: card.id,
                      field: area.field,
                      marks: card.textFormats?.[area.field],
                      key: area.key,
                      titleField: area.titleField,
                      titleValue: area.titleValue,
                      updateMemoCard,
                      value: area.value,
                    }),
                  ),
                )
              : h(
                  "div",
                  { className: "memo-card-preview-grid" },
                  memoAreas.slice(0, 6).map((area) => h("p", { className: "memo-card-preview", key: area.key }, area.value || "Empty memo")),
                ),
          );
        }),
      ),
      h(
        "div",
        { className: "memo-index", "aria-label": "Memo cards" },
        h("button", { className: "memo-index-button add-memo", type: "button", title: "Add memo", onClick: addMemoCard }, "+"),
        cards.map((card, index) =>
          h(
            "button",
            {
              className: `memo-index-button ${index === activeIndex ? "active" : ""} ${dragMemoId === card.id ? "dragging" : ""}`,
              draggable: true,
              key: card.id,
              type: "button",
              onDragStart: (event) => {
                setDragMemoId(card.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/memo-card", card.id);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromId = event.dataTransfer.getData("text/memo-card") || dragMemoId;
                moveMemoCard(fromId, card.id);
                setDragMemoId("");
              },
              onDragEnd: () => setDragMemoId(""),
              onClick: () => setActiveMemo(card.id),
            },
            index + 1,
          ),
        ),
        h(MemoFormatToolbar),
      ),
    ),
  );
}

export function MemoArea({ cardId, draftScope = "local", field, marks = [], titleField, titleValue, titleIcon, updateMemoCard, value }) {
  const draftKey = `hub-quick-memo:${draftScope}:${cardId}:${field}`;
  const [quickMemo, setQuickMemo] = useState(() => {
    try { return sessionStorage.getItem(draftKey) || ""; } catch { return ""; }
  });
  useEffect(() => {
    try {
      if (quickMemo) sessionStorage.setItem(draftKey, quickMemo);
      else sessionStorage.removeItem(draftKey);
    } catch { /* The active input remains usable when session storage is unavailable. */ }
  }, [draftKey, quickMemo]);
  const addQuickMemo = () => {
    const text = quickMemo.trim();
    if (!text) return;
    const taggedText = text.startsWith("#") ? text : `# ${text}`;
    const prefix = value ? `${taggedText}\n` : taggedText;
    updateMemoCard(cardId, "formattedText", { field, text: prefix + value, marks: marks.map(mark => ({ ...mark, start: mark.start + prefix.length, end: mark.end + prefix.length })) });
    setQuickMemo("");
  };
  return h(
    "section",
    { className: "memo-area" },
    h("div", { className: "memo-title-row" }, titleIcon, h("input", {
      className: "memo-title-input",
      maxLength: 48,
      placeholder: "Title",
      type: "text",
      value: titleValue,
      onChange: (event) => updateMemoCard(cardId, titleField, event.target.value),
      onKeyDown: (event) => event.stopPropagation(),
    })),
    h("textarea", {
      className: "memo-quick-textarea",
      placeholder: "Quick add...",
      rows: 1,
      value: quickMemo,
      onChange: (event) => setQuickMemo(event.target.value),
      onKeyDown: (event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          addQuickMemo();
        }
      },
    }),
    h(MemoEditor, {
      value,
      marks,
      getSelection: getMindfoldEditableSelection,
      setSelection: setMindfoldEditableSelection,
      onChange: (text, nextMarks) => updateMemoCard(cardId, "formattedText", { field, text, marks: nextMarks }),
    }),
  );
}

export function ScorePanel({ carryPenaltyMarked, entryCount, onAdjustCarry, onResetCarry, onToggleAttempt, onToggleCarryPenalty, routineTried, scoreInfo }) {
  const totalClass = scoreInfo.total < 0 ? "negative" : scoreInfo.total === 0 ? "neutral" : "";
  const fillClass = scoreInfo.total > 0 ? "positive" : scoreInfo.total < 0 ? "negative" : "neutral";
  const totalSign = scoreInfo.total > 0 ? "+" : scoreInfo.total < 0 ? "\u2212" : "";
  const totalMagnitude = String(Math.abs(scoreNumber(scoreInfo.total)));
  return h(
    "section",
    { className: "score-panel score-panel-compact", "aria-label": "Score summary" },
    h(
      "div",
      { className: "score-meter score-meter-compact" },
      h("span", { className: "score-kicker score-kicker-compact" }, "Total Score"),
      h(
        "div",
        { className: "score-actions" },
        h(
          "div",
          { className: "score-checks score-checks-compact" },
          h(
            "button",
            {
              className: `score-toggle-button score-toggle-good ${routineTried ? "active" : ""}`,
              type: "button",
              "aria-pressed": String(routineTried),
              "aria-label": "Tried today",
              title: "Tried today",
              onClick: onToggleAttempt,
            },
            h("span", { className: "score-toggle-mark", "aria-hidden": "true" }),
          ),
          h(
            "button",
            {
              className: `score-toggle-button score-toggle-bad ${carryPenaltyMarked ? "active" : ""}`,
              type: "button",
              "aria-pressed": String(carryPenaltyMarked),
              "aria-label": "Add -2 Carry",
              title: "Add -2 Carry",
              onClick: onToggleCarryPenalty,
            },
            h("span", { className: "score-toggle-mark", "aria-hidden": "true" }),
          ),
        ),
        h(
          "div",
          { className: "carry-controls score-carry-controls score-carry-controls-compact" },
          h("button", { className: "carry-adjust-button", type: "button", title: "Decrease Carry", "aria-label": "Decrease Carry", onClick: () => onAdjustCarry(-1) }, "-"),
          h("button", { className: "carry-reset-button", type: "button", title: "Reset Carry", "aria-label": "Reset Carry", onClick: onResetCarry }, "R"),
          h("button", { className: "carry-adjust-button", type: "button", title: "Increase Carry", "aria-label": "Increase Carry", onClick: () => onAdjustCarry(1) }, "+"),
        ),
      ),
      h(
        "div",
        { className: `score-number score-number-compact ${totalClass}` },
        h("span", { className: `score-number-sign ${totalSign ? "" : "empty"}` }, totalSign),
        h("span", { className: "score-number-digits" }, totalMagnitude),
      ),
      h("div", { className: "score-track score-track-compact", "aria-hidden": "true" }, h("span", { className: fillClass, style: { width: `${Math.max(0, Math.min(100, 50 + scoreInfo.total * 2))}%` } })),
    ),
    h(
      "div",
      { className: "score-details score-details-compact" },
      h(
        "div",
        { className: "carry-detail" },
        h("span", { className: "detail-label" }, "Carry"),
        h("strong", { className: "score-detail-value" }, formatScore(scoreInfo.carry)),
      ),
      h("div", { className: "score-detail-row score-detail-plus" }, h("span", { className: "detail-label" }, "Plus"), h("strong", { className: "score-detail-value" }, formatScore(scoreInfo.plus))),
      h("div", { className: "score-detail-row score-detail-minus" }, h("span", { className: "detail-label" }, "Minus"), h("strong", { className: "score-detail-value" }, formatScore(scoreInfo.minus))),
      h("div", { className: "score-detail-row score-detail-records" }, h("span", { className: "detail-label" }, "Records"), h("strong", { className: "score-detail-value" }, entryCount)),
    ),
  );
}

export function DateMarkerPanel({ dateMarkers, selectedDate, updateDateMarker }) {
  return h(
    "section",
    { className: "date-marker-panel", "aria-label": "Date markers" },
    h(
      "div",
      { className: "date-marker-list" },
      normalizeDateMarkers(dateMarkers).map((marker, index) =>
        h(
          "label",
          { className: "date-marker", key: `marker-${index}` },
          h("input", {
            className: "date-marker-text",
            type: "text",
            maxLength: 36,
            placeholder: `Marker ${index + 1}`,
            value: marker.text,
            onChange: (event) => updateDateMarker(index, "text", event.target.value),
          }),
          h("input", {
            className: "date-marker-date",
            type: "date",
            value: marker.date,
            onClick: (event) => event.currentTarget.showPicker?.(),
            onChange: (event) => updateDateMarker(index, "date", event.target.value),
          }),
          h("span", { className: `date-marker-dday ${marker.date ? "" : "empty"}` }, formatDDay(marker.date, selectedDate)),
        ),
      ),
    ),
  );
}

export function isRangeCategory(category) {
  return getCategoryScoreRange(category).length > 1;
}

export function parseScoreRange(value) {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  const text = String(value || "").trim();
  const rangeMatch = text.match(/^(\d+)\s*(?:~|-|,)\s*(\d+)$/);
  if (!rangeMatch) {
    const score = scoreNumber(text, 0);
    return [score];
  }
  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  const step = start <= end ? 1 : -1;
  const length = Math.min(31, Math.abs(end - start) + 1);
  return Array.from({ length }, (_, index) => start + index * step);
}

export function getCategoryScoreRange(category) {
  return parseScoreRange(category.yScore).filter((score) => score > 0);
}

export function getPresetScoreRange(preset) {
  const range = parseScoreRange(preset.yScore).filter((score) => score > 0);
  return range.length > 1 ? range : null;
}

export function createPresetPlanCard({ entries, label = "", planKey, preset, section, toggleChoice, value = preset.name }) {
  const selectedEntry = entries.find((entry) => entry.planKey === planKey);
  const scoreRange = getPresetScoreRange(preset);
  const recordName = value ? `${preset.name}: ${value}` : preset.name;

  if (scoreRange) {
    return {
      key: preset.key,
      label,
      scoreRange,
      selectedChoice: selectedEntry?.choice || "",
      value,
      nScore: preset.nScore,
      onToggle: (choice) =>
        toggleChoice({
          planKey,
          choice: choice === "N" ? "N" : String(choice),
          name: `${section}: ${recordName} (${choice === "N" ? "N" : formatScore(choice)})`,
          score: choice === "N" ? scoreNumber(preset.nScore) : scoreNumber(choice),
        }),
    };
  }

  return {
    key: preset.key,
    label,
    value,
    yScore: preset.yScore,
    nScore: preset.nScore,
    selectedChoice: selectedEntry?.choice || "",
    onToggle: (choice) =>
      toggleChoice({
        planKey,
        choice,
        name: `${section}: ${recordName} (${choice})`,
        score: scoreNumber(choice === "Y" ? preset.yScore : preset.nScore),
      }),
  };
}

export function TodayPlanPanel({ categories, entries, mobile = false, presets, schoolPresets, schoolSubjects, selectedDate, toggleChoice, weekday, weeklyPlan }) {
  const schoolSubject = schoolSubjects?.[weekday.key]?.trim();
  return h(
    "section",
    { className: `today-plan-panel ${mobile ? "mobile-today-plan" : ""}`, "aria-label": "Today plan" },
    h("div", { className: "section-heading" }, h("h2", null, "Today"), h("span", null, weekday.full)),
    h(
      "div",
      { className: "today-plan-grid" },
      h(PlanRow, {
        className: "daily-plan-row",
        title: "Daily",
        cards: presets.map((preset) => {
          const planKey = `daily:${selectedDate}:${preset.key}`;
          return createPresetPlanCard({ entries, planKey, preset, section: "Daily", toggleChoice });
        }),
      }),
      h(PlanRow, {
        className: "school-plan-row",
        title: schoolSubject ? `EDU - ${schoolSubject}` : "EDU",
        cards: schoolPresets.map((preset) => {
          const planKey = `school:${selectedDate}:${preset.key}`;
          return createPresetPlanCard({ entries, planKey, preset, section: "Edu", toggleChoice });
        }),
      }),
      h(PlanRow, {
        className: "weekly-plan-row",
        title: "Weekly",
        cards: categories.map((category) => {
          const planEntry = getWeeklyPlanEntry(weeklyPlan[category.key]?.[weekday.key], selectedDate);
          const value = planEntry.value;
          const planKey = `plan:${selectedDate}:${category.key}`;
          const selectedEntry = entries.find((entry) => entry.planKey === planKey);
          if (isRangeCategory(category)) {
            return {
              key: category.key,
              isRangeCard: true,
              label: category.label,
              scoreRange: getCategoryScoreRange(category),
              selectedChoice: selectedEntry?.choice || "",
              value,
              nScore: category.nScore,
              onToggle: (choice) =>
                toggleChoice({
                  planKey,
                  choice: choice === "N" ? "N" : String(choice),
                  name: `${category.label}: ${value} (${choice === "N" ? "N" : formatScore(choice)})`,
                  score: choice === "N" ? scoreNumber(category.nScore) : scoreNumber(choice),
                }),
            };
          }
          return {
            key: category.key,
            label: category.label,
            value,
            yScore: category.yScore,
            nScore: category.nScore,
            selectedChoice: selectedEntry?.choice || "",
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `${category.label}: ${value} (${choice})`, score: scoreNumber(choice === "Y" ? category.yScore : category.nScore) }),
          };
        }),
      }),
    ),
  );
}

export function PlanRow({ cards, className = "", title }) {
  return h("section", { className: `plan-row ${className}` }, h("h3", null, title), h("div", { className: "plan-card-grid" }, cards.map((card) => h(PlanCard, { ...card }))));
}

export function PlanCard({ label, nScore, onToggle, scoreRange, selectedChoice, value, yScore }) {
  const selectedScore = scoreNumber(selectedChoice, 0);
  const isRangeCard = Array.isArray(scoreRange);
  const isNegativeSelection = selectedChoice === "N" || (isRangeCard && selectedScore < 0);
  const selectionClass = selectedChoice ? (isNegativeSelection ? "selected-negative" : "selected-positive") : "";
  return h(
    "article",
    { className: `today-plan-card ${isRangeCard ? "range-card" : ""} ${selectionClass}` },
    h("span", { className: "edge-light", "aria-hidden": "true" }),
    h("span", { className: "plan-label" }, label),
    h("strong", { className: "plan-title" }, value),
    isRangeCard
      ? h(
        "div",
        { className: "range-score-buttons" },
          ...scoreRange.map((score) =>
            h(
              "button",
              { className: `range-score-button ${scoreNumber(score) < 0 ? "no" : "yes"} ${String(score) === selectedChoice ? "selected" : ""}`, key: score, type: "button", onClick: () => onToggle(score) },
              formatScore(score),
            ),
          ),
          h("button", { className: `range-score-button no ${selectedChoice === "N" ? "selected" : ""}`, type: "button", onClick: () => onToggle("N") }, formatScore(nScore)),
        )
      : h(
          "div",
          { className: "choice-buttons" },
          h("button", { className: `choice-button yes ${selectedChoice === "Y" ? "selected" : ""}`, type: "button", onClick: () => onToggle("Y") }, h("i", null, "Y"), h("b", null, formatScore(yScore))),
          h("button", { className: `choice-button no ${selectedChoice === "N" ? "selected" : ""}`, type: "button", onClick: () => onToggle("N") }, h("i", null, "N"), h("b", null, formatScore(nScore))),
        ),
  );
}

export function DailyPanel({ addPreset, controlsId = "presetGrid", isOpen, leadingContent, movePreset, onToggle, presets, removePreset, title = "Daily", updatePreset }) {
  const [dragPresetKey, setDragPresetKey] = useState("");
  return h(CollapsiblePanel, {
    className: `quick-panel ${leadingContent ? "school-weekly-panel" : ""}`,
    controls: controlsId,
    description: `Set recurring ${title.toLowerCase()} checks and scores.`,
    isOpen,
    onToggle,
    title,
    children: {
      actions: h("button", { className: "text-button daily-tool", type: "button", onClick: addPreset }, "+"),
      body: h(React.Fragment, null, leadingContent, h(
        "div",
        { className: "preset-grid", id: controlsId },
        presets.map((preset, index) =>
          h(
            "article",
            {
              className: `preset-card ${dragPresetKey === preset.key ? "dragging" : ""}`,
              draggable: true,
              key: preset.key,
              onDragStart: (event) => {
                if (panelClickIsInteractive(event.target)) {
                  event.preventDefault();
                  return;
                }
                setDragPresetKey(preset.key);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(`text/${controlsId}-preset`, preset.key);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromKey = event.dataTransfer.getData(`text/${controlsId}-preset`) || dragPresetKey;
                movePreset(fromKey, preset.key);
                setDragPresetKey("");
              },
              onDragEnd: () => setDragPresetKey(""),
            },
            h("input", { className: "preset-name-input", type: "text", maxLength: 32, "aria-label": `${title} name`, value: preset.name, onChange: (event) => updatePreset(index, "name", event.target.value) }),
            h("label", { className: `score-field ${getPresetScoreRange(preset) ? "range-score" : "positive-score"}`, title: getPresetScoreRange(preset) ? "Y range" : "Y score" }, h("input", { className: "preset-score-input y-score", type: "text", inputMode: getPresetScoreRange(preset) ? "text" : "numeric", placeholder: "5 or 1~5", value: preset.yScore, onChange: (event) => updatePreset(index, "yScore", event.target.value) })),
            h("label", { className: "score-field negative-score", title: "N score" }, h("input", { className: "preset-score-input n-score", type: "text", inputMode: "numeric", value: preset.nScore, onChange: (event) => updatePreset(index, "nScore", event.target.value) })),
            h("button", { className: "mini-button danger", type: "button", onClick: () => removePreset(index) }, "\u00d7"),
          ),
        ),
      )),
    },
  });
}

export function SchoolWeeklyPanel({ addPreset, isOpen, movePreset, onToggle, presets, removePreset, schoolSubjects, selectedDate, updatePreset, updateSchoolSubject }) {
  const selectedWeekday = getWeekdayKey(selectedDate);
  const subjectGrid = h("div", { className: "weekly-grid school-weekly-grid", id: "schoolWeeklyGrid" },
    h("div", { className: "weekly-corner" }, "Subject"),
    ...weekDays.map((day) => h("div", { className: `weekly-day ${day.key === selectedWeekday ? "active" : ""}`, key: day.key }, day.label)),
    h("div", { className: "school-subject-label" }, "Subject"),
    ...weekDays.map((day) => h("div", { className: "school-subject-cell", key: `subject-${day.key}` },
      h("input", {
        className: "school-subject-input",
        type: "text",
        maxLength: 80,
        "aria-label": `Edu subject ${day.full}`,
        value: schoolSubjects?.[day.key] || "",
        onChange: (event) => updateSchoolSubject(day.key, event.target.value),
        onKeyDown: (event) => event.stopPropagation(),
      }),
    )),
  );
  return h(DailyPanel, {
    addPreset,
    controlsId: "schoolPresetGrid",
    isOpen,
    leadingContent: subjectGrid,
    movePreset,
    onToggle,
    presets,
    removePreset: (index) => removePreset(presets[index].key),
    title: "Edu",
    updatePreset: (index, field, value) => updatePreset(presets[index].key, field, value),
  });
}

export function MobileSchoolSubjects({ schoolSubjects, selectedDate, updateSchoolSubject }) {
  const selectedWeekday = getWeekdayKey(selectedDate);
  return h(
    "section",
    { className: "mobile-school-subjects", "aria-label": "Edu subjects" },
    h("h2", null, "Subject"),
    h("div", { className: "mobile-school-subject-list" }, weekDays.map((day) =>
      h("label", { className: `mobile-school-subject-day ${day.key === selectedWeekday ? "active" : ""}`, key: day.key },
        h("span", null, day.label),
        h("input", {
          type: "text",
          maxLength: 80,
          "aria-label": `Edu subject ${day.full}`,
          value: schoolSubjects?.[day.key] || "",
          onChange: (event) => updateSchoolSubject(day.key, event.target.value),
          onKeyDown: (event) => event.stopPropagation(),
        }),
      ),
    )),
  );
}

export function WeeklyScheduleCell({ active, onChange, placeholder, value }) {
  const itemRefs = useRef([]);
  const items = getWeeklyPlanItems(value);
  const saveItems = (nextItems, focusIndex = -1) => {
    onChange(encodeWeeklyPlanItems(nextItems));
    if (focusIndex >= 0) requestAnimationFrame(() => itemRefs.current[focusIndex]?.focus());
  };
  const updateItem = (index, nextValue) => {
    const nextItems = [...items];
    nextItems[index] = nextValue;
    saveItems(nextItems);
  };
  const addItem = () => saveItems([...items, ""], items.length);
  const removeDivider = (index) => {
    const nextItems = [...items];
    const [removed] = nextItems.splice(index, 1);
    nextItems[index - 1] = [nextItems[index - 1], removed].filter(Boolean).join("\n");
    saveItems(nextItems, index - 1);
  };

  return h(
    "div",
    { className: `weekly-schedule-cell ${active ? "active" : ""}` },
    ...items.flatMap((item, index) => [
      index > 0
        ? h(
            "div",
            { className: "weekly-item-divider", key: `divider-${index}` },
            h("button", { type: "button", title: "구분선 제거", "aria-label": "구분선 제거", onClick: () => removeDivider(index) }, "×"),
          )
        : null,
      h("textarea", {
        className: "weekly-input",
        key: `item-${index}`,
        maxLength: 180,
        placeholder,
        ref: (node) => { itemRefs.current[index] = node; },
        value: item,
        onChange: (event) => updateItem(index, event.target.value),
        onKeyDown: (event) => event.stopPropagation(),
      }),
    ]),
    h(
      "button",
      { className: "weekly-add-divider", type: "button", title: "새 일정 구분선 추가", "aria-label": "새 일정 구분선 추가", onClick: addItem },
      h("span", { "aria-hidden": "true" }, "+"),
    ),
  );
}

export function WeeklyPanel({ addCategory, categories, isOpen, moveCategory, onToggle, removeCategory, selectedDate, updateCategory, updateWeeklyPlan, weeklyPlan }) {
  const [dragCategoryKey, setDragCategoryKey] = useState("");
  const selectedWeekday = getWeekdayKey(selectedDate);
  return h(CollapsiblePanel, {
    className: "weekly-panel",
    controls: "weeklyGrid",
    description: "Create categories and assign plans for each weekday.",
    isOpen,
    onToggle,
    title: "Weekly",
    children: {
      actions: h("button", { className: "text-button weekly-tool", type: "button", onClick: addCategory }, "+"),
      body: h(
        "div",
        { className: "weekly-grid", id: "weeklyGrid" },
        h("div", { className: "weekly-corner" }, "Category"),
        ...weekDays.map((day) => h("div", { className: `weekly-day ${day.key === selectedWeekday ? "active" : ""}`, key: day.key }, day.label)),
        ...categories.flatMap((category, index) => [
          h(
            "div",
            {
              className: `weekly-category ${dragCategoryKey === category.key ? "dragging" : ""}`,
              draggable: true,
              key: `${category.key}-label`,
              onDragStart: (event) => {
                if (panelClickIsInteractive(event.target)) {
                  event.preventDefault();
                  return;
                }
                setDragCategoryKey(category.key);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/weekly-category", category.key);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromKey = event.dataTransfer.getData("text/weekly-category") || dragCategoryKey;
                moveCategory(fromKey, category.key);
                setDragCategoryKey("");
              },
              onDragEnd: () => setDragCategoryKey(""),
            },
            h("input", {
              className: "category-name-input",
              type: "text",
              maxLength: 24,
              value: category.label,
              onChange: (event) => updateCategory(category.key, "label", event.target.value),
              onKeyDown: (event) => event.stopPropagation(),
            }),
            h("label", { className: `score-field y-field ${isRangeCategory(category) ? "range-score" : "positive-score"}`, title: isRangeCategory(category) ? "Y range" : "Y score" }, h("input", { className: "category-score-input y-score", type: "text", inputMode: "text", placeholder: "5 or 1~5", value: category.yScore, onChange: (event) => updateCategory(category.key, "yScore", event.target.value), onKeyDown: (event) => event.stopPropagation() })),
            h("label", { className: "score-field n-field negative-score", title: "N score" }, h("input", { className: "category-score-input n-score", type: "text", inputMode: "numeric", value: category.nScore, onChange: (event) => updateCategory(category.key, "nScore", event.target.value), onKeyDown: (event) => event.stopPropagation() })),
            h(
              "div",
              { className: "category-actions" },
              h("button", { className: "mini-button danger", type: "button", disabled: categories.length <= 1, onClick: () => removeCategory(category.key) }, "\u00d7"),
            ),
          ),
          ...weekDays.map((day) =>
            h(WeeklyScheduleCell, {
              active: day.key === selectedWeekday,
              key: `${category.key}-${day.key}`,
              onChange: (value) => updateWeeklyPlan(category.key, day.key, value),
              placeholder: `${day.label} ${category.label}`,
              value: weeklyPlan[category.key]?.[day.key] || "",
            }),
          ),
        ]),
      ),
    },
  });
}

export function HistoryPanel({ carryPenalties, getDayTotal, routineAttempts, selectedDate }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + index - 3);
    const key = toDateKey(date);
    const penalized = Boolean(carryPenalties?.[key]);
    return { key, penalized, total: getDayTotal(key), tried: !penalized && Boolean(routineAttempts?.[key]) };
  });
  const scoreScaleMax = 25;
  return h(
    "section",
    { className: "history-panel", "aria-label": "Last 7 days" },
    h(
      "div",
      { className: "section-heading history-heading" },
      h("h2", null, "Weekly Overview"),
    ),
    h(
      "div",
      { className: "history-bars" },
      days.map((day) =>
        h(
          "div",
          { className: `history-day ${day.key === selectedDate ? "today" : ""}`, key: day.key },
          h(
            "div",
            { className: `history-fill ${day.total > 0 ? "plus" : day.total < 0 ? "minus" : ""}`, style: { height: `${Math.max(16, (Math.min(scoreScaleMax, Math.abs(day.total)) / scoreScaleMax) * 112)}px` } },
            h("span", { className: `history-attempt ${day.penalized ? "history-penalty checked" : day.tried ? "checked" : ""}`, title: day.penalized ? "Carry -2 marked" : day.tried ? "Routine tried" : "Not checked" }, day.penalized || day.tried ? "\u2713" : ""),
          ),
          h("span", { className: "history-date" }, day.key.slice(5).replace("-", ".")),
          h("strong", { className: "history-score" }, formatScore(day.total)),
        ),
      ),
    ),
  );
}

export function CalendarPanel({ calendar, calendarDuties, isOpen, onToggle, openMonths, selectedDate, setOpenMonths, toggleCalendarDuty, updateCalendarNote }) {
  const year = new Date(`${selectedDate}T00:00:00`).getFullYear();
  const orderedMonthIndexes = getOrderedMonthIndexes();
  const toggleMonth = (monthIndex) => {
    setOpenMonths((current) => {
      const next = new Set(current);
      if (next.has(monthIndex)) next.delete(monthIndex);
      else next.add(monthIndex);
      return next;
    });
  };
  return h(CollapsiblePanel, {
    className: "calendar-panel",
    controls: "calendarMonths",
    description: "Open a month and write schedule notes or duty checks for each date.",
    isOpen,
    onToggle,
    title: "Calendar",
    children: {
      body: h(
        "div",
        { className: "calendar-months no-panel-toggle", id: "calendarMonths" },
        orderedMonthIndexes.map((monthIndex) => {
          const monthName = monthNames[monthIndex];
          const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
          const dutyDates = Object.keys(calendarDuties || {}).filter((dateKey) => dateKey.startsWith(prefix));
          const noteCount = new Set([...Object.keys(calendar).filter((dateKey) => dateKey.startsWith(prefix)), ...dutyDates]).size;
          const monthOpen = openMonths.has(monthIndex);
          return h(
            "section",
            {
              className: `calendar-month ${monthOpen ? "open" : ""}`,
              key: monthName,
            },
            h(
              "button",
              {
                className: "calendar-month-toggle",
                type: "button",
                "aria-expanded": String(monthOpen),
                onClick: (event) => {
                  event.stopPropagation();
                  toggleMonth(monthIndex);
                },
              },
              h("span", null, monthName),
              h("strong", null, `${noteCount} items`),
            ),
            monthOpen ? h(MonthDays, { calendar, calendarDuties, monthIndex, selectedDate, toggleCalendarDuty, updateCalendarNote, year }) : null,
          );
        }),
      ),
    },
  });
}

export function MonthDays({ calendar, calendarDuties, monthIndex, selectedDate, toggleCalendarDuty, updateCalendarNote, year }) {
  const todayKey = toDateKey(new Date());
  const scrollStartRef = useRef(null);
  const handleCalendarTouchStart = (event) => {
    if (!event.target.closest("textarea")) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    scrollStartRef.current = { x: touch.clientX, y: touch.clientY, target: event.target };
  };
  const handleCalendarTouchMove = (event) => {
    const start = scrollStartRef.current;
    const touch = event.touches?.[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      start.target.blur();
      scrollStartRef.current = null;
    }
  };
  const handleCalendarTouchEnd = () => {
    scrollStartRef.current = null;
  };
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayIndex = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstDayIndex }, (_, index) => ({ key: `blank-start-${monthIndex}-${index}`, type: "blank" })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, key: `day-${monthIndex}-${index + 1}`, type: "day" })),
  ];
  const trailingBlanks = (7 - (cells.length % 7)) % 7;
  Array.from({ length: trailingBlanks }, (_, index) => cells.push({ key: `blank-end-${monthIndex}-${index}`, type: "blank" }));
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return h(
    "div",
    { className: "calendar-weeks", onTouchCancel: handleCalendarTouchEnd, onTouchEnd: handleCalendarTouchEnd, onTouchMove: handleCalendarTouchMove, onTouchStart: handleCalendarTouchStart },
    weeks.map((week, weekIndex) =>
      h(
      "div",
      { className: "calendar-week-scroll", key: `week-${monthIndex}-${weekIndex}` },
      h("div", { className: "calendar-weekdays" }, weekDays.map((day) => h("span", { key: day.key }, day.label))),
      h(
        "div",
        { className: "calendar-days" },
        week.map((cell, cellIndex) => {
          if (cell.type === "blank") return h("div", { className: "calendar-day-spacer", key: cell.key, "aria-hidden": "true" });
          const day = cell.day;
          const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const duties = calendarDuties?.[dateKey] || {};
          return h(
            "article",
            { className: `calendar-day ${dateKey === selectedDate ? "selected" : ""} ${dateKey === todayKey ? "today" : ""}`, key: dateKey },
            h(
              "span",
              { className: "calendar-date" },
              h("b", null, day),
              h(
                "span",
                { className: "calendar-duty-checks" },
                calendarDutyOptions.map((option) =>
                  h(
                    "span",
                    { className: `calendar-duty ${duties[option.key] ? "checked" : ""}`, key: option.key },
                    h("input", {
                      type: "checkbox",
                      checked: Boolean(duties[option.key]),
                      "aria-label": `${dateKey} ${option.label}`,
                      onChange: () => toggleCalendarDuty(dateKey, option.key),
                      onClick: (event) => event.stopPropagation(),
                    }),
                    h("em", null, option.label),
                  ),
                ),
              ),
            ),
            h("textarea", {
              maxLength: 600,
              placeholder: "Schedule",
              value: calendar[dateKey] || "",
              onChange: (event) => updateCalendarNote(dateKey, event.target.value),
              onKeyDown: (event) => event.stopPropagation(),
            }),
          );
        }),
      ),
      ),
    ),
  );
}
