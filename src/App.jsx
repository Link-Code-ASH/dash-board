import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
  Cloud,
  CloudOff,
  CloudAlert,
} from "lucide-react";
import { DashboardProvider, useHubRuntime } from "./hub/context.jsx";
import { modules } from "./hub/registry.jsx";
import { navigationStrokeWidth } from "./hub/icons.jsx";
import { appBase, installedModule, useHubRoute } from "./hub/routing.js";

const SettingsView = React.lazy(() => import("./hub/views/Settings.jsx"));

class ModuleBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <section className="hub-error" role="alert">
          <h2>화면을 불러오지 못했습니다.</h2>
          <p>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>
            다시 시도
          </button>
        </section>
      );
    return this.props.children;
  }
}

function HubShell({ route, navigate }) {
  const { displayMode, gate, account, localSync } = useHubRuntime();
  const mobile = displayMode === "mobile";
  const standalone = installedModule();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("hub-sidebar-collapsed") === "true",
  );
  const lastRoute = useRef(
    route.module === "settings"
      ? { ...route, module: standalone || "flow" }
      : route,
  );
  const module = modules.find((item) => item.id === route.module) || modules[0];
  const settings = route.module === "settings";
  const toggleSettings = () =>
    settings
      ? navigate(lastRoute.current.module, lastRoute.current.section)
      : navigate("settings");
  useEffect(() => {
    if (!settings) lastRoute.current = route;
    document.title = `${settings ? "Settings" : module.name} · HUB`;
    window.scrollTo({ top: 0 });
  }, [route.module, route.section]);
  const Component = module.Component;
  const needsRecovery = Boolean(
    account.storageConflicts?.length ||
      account.mergeConflicts?.length ||
      localSync.storageConflicts?.length,
  );
  const syncFailed = account.localSaveFailed || /실패|failed|full|paused/i.test(account.status || "");
  const status = needsRecovery
    ? "복구 사본 있음"
    : syncFailed
      ? "동기화 확인 필요"
      : account.loading
        ? "연결 확인 중"
        : account.busy
          ? "동기화 중"
          : account.connected
            ? "동기화 연결됨"
            : "이 기기에 저장";
  return (
    <div
      className={`hub-app ${mobile ? "hub-mobile effective-display-mobile" : "hub-desktop"} ${collapsed ? "hub-sidebar-collapsed" : ""} ${standalone ? "hub-standalone" : ""}`}
    >
      {!mobile && !standalone && (
        <aside className="hub-sidebar" aria-label="HUB 탐색">
          <a
            className="hub-identity"
            href={`${appBase()}hub/#/flow`}
            onClick={(event) => {
              event.preventDefault();
              navigate("flow");
            }}
          >
            <img src={`${appBase()}app-logo-transparent.png`} alt="" />
            <strong>HUB</strong>
          </a>
          <button
            className="hub-collapse"
            title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
            aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
            onClick={() => {
              setCollapsed(!collapsed);
              localStorage.setItem("hub-sidebar-collapsed", String(!collapsed));
            }}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
          <nav aria-label="HUB 기능">
            {modules.map(({ id, name, icon: Icon }) => (
              <button
                key={id}
                title={name}
                aria-current={route.module === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={20} strokeWidth={navigationStrokeWidth} />
                <span>{name}</span>
              </button>
            ))}
          </nav>
          <div className="hub-sidebar-bottom">
            <span className="hub-connection" title={account.status || status}>
              {needsRecovery || syncFailed ? (
                <CloudAlert size={16} />
              ) : account.connected ? (
                <Cloud size={16} />
              ) : (
                <CloudOff size={16} />
              )}
              <span>{status}</span>
            </span>
            <button
              title="설정"
              aria-label="설정"
              aria-pressed={settings}
              onClick={toggleSettings}
            >
              <Settings size={20} />
              <span>Settings</span>
            </button>
          </div>
        </aside>
      )}
      <div className="hub-main">
        <header className="hub-topbar">
          <div className="hub-breadcrumb">
            {(mobile || standalone) && (
              <img src={`${appBase()}app-logo-transparent.png`} alt="HUB" />
            )}
            <span>HUB</span>
            <span className="hub-breadcrumb-divider">/</span>
            <strong>{settings ? "Settings" : module.name}</strong>
          </div>
          <div className="hub-top-actions">
            <span className="hub-connection" title={account.status || status}>
              {needsRecovery || syncFailed ? (
                <CloudAlert size={15} />
              ) : account.connected ? (
                <Cloud size={15} />
              ) : (
                <CloudOff size={15} />
              )}
              <span>{status}</span>
            </span>
            {standalone && (
              <a
                href={`${appBase()}hub/#/${module.id}`}
                title="HUB 열기"
                aria-label="HUB 열기"
              >
                <ArrowUpRight size={19} />
              </a>
            )}
            <button
              title="설정"
              aria-label="설정"
              aria-pressed={settings}
              onClick={toggleSettings}
            >
              <Settings size={19} />
            </button>
          </div>
        </header>
        <main
          className={
            route.module === "mindfold" && !gate
              ? "hub-mindfold-content"
              : "hub-content-modern"
          }
        >
          <ModuleBoundary key={gate ? "gate" : route.module}>
            <Suspense
              fallback={
                <div className="hub-loading" role="status">
                  불러오는 중…
                </div>
              }
            >
              {gate || settings ? (
                <SettingsView gate={gate} />
              ) : (
                <Component route={route} navigate={navigate} />
              )}
            </Suspense>
          </ModuleBoundary>
        </main>
      </div>
      {mobile && !standalone && (
        <nav className="hub-mobile-nav" aria-label="HUB 기능">
          {modules.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              aria-current={route.module === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={21} strokeWidth={navigationStrokeWidth} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function App() {
  const [route, navigate] = useHubRoute();
  const setDate = useCallback(
    (date) => navigate(route.module, route.section, date),
    [navigate, route.module, route.section],
  );
  return (
    <DashboardProvider date={route.date} setDate={setDate}>
      <HubShell route={route} navigate={navigate} />
    </DashboardProvider>
  );
}
