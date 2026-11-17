import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Eraser, Expand, Eye, EyeOff, Hand, LocateFixed, Minus, Plus, RotateCcw, RotateCw, Sprout, Trash2, X,
} from "lucide-react";
import NestProvider, { useNest } from "./NestProvider.jsx";
import {
  ACCESSORIES, FLOORS, HERO_ID, LOOKS, LOOK_KEYS, LAND_ID, LAND_MAX, LAND_STEP, OBJECTS, WALLS, accessoryInfo,
  canPlace, edgeInside, expandCost, findHero, findLand, floorInfo, footprint, formatDuration, geneLabel,
  heroCandidates, lookOf, lookValue, newHero, newLand, newObject, objectInfo, objectTiles, objects as placedObjects, seedBalance, seedsPerHour,
  wallInfo, SEED_EVERY_MS,
} from "./model.js";
import "./nest.css";

const SEX = { f: "♀", m: "♂" };
const stamp = (item) => ({ ...item, updatedAt: new Date().toISOString() });

function useClock(interval = 15000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return Date.now();
}

// A rendered 3D portrait; a plain skin-coloured dot stands in for the moment it takes to draw.
function Avatar({ hero, size = 30 }) {
  const look = lookOf(hero);
  const [url, setUrl] = useState("");
  const key = `${JSON.stringify(look)}|${hero.genes?.size}|${hero.accessory || "none"}`;
  useEffect(() => {
    let live = true;
    import("./portrait.js").then(({ portraitOf }) => portraitOf({ ...hero, look })).then((url) => { if (live) setUrl(url); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  if (url) return <img className="ns-portrait" src={url} width={size} height={size} alt="" aria-hidden="true" />;
  return <span className="ns-avatar" style={{ "--c": lookValue("skin", look.skin).hex, width: size, height: size }} aria-hidden="true"><i /><i /></span>;
}
const Cost = ({ value, sign = "" }) => <span className="ns-cost"><Sprout size={12} />{sign}{value}</span>;
const COLOR_KEYS = new Set(["skin", "hairColor", "outfitColor"]);

// Hair, clothes and the rest can be changed freely at any time.
function LookEditor({ hero, onChange }) {
  const look = lookOf(hero);
  const set = (key, id) => onChange(HERO_ID, (item) => ({ ...item, look: { ...lookOf(item), [key]: id } }));
  return (
    <div className="ns-look">
      {LOOK_KEYS.map((key) => (
        <div className="ns-look-row" key={key}>
          <span className="ns-look-key">{LOOKS[key].label}</span>
          <div className={COLOR_KEYS.has(key) ? "ns-swatches" : "ns-chips"}>
            {LOOKS[key].values.map((option) => COLOR_KEYS.has(key)
              ? <button key={option.id} className="ns-dot" style={{ "--c": option.hex }} aria-pressed={look[key] === option.id}
                  aria-label={option.label} title={option.label} onClick={() => set(key, option.id)} />
              : <button key={option.id} className="ns-chip" aria-pressed={look[key] === option.id} onClick={() => set(key, option.id)}>{option.label}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stage({ data, tool, wallsLow, selectedId, handlers, ready }) {
  const host = useRef(null);
  const world = useRef(null);
  const latest = useRef({});
  latest.current = handlers;
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    import("./world.js").then(({ World }) => {
      if (disposed || !host.current) return;
      try {
        const relay = (name) => (...args) => latest.current[name]?.(...args);
        world.current = new World(host.current, Object.fromEntries(
          ["onSelect", "onPlace", "onPaint", "onWalls", "onErase", "onMove", "canPlace"].map((name) => [name, relay(name)])));
        world.current.setTool(tool);
        world.current.setWallsLow(wallsLow);
        world.current.setData(data);
        world.current.select(selectedId);
      } catch {
        setError("이 기기에서는 3D 화면을 열 수 없습니다.");
      }
    }).catch(() => setError("화면을 불러오지 못했습니다."));
    return () => { disposed = true; world.current?.dispose(); world.current = null; };
  }, []);
  useEffect(() => { world.current?.setData(data); }, [data]);
  useEffect(() => { world.current?.setTool(tool); }, [tool]);
  useEffect(() => { world.current?.setWallsLow(wallsLow); }, [wallsLow]);
  useEffect(() => { world.current?.select(selectedId); }, [selectedId]);
  const call = (name, ...args) => world.current?.[name](...args);
  return (
    <div className="ns-stage-wrap">
      <div className="ns-stage" ref={host} />
      {error && <p className="ns-stage-error">{error}</p>}
      {ready && (
        <div className="ns-view-tools">
          <button onClick={() => call("rotateView", -1)} aria-label="왼쪽으로 돌리기" title="왼쪽으로 돌리기"><RotateCcw size={16} /></button>
          <button onClick={() => call("rotateView", 1)} aria-label="오른쪽으로 돌리기" title="오른쪽으로 돌리기"><RotateCw size={16} /></button>
          <button onClick={() => call("zoomBy", 1.25)} aria-label="확대" title="확대"><Plus size={16} /></button>
          <button onClick={() => call("zoomBy", 0.8)} aria-label="축소" title="축소"><Minus size={16} /></button>
          <button onClick={() => call("recenter")} aria-label="가운데로" title="가운데로"><LocateFixed size={16} /></button>
          <button onClick={handlers.toggleWalls} aria-pressed={wallsLow} aria-label="벽 낮추기" title={wallsLow ? "벽 세우기" : "벽 낮추기 (집 안 보기)"}>
            {wallsLow ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      )}
    </div>
  );
}

function HeroChooser({ owner, onPick }) {
  const candidates = useMemo(() => heroCandidates(owner), [owner]);
  const [index, setIndex] = useState(0);
  const [name, setName] = useState(candidates[0].name);
  const choose = (next) => { setIndex(next); setName(candidates[next].name); };
  return (
    <div className="ns-chooser">
      <h2>함께 살 주인공을 골라주세요</h2>
      <div className="ns-candidates">
        {candidates.map((candidate, i) => (
          <button key={i} className="ns-candidate" aria-pressed={index === i} onClick={() => choose(i)}>
            <Avatar hero={candidate} size={96} />
            <span className="ns-candidate-name">{candidate.name} <span className={`ns-sex ns-sex-${candidate.sex}`}>{SEX[candidate.sex]}</span></span>
            <span className="ns-candidate-traits">
              {[LOOKS.hair.values, LOOKS.outfit.values].map((values, i) => values.find((value) => value.id === candidate.look[i ? "outfit" : "hair"])?.label)
                .concat(geneLabel("mood", candidate.genes.mood)).join(" · ")}
            </span>
          </button>
        ))}
      </div>
      <label className="ns-field">
        <span>이름</span>
        <input value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
      </label>
      <button className="ns-btn ns-btn-main ns-wide" onClick={() => onPick({ ...candidates[index], name })}>이 친구와 시작하기</button>
    </div>
  );
}

function HeroPanel({ hero, balance, onChange }) {
  const [name, setName] = useState(hero.name);
  useEffect(() => setName(hero.name), [hero.name]);
  const current = accessoryInfo(hero.accessory).cost;
  const saveName = () => {
    const next = name.trim().slice(0, 20);
    if (next && next !== hero.name) onChange(HERO_ID, (item) => ({ ...item, name: next }));
    else setName(hero.name);
  };
  return (
    <div className="ns-detail">
      <div className="ns-detail-head">
        <Avatar hero={hero} size={56} />
        <input className="ns-name" value={name} maxLength={20} aria-label="이름" onChange={(event) => setName(event.target.value)}
          onBlur={saveName} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        <span className={`ns-sex ns-sex-${hero.sex}`}>{SEX[hero.sex]}</span>
      </div>
      <p className="ns-meta">성격 · {geneLabel("mood", hero.genes.mood)}</p>
      <LookEditor hero={hero} onChange={onChange} />
      <h4 className="ns-sub">꾸미기</h4>
      <div className="ns-chips">
        {ACCESSORIES.map((option) => (
          <button key={option.id} className="ns-chip" aria-pressed={hero.accessory === option.id}
            disabled={balance + current < option.cost && hero.accessory !== option.id}
            onClick={() => onChange(HERO_ID, (item) => ({ ...item, accessory: option.id }))}>
            {option.label}{option.cost > 0 && <Cost value={option.cost} />}
          </button>
        ))}
      </div>
      <p className="ns-note">{hero.name}은(는) 땅을 돌아다니며 {SEED_EVERY_MS / 60000}분마다 씨앗을 하나씩 찾아요.</p>
    </div>
  );
}

function ToolButton({ active, onClick, children, disabled, title }) {
  return <button className="ns-tool" aria-pressed={active} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

function BuildPanel({ group, tool, setTool, balance, land, selected, onRotateSelected, onRemoveSelected }) {
  const is = (mode, key, value) => tool.mode === mode && (!key || tool[key] === value);
  const pick = (next) => setTool(is(next.mode, Object.keys(next)[1], Object.values(next)[1]) ? { mode: "move" } : next);
  return (
    <div className="ns-build">
      {selected && (
        <div className="ns-selected">
          <span className="ns-row-name">{objectInfo(selected.type)?.label}</span>
          <button className="ns-btn" onClick={onRotateSelected}><RotateCw size={14} />돌리기</button>
          <button className="ns-btn" onClick={onRemoveSelected}><Trash2 size={14} />치우기 <Cost value={selected.cost} sign="+" /></button>
        </div>
      )}
      <div className="ns-tool-row">
        <ToolButton active={is("move")} onClick={() => setTool({ mode: "move" })} title="눌러서 고르고, 끌어서 옮기기"><Hand size={15} />고르기·옮기기</ToolButton>
        <ToolButton active={is("erase")} onClick={() => setTool({ mode: "erase" })} title="물건, 벽, 바닥 지우기"><Eraser size={15} />지우기</ToolButton>
      </div>
      {group === "home" && (
        <>
          <h4 className="ns-sub">벽 <span className="ns-sub-hint">칸 사이 선을 따라 끌어서 세워요</span></h4>
          <div className="ns-grid ns-grid-3">
            {WALLS.map((wall) => (
              <ToolButton key={wall.id} active={is("wall", "wall", wall.id)} disabled={balance < wall.cost}
                onClick={() => pick({ mode: "wall", wall: wall.id })}>{wall.label}<Cost value={wall.cost} /></ToolButton>
            ))}
          </div>
        </>
      )}
      <h4 className="ns-sub">바닥 <span className="ns-sub-hint">눌러서 칠하고, 끌어서 넓게 칠해요</span></h4>
      <div className="ns-grid ns-grid-3">
        {FLOORS.filter((floor) => floor.group === group || floor.id === "grass").map((floor) => (
          <ToolButton key={floor.id} active={is("floor", "floor", floor.id)} disabled={balance < floor.cost}
            onClick={() => pick({ mode: "floor", floor: floor.id })}>
            <span className="ns-floor-swatch" style={{ background: floor.color }} />{floor.label}{floor.cost > 0 && <Cost value={floor.cost} />}
          </ToolButton>
        ))}
      </div>
      <h4 className="ns-sub">{group === "home" ? "가구" : "마당 꾸미기"} <span className="ns-sub-hint">고르고 놓을 칸을 눌러요</span></h4>
      <div className="ns-grid ns-grid-3">
        {OBJECTS.filter((object) => object.group === group).map((object) => (
          <ToolButton key={object.id} active={is("place", "type", object.id)} disabled={balance < object.cost}
            onClick={() => pick({ mode: "place", type: object.id, rot: 0 })}
            title={`${object.size[0]}×${object.size[1]}칸${object.yield ? ` · 시간당 씨앗 +${object.yield}` : ""}`}>
            {object.label}<Cost value={object.cost} />
            {object.yield && <span className="ns-yield">+{object.yield}/h</span>}
          </ToolButton>
        ))}
      </div>
      <p className="ns-note">땅 {land.size}×{land.size}칸 · 열매를 맺는 물건(나무, 텃밭 등)은 시간마다 씨앗을 더 만들어요.</p>
    </div>
  );
}

function LandPanel({ land, items, balance, onExpand }) {
  const cost = expandCost(land.size);
  const max = land.size >= LAND_MAX;
  const rate = seedsPerHour(items);
  const counts = placedObjects(items).reduce((map, item) => map.set(item.type, (map.get(item.type) || 0) + 1), new Map());
  return (
    <div className="ns-land">
      <div className="ns-land-size"><b>{land.size}×{land.size}</b><span>칸</span></div>
      <button className="ns-btn ns-btn-main ns-wide" disabled={max || balance < cost} onClick={onExpand}>
        <Expand size={15} />{max ? "가장 큰 땅이에요" : <>땅 넓히기 ({land.size + LAND_STEP}×{land.size + LAND_STEP}) <Cost value={cost} /></>}
      </button>
      {!max && balance < cost && <p className="ns-meta">씨앗이 {cost - balance}개 더 필요해요 · 지금 속도로 약 {formatDuration(((cost - balance) / Math.max(1, rate)) * 3600000)}</p>}
      <h4 className="ns-sub">씨앗 모으는 속도</h4>
      <p className="ns-rate"><Sprout size={14} />시간당 <b>{rate}</b>개</p>
      {counts.size > 0 && (
        <ul className="ns-counts">
          {[...counts].map(([type, count]) => <li key={type}>{objectInfo(type)?.label} <b>{count}</b></li>)}
        </ul>
      )}
    </div>
  );
}

function NestRoom() {
  const { items, ready, settled, status, changeMany, userId } = useNest();
  const now = useClock();
  const [tab, setTab] = useState("hero");
  const [tool, setTool] = useState({ mode: "look" });
  const [wallsLow, setWallsLow] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const hero = findHero(items);
  const land = findLand(items);
  const balance = seedBalance(items, now);
  const list = useMemo(() => placedObjects(items), [items]);
  const data = useMemo(() => ({ land, objects: list, hero }), [land, list, hero]);
  const selected = list.find((item) => item.id === selectedId) || null;

  const save = async (changes) => {
    setError("");
    try { await changeMany(changes.map(({ id, transform }) => ({ id, transform: (item) => stamp(transform(item)) }))); }
    catch (failure) { setError(failure.message || "저장하지 못했습니다."); }
  };
  const change = (id, transform) => save([{ id, transform }]);
  const changeLand = (transform) => change(LAND_ID, transform);
  const short = (cost) => { if (cost > balance) { setError(`씨앗이 ${cost - balance}개 모자라요.`); return true; } return false; };

  // Tool follows the tab: build tabs edit, the others just look.
  useEffect(() => {
    setTool(tab === "yard" || tab === "home" ? { mode: "move" } : { mode: "look" });
    if (tab === "home") setWallsLow(true);
  }, [tab]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea")) return;
      if (event.key === "Escape") setTool((current) => current.mode === "look" ? current : { mode: "move" });
      if ((event.key === "r" || event.key === "R") && tool.mode === "place") setTool((current) => ({ ...current, rot: ((current.rot || 0) + 1) & 3 }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool.mode]);

  const handlers = {
    toggleWalls: () => setWallsLow((value) => !value),
    canPlace: (type, x, z, rot, ignoreId) => canPlace(items, land, type, x, z, rot, ignoreId),
    onSelect: (hit) => {
      if (hit?.kind === "hero") { setTab("hero"); setSelectedId(null); return; }
      if (hit?.kind === "object") {
        const item = list.find((value) => value.id === hit.id);
        if (item && tab !== "yard" && tab !== "home") setTab(objectInfo(item.type)?.group === "home" ? "home" : "yard");
        setSelectedId(hit.id);
        return;
      }
      setSelectedId(null);
    },
    onPlace: (x, z) => {
      const rot = tool.rot || 0;
      if (!canPlace(items, land, tool.type, x, z, rot)) { setError("여기에는 놓을 수 없어요."); return; }
      if (short(objectInfo(tool.type).cost)) return;
      const object = newObject(tool.type, x, z, rot);
      void save([{ id: object.id, transform: () => object }]);
    },
    onPaint: (keys) => {
      const floor = tool.floor;
      const taken = new Set(placedObjects(items).flatMap((item) => objectTiles(item).map(([x, z]) => `${x},${z}`)));
      // Water cannot go under things.
      const changed = keys.filter((key) => (land.floors[key] || "grass") !== floor && !(floorInfo(floor).blocks && taken.has(key)));
      if (!changed.length) return;
      const delta = changed.reduce((sum, key) => sum + floorInfo(floor).cost - floorInfo(land.floors[key]).cost, 0);
      if (short(delta)) return;
      void changeLand((item) => {
        const floors = { ...item.floors };
        for (const key of changed) { if (floor === "grass") delete floors[key]; else floors[key] = floor; }
        return { ...item, floors };
      });
    },
    onWalls: (edges) => {
      const type = tool.wall;
      const changed = edges.filter((edge) => edgeInside(edge, land.size) && land.walls[edge] !== type);
      if (!changed.length) return;
      const delta = changed.reduce((sum, edge) => sum + wallInfo(type).cost - (wallInfo(land.walls[edge])?.cost || 0), 0);
      if (short(delta)) return;
      void changeLand((item) => ({ ...item, walls: { ...item.walls, ...Object.fromEntries(changed.map((edge) => [edge, type])) } }));
    },
    onErase: (target) => {
      if (target.kind === "object") { void change(target.id, (item) => ({ ...item, deletedAt: new Date().toISOString() })); if (selectedId === target.id) setSelectedId(null); }
      if (target.kind === "wall") void changeLand((item) => { const walls = { ...item.walls }; delete walls[target.key]; return { ...item, walls }; });
      if (target.kind === "floor" && land.floors[target.key]) void changeLand((item) => { const floors = { ...item.floors }; delete floors[target.key]; return { ...item, floors }; });
    },
    onMove: (id, x, z) => change(id, (item) => ({ ...item, x, z })),
  };

  const rotateSelected = () => {
    if (!selected) return;
    const rot = (selected.rot + 1) & 3;
    if (!canPlace(items, land, selected.type, selected.x, selected.z, rot, selected.id)) { setError("돌릴 자리가 없어요."); return; }
    void change(selected.id, (item) => ({ ...item, rot }));
  };
  const removeSelected = () => { handlers.onErase({ kind: "object", id: selected.id }); };
  const expand = () => {
    if (short(expandCost(land.size))) return;
    void changeLand((item) => ({ ...item, size: Math.min(LAND_MAX, item.size + LAND_STEP) }));
  };
  const start = (choice) => {
    const heroItem = newHero(choice);
    const landItem = newLand();
    void save([{ id: HERO_ID, transform: (item) => item || heroItem }, { id: LAND_ID, transform: (item) => item || landItem }]);
  };

  const needsStart = settled && (!hero || !land);
  const rate = seedsPerHour(items);
  const placing = tool.mode === "place";

  return (
    <div className="ns-room">
      <header className="ns-head">
        <h1 className="ns-title">Nest</h1>
        {hero && <span className="ns-hero-chip"><Avatar hero={hero} size={30} />{hero.name}</span>}
        <span className="ns-spacer" />
        {land && <span className="ns-pill">{land.size}×{land.size}칸</span>}
        <span className="ns-seeds" title={`시간당 ${rate}개`}><Sprout size={15} /><b>{Math.max(0, balance)}</b></span>
      </header>
      {error && <p className="ns-error" role="alert">{error}<button className="ns-icon" onClick={() => setError("")} aria-label="닫기"><X size={14} /></button></p>}
      <div className={`ns-layout${hero && land ? "" : " is-solo"}`}>
        <div className="ns-stage-col">
          {land ? (
            <Stage data={data} tool={tool} wallsLow={wallsLow} selectedId={selectedId} handlers={handlers} ready={!!land} />
          ) : <div className="ns-stage-wrap ns-stage-empty">{!ready && <p className="ns-loading">{status}</p>}</div>}
          {placing && (
            <div className="ns-hint">
              <span>{objectInfo(tool.type)?.label} · {footprint(tool.type, tool.rot || 0).join("×")}칸</span>
              <button className="ns-btn" onClick={() => setTool((current) => ({ ...current, rot: ((current.rot || 0) + 1) & 3 }))}><RotateCw size={14} />돌리기</button>
              <button className="ns-btn" onClick={() => setTool({ mode: "move" })}>그만 놓기</button>
            </div>
          )}
          {needsStart && <HeroChooser owner={userId || "local"} onPick={start} />}
        </div>
        {hero && land && (
          <aside className="ns-panel">
            <div className="ns-tabs" role="tablist">
              {[["hero", "주인공"], ["yard", "마당"], ["home", "집"], ["land", "땅"]].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            <div className="ns-panel-body">
              {tab === "hero" && <HeroPanel hero={hero} balance={balance} onChange={change} />}
              {(tab === "yard" || tab === "home") && (
                <BuildPanel group={tab} tool={tool} setTool={setTool} balance={balance} land={land}
                  selected={selected} onRotateSelected={rotateSelected} onRemoveSelected={removeSelected} />
              )}
              {tab === "land" && <LandPanel land={land} items={items} balance={balance} onExpand={expand} />}
            </div>
            <p className="ns-status">{status}</p>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function Nest() {
  return <NestProvider><NestRoom /></NestProvider>;
}
