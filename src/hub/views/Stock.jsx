import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Plus, Pencil, Trash2, RotateCcw, X, Check } from 'lucide-react';
import { useDashboardData } from '../context.jsx';
import { appBase } from '../routing.js';
import { createStock, emptyPosition, defaultStages, calculateIBS, calculateVR, inspectVRSettings, applyVRSettings, saveSharedVRSettings, updateStockPosition, retireSOXL, getStageHighlight } from '../../stock/model.js';
import { sides, ruleAt, rowCount, editableStages, addRule, addStrategyRow, removeStrategyRow, addStrategyStage, validateStrategy, describeRule } from '../../stock/strategy.js';
import '../../stock/stock.css';

const number = (n, d = 2) => Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—';
function Field({ label, account = '', value, onChange, suffix = '', step = 'any', max }) {
  return <label className="stock-field"><span>{label}</span><div><input aria-label={`${account ? `${account} ` : ''}${label}`} type="number" min="0" max={max} step={step} value={value} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} /><small>{suffix}</small></div></label>;
}
function Orders({ result }) {
  if (result.error) return <div className="stock-empty"><p>{result.error}</p></div>;
  return <div className="stock-order-columns">{sides.map(([side, label]) => <div key={side} className={`stock-order-group ${side}`}><h4><span />{label}</h4>{result.orders.filter(r => r.side === side).map(r => <div className="stock-order" key={r.id} title={describeRule(r).price}><div><strong>{r.price === null ? 'MOC' : `$${number(r.price)}`}</strong></div><div><strong>{number(r.quantity, 0)}<small> 주</small></strong>{r.capped && <small>수량 한도</small>}</div></div>)}{!result.orders.some(r => r.side === side) && <p className="stock-hint">—</p>}</div>)}</div>;
}
function Ratio({ ratio, label }) {
  return <div className="stock-ratio"><span>{label}</span><strong>{number(ratio, 1)}<small>%</small></strong><div><i style={{ width: `${Math.min(ratio || 0, 100)}%` }} /></div></div>;
}
function AccountHeader({ label, badge }) {
  return <div className="stock-account-header"><h3 aria-label={`${label} 계좌`}><span className={`stock-account-label tag-${label.toLowerCase()}`}>{label}</span></h3>{badge && <span className="stock-badge">{badge}</span>}</div>;
}
function RuleCell({ rule, editing, label, onChange, onAdd, onRemove }) {
  if (!rule) return <div className="stock-cell-empty">{editing ? <button aria-label={`${label} 규칙 추가`} onClick={onAdd}><Plus size={13} />추가</button> : '—'}</div>;
  const text = describeRule(rule);
  if (!editing) return <div className="stock-rule-text"><strong>{text.price}</strong><span>{text.quantity}</span>{(rule.offset || rule.special) ? <details className="stock-rule-details"><summary>보정</summary>{!!rule.offset && <p>가격 {rule.offset > 0 ? '+' : ''}{rule.offset}달러</p>}{rule.special && <p>{rule.special === 'small-first' ? '1~3주 보유 시 1주' : '2~3주 보유 시 1주'}</p>}</details> : null}</div>;
  return <div className="stock-rule-editor">
    <label><span>가격</span><select aria-label={`${label} 주문 방식`} value={rule.order} onChange={e => onChange({ order: e.target.value, ...(e.target.value === 'moc' ? { percent: rule.percent === '' ? 0 : rule.percent, offset: rule.offset === '' ? 0 : rule.offset } : {}) })}><option value="limit">평단 대비</option><option value="moc">MOC</option></select></label>
    {rule.order !== 'moc' && <label><input aria-label={`${label} 평단 대비 비율`} type="number" step="any" value={rule.percent} onChange={e => onChange({ percent: e.target.value === '' ? '' : Number(e.target.value) })} /><span>%</span></label>}
    <label><span>수량</span><select aria-label={`${label} 수량 기준`} value={rule.mode} onChange={e => onChange({ mode: e.target.value, special: '', ...(e.target.value === 'remaining' ? { divisor: 1 } : {}) })}><option value="capacity">가능 수량 ÷</option><option value="held">보유 수량 ÷</option><option value="remaining">남은 보유 수량 전부</option><option value="fixed">고정 수량</option></select></label>
    {rule.mode !== 'remaining' && <label><input aria-label={`${label} 수량 계산 값`} type="number" min={rule.mode === 'fixed' ? 0 : 0.01} step={rule.mode === 'fixed' ? 1 : 'any'} value={rule.divisor} onChange={e => onChange({ divisor: e.target.value === '' ? '' : Number(e.target.value) })} /><span>{rule.mode === 'fixed' ? '주' : '로 나눔'}</span></label>}
    <details className="stock-rule-details"><summary>상세 설정</summary><label><span>가격 보정 ($)</span><input aria-label={`${label} 가격 보정`} type="number" step="0.01" disabled={rule.order === 'moc'} value={rule.offset} onChange={e => onChange({ offset: e.target.value === '' ? '' : Number(e.target.value) })} /></label><label><span>소량 보유 보정</span><select aria-label={`${label} 소량 보유 보정`} value={rule.special} onChange={e => onChange({ special: e.target.value })}><option value="">없음</option><option value="small-first">1~3주: 1주</option><option value="small-second">2~3주: 1주</option></select></label><button onClick={onRemove} aria-label={`${label} 규칙 삭제`}><Trash2 size={12} />이 칸 삭제</button></details>
  </div>;
}
function StrategyTable({ asset, stages, draft, setDraft, accounts, onSave, onCancel, onEdit }) {
  const editing = !!draft;
  const error = editing ? validateStrategy(stages) : '';
  const sorted = [...stages].sort((a, b) => Number(a.upper) - Number(b.upper));
  const changeStage = (id, patch) => setDraft(stages.map(s => s.id === id ? { ...s, ...patch } : s));
  const changeRule = (stage, rule, patch) => changeStage(stage.id, { rules: stage.rules.map(r => r.id === rule.id ? { ...r, ...patch } : r) });
  const removeStage = id => {
    const next = stages.filter(s => s.id !== id);
    if (next.length) {
      const last = [...next].sort((a, b) => a.upper - b.upper).at(-1);
      setDraft(next.map(s => s.id === last.id ? { ...s, upper: 100 } : s));
    } else setDraft([]);
  };
  return <section className={`stock-panel stock-matrix-panel ${editing ? 'is-editing' : ''}`}>
    <div className="stock-section-heading"><h3>매매 전략</h3><div className="stock-legend" aria-label="단계 색상"><span className="tag-a">A</span><span className="tag-y">Y</span><span className="tag-both">A + Y</span></div>{!editing && <button onClick={onEdit}><Pencil size={14} />편집</button>}{editing && <span className="stock-badge">미리보기</span>}</div>
    {editing && <div className="stock-matrix-actions"><button onClick={() => setDraft(addStrategyStage(stages))}><Plus size={13} />단계 추가</button>{sides.map(([side, label]) => <button key={side} onClick={() => setDraft(addStrategyRow(stages, side))}><Plus size={13} />{label} 행 추가</button>)}<button onClick={() => setDraft(editableStages(defaultStages()))}>TQQQ 시트 규칙 불러오기</button></div>}
    {!stages.length ? <div className="stock-empty"><p>이 종목의 전략을 설정해 주세요.</p>{!editing && <button onClick={onEdit}>전략 만들기</button>}</div> : <div className="stock-table-wrap"><table className="stock-strategy-table"><thead><tr><th scope="col">매매 기준</th>{sorted.map((stage, index) => {
      const lower = sorted[index - 1]?.upper || 0;
      const applied = accounts.filter(a => a.result.stage?.id === stage.id);
      return <th scope="col" key={stage.id} className={getStageHighlight(stage.id, accounts)}><div className="stock-stage-head">{editing ? <div className="stock-stage-edit"><input aria-label={`${stage.name} 이름`} value={stage.name} onChange={e => changeStage(stage.id, { name: e.target.value })} /><button aria-label={`${stage.name} 삭제`} onClick={() => removeStage(stage.id)}><Trash2 size={13} /></button></div> : <strong>{stage.name}</strong>}<div className="stock-stage-range">{editing ? <label>{lower}% ~ <input aria-label={`${stage.name} 구간 상한`} type="number" min="0.01" max="100" step="any" value={stage.upper} onChange={e => changeStage(stage.id, { upper: e.target.value === '' ? '' : Number(e.target.value) })} />%</label> : `${lower}% ~ ${stage.upper}%${index === sorted.length - 1 ? '' : ' 미만'}`}</div><div className="stock-stage-tags">{applied.map(a => <span className={`tag-${a.label.toLowerCase()}`} aria-label={`${a.label} 적용 단계`} key={a.label}>{a.label}</span>)}</div></div></th>;
    })}</tr></thead><tbody>{sides.flatMap(([side, label]) => Array.from({ length: Math.max(1, rowCount(stages, side)) }, (_, row) => <tr key={`${side}-${row}`}><th scope="row" className={`stock-row-label ${side}`}><span>{label} {row + 1}</span>{editing && <button className="stock-row-delete" aria-label={`${label} ${row + 1}행 삭제`} onClick={() => setDraft(removeStrategyRow(stages, side, row))}><Trash2 size={12} /></button>}</th>{sorted.map(stage => {
      const rule = ruleAt(stage, side, row), cellLabel = `${asset.symbol} ${stage.name} ${label} ${row + 1}`;
      return <td key={stage.id} className={getStageHighlight(stage.id, accounts)}><RuleCell label={cellLabel} rule={rule} editing={editing} onChange={patch => changeRule(stage, rule, patch)} onAdd={() => changeStage(stage.id, { rules: addRule(stage, side, row).rules })} onRemove={() => changeStage(stage.id, { rules: stage.rules.filter(r => r.id !== rule.id) })} /></td>;
    })}</tr>))}</tbody></table></div>}
    {editing && <><div className="stock-draft-preview" aria-label="전략 변경 미리보기">{accounts.map(a => <div className={`account-${a.label.toLowerCase()}`} key={a.label}><strong>{a.label} · {a.result.stage?.name || '단계 미정'}</strong>{a.result.error ? <span>{a.result.error}</span> : sides.map(([side, label]) => <span key={side}>{label} {a.result.orders.filter(r => r.side === side).map(r => `${r.price === null ? 'MOC' : `$${number(r.price)}`} · ${r.quantity}주`).join(' / ') || '—'}</span>)}</div>)}</div><div className="stock-edit-footer">{error && <span role="status">{error}</span>}<button onClick={onCancel}>취소</button><button className="stock-primary" disabled={!!error} onClick={onSave}><Check size={14} />저장</button></div></>}
  </section>;
}

