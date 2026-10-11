import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { RefreshCw, Plus, Minus, Pencil, RotateCcw, X, Check, ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Wallet, SlidersHorizontal, Table2 } from 'lucide-react';
import { useDashboardData } from '../context.jsx';
import { appBase, todayKey } from '../routing.js';
import { createStock, emptyPosition, calculateIBS, calculateVR, getVRCycle, inspectVRSettings, applyVRSettings, saveSharedVRSettings, updateStockPosition, retireSOXL } from '../../stock/model.js';
import { sides, editableStages, describeRule } from '../../stock/strategy.js';
import '../../stock/stock.css';

const StrategyTable = lazy(() => import('../../stock/StrategyTable.jsx'));
const number = (n, d = 2) => Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—';
function Field({ label, account = '', ariaLabel, value, onChange, suffix = '', step = 'any', max, scale = 1 }) {
  return <label className="stock-field"><span>{label}</span><div><input aria-label={ariaLabel || `${account ? `${account} ` : ''}${label}`} type="number" min="0" max={max} step={step} value={value === '' ? '' : value / scale} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value) * scale)} /><small>{suffix}</small></div></label>;
}
function SharePicker({ account, value, onChange }) {
  const quantity = Number(value) || 0;
  const choices = Array.from({ length: 101 }, (_, index) => index);
  if (quantity > 100) choices.push(quantity);
  return <label className="stock-share-picker"><span>원하는 매수 수량</span><div>
    <button type="button" aria-label={`${account} 매수 수량 줄이기`} title="1주 줄이기" disabled={quantity <= 0} onClick={() => onChange(Math.max(0, quantity - 1))}><Minus size={16} /></button>
    <div className="stock-share-value"><select aria-label={`${account} 원하는 매수 수량`} value={quantity} onChange={e => onChange(Number(e.target.value))}>{choices.map(n => <option key={n} value={n}>{n}주</option>)}</select><ChevronDown size={14} aria-hidden="true" /></div>
    <button type="button" aria-label={`${account} 매수 수량 늘리기`} title="1주 늘리기" onClick={() => onChange(quantity + 1)}><Plus size={16} /></button>
  </div></label>;
}
function SettingValue({ label, ariaLabel, value, editing, onChange }) {
  return editing ? <Field label={label} ariaLabel={ariaLabel} value={value} onChange={onChange} suffix="%" max="100" /> :
    <div className="stock-setting-value"><span>{label}</span><div><strong>{number(Number(value), 0)}</strong><small>%</small></div></div>;
}
function ContributionSplit({ invest, editing, onChange }) {
  const cash = invest === '' ? '' : 100 - Number(invest);
  return <div className="stock-contribution-split"><h4>입금 배분</h4>
    <div className="stock-vr-setting-fields">
      <SettingValue label="현금" ariaLabel="입금 현금 비율" value={cash} editing={editing} onChange={value => onChange(value === '' ? '' : 100 - value)} />
      <SettingValue label="TQQQ" ariaLabel="입금 TQQQ 비율" value={invest} editing={editing} onChange={onChange} />
    </div>
    <div className="stock-split-meter" aria-hidden="true"><i style={{ width: `${Number(cash) || 0}%` }} /><i style={{ width: `${Number(invest) || 0}%` }} /></div>
  </div>;
}
function Valuation({ account, symbol, position, result }) {
  const automatic = Object.hasOwn(position, 'vrHeld');
  const value = result.valuation ?? (automatic ? null : Number(position.valuation));
  return <div className="stock-field stock-valuation"><span>{symbol} 평가금 <small>{automatic ? '자동 계산' : '이전 평가금'}</small></span><div><output aria-label={`${account} ${symbol} 평가금`}>{number(value === null ? NaN : value / 10000)}</output><small>만원</small></div></div>;
}
function Orders({ result }) {
  if (result.error) return <div className="stock-empty" role="status"><p>{result.error}</p></div>;
  return <div className="stock-order-columns" aria-label="현재 조건의 주문">{sides.map(([side, label]) => {
    const orders = result.orders.filter(r => r.side === side && r.quantity > 0);
    return <div key={side} className={`stock-order-group ${side}`}>
      <h4><span />{label} 주문<small>{orders.length}건</small></h4>
      {orders.map(r => <div className="stock-order" key={r.id} title={describeRule(r).price}>
        <div><small>{r.price === null ? '장 마감 시장가' : '지정가'}</small><strong>{r.price === null ? 'MOC' : `$${number(r.price)}`}</strong></div>
        <div><strong>{number(r.quantity, 0)}<small> 주</small></strong>{r.capped && <small>수량 한도 적용</small>}</div>
      </div>)}
      {!orders.length && <p className="stock-no-orders">{label} 주문 없음</p>}
    </div>;
  })}</div>;
}
function Ratio({ ratio, label }) {
  return <div className="stock-ratio"><span>{label}</span><strong>{number(ratio, 1)}<small>%</small></strong><div><i style={{ width: `${Math.min(ratio || 0, 100)}%` }} /></div></div>;
}
function AccountHeader({ label, badge, children }) {
  return <div className="stock-account-header"><h3 aria-label={`${label} 계좌`}><span className={`stock-account-label tag-${label.toLowerCase()}`}>{label}</span></h3>{badge && <span className="stock-badge">{badge}</span>}{children}</div>;
}
function StrategyDialog({ symbol, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const panel = dialog.current;
    panel.showModal();
    return () => panel.close();
  }, []);
  return <dialog ref={dialog} className="stock-strategy-dialog" aria-labelledby="stock-strategy-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="stock-strategy-dialog-header"><div><h2 id="stock-strategy-title">{symbol} 매매 전략</h2><span>A·Y 공통 규칙</span></div><button type="button" autoFocus aria-label="전략표 닫기" title="닫기" onClick={onClose}><X size={20} /></button></header>
    {children}
  </dialog>;
}

