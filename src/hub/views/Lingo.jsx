import React, { lazy, Suspense } from "react";
const Japanese = lazy(() => import("./lingo/Japanese.jsx"));
const English = lazy(() => import("./lingo/English.jsx"));
export default function Lingo({ route, navigate }) {
  const language = route.section === "en" ? "en" : "ja";
  return (
    <>
      <nav className="hub-segments" aria-label="학습 언어">
        <button
          aria-current={language === "ja" ? "page" : undefined}
          onClick={() => navigate("lingo", "ja")}
        >
          日本語
        </button>
        <button
          aria-current={language === "en" ? "page" : undefined}
          onClick={() => navigate("lingo", "en")}
        >
          English
        </button>
      </nav>
      <Suspense fallback={<p role="status">불러오는 중…</p>}>
        {language === "ja" ? <Japanese /> : <English />}
      </Suspense>
    </>
  );
}