export default function Stock() {
  const d = useDashboardData();
  const initial = useRef(null); if (!initial.current) initial.current = createStock();
  const savedStock = d.data.stock;
  const state = retireSOXL(savedStock || initial.current);
  const [mode, setMode] = useState('ibs'), [assetId, setAssetId] = useState('');
  const [strategyDraft, setStrategyDraft] = useState(null), [vrDraft, setVrDraft] = useState(null), [vrSource, setVrSource] = useState('');
  const [notice, setNotice] = useState(''), [undo, setUndo] = useState(null);
  const [market, setMarket] = useState(null), [loading, setLoading] = useState(false), [failure, setFailure] = useState('');
  const request = useRef(null);
  const asset = state.assets.find(a => a.id === assetId) || state.assets[0];
  const profiles = state.profiles.slice(0, 2);
  const update = fn => d.saveData(current => ({ ...current, stock: fn(current.stock || initial.current) }));
  useEffect(() => {
    if (savedStock && retireSOXL(savedStock) !== savedStock) update(retireSOXL);
  }, [savedStock]);
  const savePosition = (profileId, patch) => update(s => updateStockPosition(s, profileId, asset.id, patch));
  const clearDrafts = () => { setStrategyDraft(null); setVrDraft(null); setVrSource(''); };
  const selectAsset = id => { clearDrafts(); setAssetId(id); };
  const selectMode = value => { clearDrafts(); setMode(value); };
  const rememberConfig = () => setUndo({ type: 'config', assetId: asset.id, stages: structuredClone(asset.stages), hasVr: Object.hasOwn(asset, 'vr'), vr: structuredClone(asset.vr) });
  const restore = () => {
    update(s => {
      return { ...s, assets: s.assets.map(a => {
        if (a.id !== undo.assetId) return a;
        const restored = { ...a, stages: undo.stages };
        if (undo.hasVr) restored.vr = undo.vr; else delete restored.vr;
        return restored;
      }) };
    });
    setAssetId(undo.assetId); setUndo(null); clearDrafts(); setNotice('되돌렸습니다.');
  };
  const refresh = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setFailure('');
    try {
      const url = import.meta.env.DEV ? '/__stock-market' : `${appBase()}market/latest.json?t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('종가와 환율을 가져오지 못했습니다.');
      const next = await response.json(); if (next.version !== 1 || !next.quotes) throw new Error('시세 데이터 형식을 확인할 수 없습니다.');
      setMarket(next); try { localStorage.setItem('hub-public-market-v1', JSON.stringify(next)); } catch {}
    } catch (error) { if (error.name !== 'AbortError') setFailure('갱신 실패 · 저장된 시세가 있으면 표시합니다.'); }
    finally { if (request.current === controller) setLoading(false); }
  };
  useEffect(() => {
    try { const cached = JSON.parse(localStorage.getItem('hub-public-market-v1')); if (cached?.version === 1) setMarket(cached); } catch {}
    refresh(); const timer = setInterval(refresh, 15 * 60 * 1000);
    return () => { clearInterval(timer); request.current?.abort(); };
  }, []);
  const quote = market?.quotes?.[asset?.symbol], fx = market?.quotes?.['KRW=X'];
  const stages = strategyDraft?.assetId === asset?.id ? strategyDraft.stages : asset?.stages || [];
  const vrInfo = asset ? inspectVRSettings(asset, profiles) : null;
  const activeVrDraft = vrDraft?.assetId === asset?.id ? vrDraft.settings : null;
  const accounts = profiles.map((profile, index) => {
    const position = { ...emptyPosition(), ...profile.positions?.[asset?.id] };
    const vrPosition = activeVrDraft ? { ...position, ...activeVrDraft } : applyVRSettings(position, asset);
    const result = calculateIBS(position, stages);
    const held = Number(position.held), capacity = Number(position.capacity);
    if (result.ratio === undefined && Number.isFinite(held) && Number.isFinite(capacity) && held >= 0 && capacity >= 0) result.ratio = held + capacity > 0 ? held / (held + capacity) * 100 : 0;
    return { label: index === 0 ? 'A' : 'Y', profile, position, result, vr: calculateVR(vrPosition, quote?.close, quote?.weeklyClose, fx?.close) };
  });
  const age = market?.checkedAt ? (Date.now() - new Date(market.checkedAt).getTime()) / 86400000 : 0;
  const marketWarning = failure || (Object.keys(market?.errors || {}).length ? '일부 시세 수집 실패 · 이전 값과 기준일을 확인해 주세요.' : age > 3 ? '시세 업데이트가 지연되고 있습니다. 기준일을 확인해 주세요.' : '');
  const beginVR = (settings, source = '') => { setVrDraft({ assetId: asset.id, settings: Object.fromEntries(['lower', 'upper', 'invest'].map(key => [key, Number(settings[key])])) }); setVrSource(source); };
  const vrInvalid = activeVrDraft && (!['lower', 'upper', 'invest'].every(k => Number.isFinite(activeVrDraft[k])) || activeVrDraft.lower < 0 || activeVrDraft.lower >= activeVrDraft.upper || activeVrDraft.upper > 100 || activeVrDraft.invest <= 0 || activeVrDraft.invest > 100);
  return <div className="stock-page">
    <header className="stock-workspace-header">
      <h1>Stock</h1>
      <div className="stock-toolbar"><div className="stock-tabs" role="tablist" aria-label="투자 방법">{[['ibs', '무한매수'], ['vr', 'VR']].map(([key, label]) => <button role="tab" aria-selected={mode === key} key={key} onClick={() => selectMode(key)}>{label}</button>)}</div>{undo && <button onClick={restore}><RotateCcw size={14} />되돌리기</button>}</div>
      <button onClick={refresh} disabled={loading} title={`Yahoo Finance · ${market?.checkedAt ? new Date(market.checkedAt).toLocaleString('ko-KR') : '—'} 수집`}><RefreshCw size={16} className={loading ? 'stock-spin' : ''} />{loading ? '갱신 중' : '새로고침'}</button>
    </header>
    <div className="stock-market-bar"><div className="stock-quotes">{state.assets.map(a => { const q = market?.quotes?.[a.symbol]; return <button className={`stock-quote ${asset?.id === a.id ? 'is-active' : ''}`} key={a.id} onClick={() => selectAsset(a.id)}><span>{a.symbol}</span><strong>{q ? `$${number(q.close)}` : '—'}</strong><small>{q ? `${q.date} 종가` : '종가 연결 대기'}</small></button>; })}<article className="stock-quote stock-fx"><span>USD / KRW</span><strong>{fx ? `₩${number(fx.close)}` : '—'}</strong><small>{fx ? fx.date : '환율 연결 대기'}</small></article></div></div>
    {marketWarning && <p className="stock-warning" role="status">{marketWarning}</p>}
    {notice && <p role="status" className="stock-warning">{notice}<button aria-label="알림 닫기" onClick={() => setNotice('')}><X size={14} /></button></p>}
    {asset && accounts.length ? <>
      {mode === 'ibs' ? <>
        <div className="stock-account-grid">{accounts.map(a => <section className={`stock-panel stock-account account-${a.label.toLowerCase()}`} key={a.profile.id}><AccountHeader label={a.label} badge={a.result.stage?.name} /><div className="stock-inputs"><Field account={a.label} label="평단가" suffix="USD" value={a.position.average} onChange={average => savePosition(a.profile.id, { average })} /><Field account={a.label} label="보유 수량" suffix="주" step="1" value={a.position.held} onChange={held => savePosition(a.profile.id, { held })} /><Field account={a.label} label="추가 매수 가능" suffix="주" step="1" value={a.position.capacity} onChange={capacity => savePosition(a.profile.id, { capacity })} /></div><Ratio ratio={a.result.ratio} label="보유 비율" /><Orders result={a.result} /></section>)}</div>
        <StrategyTable asset={asset} stages={stages} draft={strategyDraft} setDraft={next => setStrategyDraft({ assetId: asset.id, stages: next })} accounts={accounts} onEdit={() => setStrategyDraft({ assetId: asset.id, stages: editableStages(asset.stages) })} onCancel={() => setStrategyDraft(null)} onSave={() => { rememberConfig(); update(s => ({ ...s, assets: s.assets.map(a => a.id === asset.id ? { ...a, stages } : a) })); setStrategyDraft(null); setNotice('저장했습니다.'); }} />
      </> : <>
        <section className="stock-panel stock-vr-settings"><div className="stock-section-heading"><h3>VR 설정</h3>{!activeVrDraft && !vrInfo.conflict && <button onClick={() => beginVR(vrInfo.settings)}><Pencil size={14} />편집</button>}{activeVrDraft && <span className="stock-badge">미리보기{vrSource && ` · ${vrSource} 기준`}</span>}</div>
          {vrInfo.conflict && !activeVrDraft ? <div className="stock-vr-conflict"><p>A·Y의 기존 설정이 다릅니다. 공통 기준을 선택하세요.</p>{vrInfo.legacy.map((entry, index) => <button key={entry.profileId} className={`account-${index === 0 ? 'a' : 'y'}`} onClick={() => beginVR(entry.settings, index === 0 ? 'A' : 'Y')}><strong>{index === 0 ? 'A' : 'Y'} 설정으로 시작</strong><span>하한 {entry.settings.lower}% · 상한 {entry.settings.upper}% · 투자 {entry.settings.invest}%</span></button>)}</div> : <>
            <div className="stock-inputs">{[['lower', '현금 비중 하한'], ['upper', '현금 비중 상한'], ['invest', '적립금 투자 비율']].map(([key, label]) => activeVrDraft ? <Field key={key} label={label} suffix="%" max="100" value={activeVrDraft[key]} onChange={value => setVrDraft({ assetId: asset.id, settings: { ...activeVrDraft, [key]: value } })} /> : <div className="stock-ratio" key={key}><span>{label}</span><strong>{number(vrInfo.settings[key], 0)}<small>%</small></strong></div>)}</div>
            {activeVrDraft && <div className="stock-edit-footer">{vrInvalid && <span role="status">0 ≤ 하한 &lt; 상한 ≤ 100, 투자 비율은 0 초과 100 이하</span>}<button onClick={() => { setVrDraft(null); setVrSource(''); }}>취소</button><button className="stock-primary" disabled={vrInvalid} onClick={() => { rememberConfig(); update(s => saveSharedVRSettings(s, asset.id, activeVrDraft)); setVrDraft(null); setVrSource(''); setNotice('저장했습니다.'); }}><Check size={14} />저장</button></div>}
          </>}
        </section>
        <div className="stock-account-grid">{accounts.map(a => <section className={`stock-panel stock-account stock-vr-account account-${a.label.toLowerCase()}`} key={a.profile.id}><AccountHeader label={a.label} badge={activeVrDraft ? '미리보기' : vrInfo.conflict ? '기존 설정' : null} /><div className="stock-inputs"><Field account={a.label} label="원화 예수금" suffix="원" value={a.position.krwCash} onChange={krwCash => savePosition(a.profile.id, { krwCash })} /><Field account={a.label} label="외화 예수금 · 원화 환산" suffix="원" value={a.position.fxCash} onChange={fxCash => savePosition(a.profile.id, { fxCash })} /><Field account={a.label} label={`${asset.symbol} 평가금`} suffix="원" value={a.position.valuation} onChange={valuation => savePosition(a.profile.id, { valuation })} /></div><Ratio ratio={a.vr.ratio} label="현금 비중" />{a.vr.error ? <p className="stock-warning">{a.vr.error}</p> : <div className="stock-vr-result"><div><span className="stock-eyebrow">비중 조절</span><div className="stock-vr-answer">{a.vr.quantity > 0 ? <>{number(a.vr.quantity, 0)}<small>주 {a.vr.action}</small></> : '유지'}</div><p className="stock-hint">총 자산 ₩{number(a.vr.total, 0)}</p></div><div><span className="stock-eyebrow">필요 입금액</span><div className="stock-vr-answer">₩{number(a.vr.deposit, 0)}</div></div></div>}<Field account={a.label} label="원하는 매수 수량" suffix="주" step="1" value={a.position.desired} onChange={desired => savePosition(a.profile.id, { desired })} /></section>)}</div>
        <details className="stock-rule-details"><summary>입금액 계산 기준</summary><p>지난주 종가 ${number(quote?.weeklyClose)} ({quote?.weeklyDate || '—'}) × 환율 ÷ 투자 비율. 1주 입금액을 만 원 단위로 반올림한 뒤 수량을 곱합니다.</p></details>
      </>}
    </> : <section className="stock-panel stock-empty">종목을 추가해 계산을 시작하세요.</section>}
  </div>;
}