export default function Stock() {
  const d = useDashboardData();
  const initial = useRef(null); if (!initial.current) initial.current = createStock();
  const savedStock = d.data.stock;
  const state = retireSOXL(savedStock || initial.current);
  const [mode, setMode] = useState('ibs'), [assetId, setAssetId] = useState('');
  const [strategyDraft, setStrategyDraft] = useState(null), [vrDraft, setVrDraft] = useState(null), [vrSource, setVrSource] = useState('');
  const [strategyAccountId, setStrategyAccountId] = useState('');
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
  const clearDrafts = () => { setStrategyDraft(null); setStrategyAccountId(''); setVrDraft(null); setVrSource(''); };
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
  const cycle = getVRCycle(d.selectedDate), currentCycle = getVRCycle(todayKey());
  const contributionWeek = cycle?.mode === 'contribution';
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
  const strategyAccount = accounts.find(account => account.profile.id === strategyAccountId);
  const closeStrategy = () => {
    const changed = strategyDraft && JSON.stringify(editableStages(strategyDraft.stages)) !== JSON.stringify(editableStages(asset.stages));
    if (changed && !window.confirm('저장하지 않은 전략 변경사항이 있습니다. 변경사항을 버리고 닫을까요?')) return;
    setStrategyDraft(null); setStrategyAccountId('');
  };
  const age = market?.checkedAt ? (Date.now() - new Date(market.checkedAt).getTime()) / 86400000 : 0;
  const marketWarning = failure || (Object.keys(market?.errors || {}).length ? '일부 시세 수집 실패 · 이전 값과 기준일을 확인해 주세요.' : age > 3 ? '시세 업데이트가 지연되고 있습니다. 기준일을 확인해 주세요.' : '');
  const beginVR = (settings, source = '') => { setVrDraft({ assetId: asset.id, settings: Object.fromEntries(['lower', 'upper', 'invest', 'cashUseLimit'].map(key => [key, Number(settings[key])])) }); setVrSource(source); };
  const changeVR = (key, value) => setVrDraft({ assetId: asset.id, settings: { ...activeVrDraft, [key]: value } });
  const vrInvalid = activeVrDraft && (!['lower', 'upper', 'invest', 'cashUseLimit'].every(k => Number.isFinite(activeVrDraft[k])) || activeVrDraft.lower < 0 || activeVrDraft.lower >= activeVrDraft.upper || activeVrDraft.upper > 100 || activeVrDraft.invest <= 0 || activeVrDraft.invest > 100 || activeVrDraft.cashUseLimit < 0 || activeVrDraft.cashUseLimit > 100);
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
        <div className="stock-account-grid">{accounts.map(a => <section className={`stock-panel stock-account stock-ibs-account account-${a.label.toLowerCase()}`} key={a.profile.id}>
          <AccountHeader label={a.label} badge={a.result.stage?.name}><button type="button" aria-haspopup="dialog" aria-label={`${a.label} 전략표 열기`} onClick={() => setStrategyAccountId(a.profile.id)}><Table2 size={15} />전략표</button></AccountHeader>
          <div className="stock-inputs"><Field account={a.label} label="평단가" suffix="USD" value={a.position.average} onChange={average => savePosition(a.profile.id, { average })} /><Field account={a.label} label="보유 수량" suffix="주" step="1" value={a.position.held} onChange={held => savePosition(a.profile.id, { held })} /><Field account={a.label} label="추가 매수 가능" suffix="주" step="1" value={a.position.capacity} onChange={capacity => savePosition(a.profile.id, { capacity })} /></div>
          <Ratio ratio={a.result.ratio} label="현재 보유 비율" />
          <Orders result={a.result} />
        </section>)}</div>
        {strategyAccount && <StrategyDialog symbol={asset.symbol} onClose={closeStrategy}>
          <div className="stock-strategy-dialog-tabs"><div className="stock-tabs" role="tablist" aria-label="전략표 계좌">{accounts.map(account => <button key={account.profile.id} type="button" role="tab" aria-selected={account.profile.id === strategyAccountId} onClick={() => setStrategyAccountId(account.profile.id)}>{account.label} 계좌</button>)}</div>{strategyDraft && <span className="stock-badge">미리보기</span>}</div>
          <div className="stock-strategy-dialog-body"><Suspense fallback={<p className="stock-empty" role="status">전략표를 불러오는 중입니다.</p>}><StrategyTable asset={asset} stages={stages} account={strategyAccount}
          draft={strategyDraft}
          setDraft={next => setStrategyDraft({ assetId: asset.id, profileId: strategyAccount.profile.id, stages: next })}
          onEdit={() => setStrategyDraft({ assetId: asset.id, profileId: strategyAccount.profile.id, stages: editableStages(asset.stages) })}
          onCancel={() => setStrategyDraft(null)}
          onSave={() => { rememberConfig(); update(s => ({ ...s, assets: s.assets.map(a => a.id === asset.id ? { ...a, stages } : a) })); setStrategyDraft(null); setNotice('공통 매매 규칙을 저장했습니다.'); }} /></Suspense></div>
        </StrategyDialog>}
      </> : <>
        <section className={`stock-vr-cycle ${contributionWeek ? 'is-contribution' : 'is-rebalance'}`} aria-label="VR 주간 계획">
          <div className="stock-vr-cycle-title">
            <div className="stock-vr-cycle-meta"><span className="stock-vr-phase">{cycle?.start === currentCycle?.start ? '이번 주' : '선택 주'} · {contributionWeek ? '추가 주간' : '비율 조정 주간'}</span><span className="stock-vr-period">{cycle?.start.replaceAll('-', '.')} ~ {cycle?.end.replaceAll('-', '.')}</span></div>
            <h2>{contributionWeek ? <Wallet size={24} aria-hidden="true" /> : <SlidersHorizontal size={24} aria-hidden="true" />}{contributionWeek ? 'TQQQ 매수 · 현금 추가' : '현금 비중 확인 · 매수/매도 조정'}</h2>
            <small>다음 주: {contributionWeek ? '현금 비중 조정' : 'TQQQ 매수 · 현금 추가'}</small>
          </div>
          <div className="stock-vr-week-controls">
            <button title="이전 주" aria-label="VR 이전 주" onClick={() => d.shiftDate(-7)}><ChevronLeft size={17} /></button>
            <label className="stock-vr-date" title="날짜 선택"><time dateTime={d.selectedDate} aria-hidden="true">{d.selectedDate.replaceAll('-', '.')}</time><CalendarDays size={15} aria-hidden="true" /><input type="date" aria-label="VR 기준 날짜" value={d.selectedDate} onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }} onChange={e => d.setSelectedDate(e.target.value || todayKey())} /></label>
            <button title="다음 주" aria-label="VR 다음 주" onClick={() => d.shiftDate(7)}><ChevronRight size={17} /></button>
            <button onClick={() => d.setSelectedDate(todayKey())}>오늘</button>
          </div>
        </section>
        <section className="stock-panel stock-vr-settings"><div className="stock-section-heading"><h3>VR 설정</h3>{!activeVrDraft && !vrInfo.conflict && <button onClick={() => beginVR(vrInfo.settings)}><Pencil size={14} />편집</button>}{activeVrDraft && <span className="stock-badge">미리보기{vrSource && ` · ${vrSource} 기준`}</span>}</div>
          {vrInfo.conflict && !activeVrDraft ? <div className="stock-vr-conflict"><p>A·Y의 기존 설정이 다릅니다. 공통 기준을 선택하세요.</p>{vrInfo.legacy.map((entry, index) => <button key={entry.profileId} className={`account-${index === 0 ? 'a' : 'y'}`} onClick={() => beginVR(entry.settings, index === 0 ? 'A' : 'Y')}><strong>{index === 0 ? 'A' : 'Y'} 설정으로 시작</strong><span>하한 {entry.settings.lower}% · 상한 {entry.settings.upper}% · 현금 한도 {entry.settings.cashUseLimit}%</span><span>입금 현금 {100 - entry.settings.invest}% : TQQQ {entry.settings.invest}%</span></button>)}</div> : <>
            <div className="stock-vr-setting-groups">
              <div className="stock-vr-setting-group"><h4>현금 비중 범위</h4><div className="stock-vr-setting-fields">{[['lower', '하한'], ['upper', '상한']].map(([key, label]) => <SettingValue key={key} label={label} ariaLabel={`현금 비중 ${label}`} value={(activeVrDraft || vrInfo.settings)[key]} editing={!!activeVrDraft} onChange={value => changeVR(key, value)} />)}</div></div>
              <div className="stock-vr-setting-group stock-vr-limit"><h4>현금 사용 한도</h4><div className="stock-vr-setting-fields"><SettingValue label="비율 조정 시" ariaLabel="조정 시 현금 사용 한도" value={(activeVrDraft || vrInfo.settings).cashUseLimit} editing={!!activeVrDraft} onChange={value => changeVR('cashUseLimit', value)} /></div></div>
              <ContributionSplit invest={(activeVrDraft || vrInfo.settings).invest} editing={!!activeVrDraft} onChange={value => changeVR('invest', value)} />
            </div>
            {activeVrDraft && <div className="stock-edit-footer">{vrInvalid && <span role="status">0 ≤ 하한 &lt; 상한 ≤ 100, 현금 한도 0~100%, TQQQ 입금 비율 0 초과 100 이하</span>}<button onClick={() => { setVrDraft(null); setVrSource(''); }}>취소</button><button className="stock-primary" disabled={vrInvalid} onClick={() => { rememberConfig(); update(s => saveSharedVRSettings(s, asset.id, activeVrDraft)); setVrDraft(null); setVrSource(''); setNotice('저장했습니다.'); }}><Check size={14} />저장</button></div>}
          </>}
        </section>
        <div className="stock-account-grid">{accounts.map(a => <section className={`stock-panel stock-account stock-vr-account account-${a.label.toLowerCase()}`} key={a.profile.id}>
          <AccountHeader label={a.label} badge={activeVrDraft ? '미리보기' : vrInfo.conflict ? '기존 설정' : null} />
          <div className="stock-inputs">
            <Field account={a.label} label="원화 예수금" suffix="만원" scale={10000} value={a.position.krwCash} onChange={krwCash => savePosition(a.profile.id, { krwCash })} />
            <Field account={a.label} label="외화 예수금 · 원화 환산" suffix="만원" scale={10000} value={a.position.fxCash} onChange={fxCash => savePosition(a.profile.id, { fxCash })} />
            <Field account={a.label} label={`${asset.symbol} 보유 수량`} suffix="주" step="1" value={a.position.vrHeld ?? ''} onChange={vrHeld => savePosition(a.profile.id, { vrHeld })} />
          </div>
          <Valuation account={a.label} symbol={asset.symbol} position={a.position} result={a.vr} />
          <Ratio ratio={a.vr.ratio} label="현금 비중" />
          {a.vr.error ? <p className="stock-warning">{a.vr.error}</p> : <div className="stock-vr-result">
            <div><span className="stock-eyebrow">{contributionWeek ? '이번 적립 매수' : '비중 조절'}</span><div className="stock-vr-answer">{contributionWeek ? <>{number(Number(a.position.desired), 0)}<small>주 매수</small></> : a.vr.quantity > 0 ? <>{number(a.vr.quantity, 0)}<small>주 {a.vr.action}</small></> : a.vr.capped ? '매수 보류' : '유지'}</div>{!contributionWeek && a.vr.capped && <span className="stock-cash-limit-status">현금 {number(a.vr.cashUseLimit, 0)}% 한도 적용</span>}<p className="stock-hint">총 자산 {number(a.vr.total / 10000)}만원</p></div>
            <div><span className="stock-eyebrow">{contributionWeek ? '현금 포함 필요 입금액' : '현재 현금'}</span><div className="stock-vr-answer">{number((contributionWeek ? a.vr.deposit ?? NaN : a.vr.cash) / 10000, contributionWeek ? 0 : 2)}<small>만원</small></div>{!contributionWeek && <p className="stock-hint">매수에 사용할 수 있는 현금 {number(a.vr.cashBudget / 10000)}만원</p>}{contributionWeek && a.vr.depositError && <p className="stock-hint">{a.vr.depositError}</p>}</div>
          </div>}
          {contributionWeek && <SharePicker account={a.label} value={a.position.desired} onChange={desired => savePosition(a.profile.id, { desired })} />}
        </section>)}</div>
        <details className="stock-rule-details"><summary>VR 계산 기준</summary><p>2026.10.05 ~ 10.09는 TQQQ와 현금을 추가하는 주간, 다음 주는 현금 비중을 조정하는 주간입니다. 매주 번갈아 적용됩니다.</p><p>평가금 = VR 보유 수량 × 최근 정규장 종가 × 환율. 무한매수 보유 수량과는 별개입니다.</p><p>비중 조정 매수는 원화·원화 환산 외화 예수금을 합친 현금의 사용 한도 안에서 계산합니다. 기본 한도는 75%이며, 정수 수량은 이 한도를 초과하지 않도록 내림합니다. 매도나 추가 주간의 적립금에는 적용하지 않습니다.</p><p>입금 배분은 새 적립금을 현금과 TQQQ로 나누는 기준이며 전체 자산의 목표 현금 비중과는 다릅니다.</p><p>필요 입금액 = 지난주 종가 ${number(quote?.weeklyClose)} ({quote?.weeklyDate || '—'}) × 환율 ÷ 입금 TQQQ 비율. 1주 입금액을 만원 단위로 반올림한 뒤 수량을 곱합니다. 실제 주문이나 입금은 실행하지 않습니다.</p></details>
      </>}
    </> : <section className="stock-panel stock-empty">종목을 추가해 계산을 시작하세요.</section>}
  </div>;
}
