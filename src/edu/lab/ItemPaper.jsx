import React, { useMemo } from "react";
import LabMarkdown from "./LabMarkdown.jsx";
import { contentText, itemChoices, itemFigures, svgImageSource } from "./content.js";

function ItemFigure({ figure, index }) {
  const source = useMemo(() => svgImageSource(figure.svg), [figure.svg]);
  return <figure className="edu-lab-figure lab-paper-figure">
    {source
      ? <img src={source} alt={figure.caption || `문항 그림 ${index + 1}`} />
      : <p className="edu-lab-image-note">그림 형식을 확인해 주세요.</p>}
    {figure.caption && <figcaption>{figure.caption}</figcaption>}
  </figure>;
}

export default function ItemPaper({ item, number, showAnswers = false, collapsible = true }) {
  const record = item && typeof item === "object" ? item : {};
  const choices = itemChoices(record.choices);
  const figures = itemFigures(record.figures);
  const answers = <div className="lab-paper-answer-body">
    <section className="lab-paper-answer"><h4>정답</h4><LabMarkdown>{contentText(record.answer) || "아직 정답이 없습니다."}</LabMarkdown></section>
    <section className="lab-paper-explanation"><h4>해설</h4><LabMarkdown>{contentText(record.explanation) || "아직 해설이 없습니다."}</LabMarkdown></section>
  </div>;
  return <article className="edu-lab-paper lab-paper">
    <header className="lab-paper-heading">
      <h3>{number != null && <span className="lab-paper-number">{number}. </span>}{contentText(record.title) || "제목 없는 문항"}</h3>
      <p className="lab-paper-meta">{[record.subject, record.unit, record.difficulty, record.question_type].map(contentText).filter(Boolean).join(" · ")}</p>
    </header>
    <LabMarkdown className="lab-paper-stem">{record.stem}</LabMarkdown>
    {figures.length > 0 && <div className="lab-paper-figures">{figures.map((figure, index) => <ItemFigure key={index} figure={figure} index={index} />)}</div>}
    {choices.length > 0 && <ol className="lab-paper-choices">{choices.map((choice, index) => <li key={index}>
      <span className="lab-paper-choice-label">{choice.label}.</span><LabMarkdown>{choice.text}</LabMarkdown>
    </li>)}</ol>}
    {collapsible
      ? <details className="lab-paper-answers" open={showAnswers}><summary>정답 · 해설 펼치기</summary>{answers}</details>
      : showAnswers && <div className="lab-paper-answers">{answers}</div>}
  </article>;
}
