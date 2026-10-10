import React, { useState } from "react";
import { Download, ArrowUpRight } from "lucide-react";
import { useDashboardData } from "../context.jsx";
import { modules } from "../registry.jsx";
import { appBase } from "../routing.js";
import { useInstallPrompt } from "../pwa.js";
import {
  AccountSyncControls,
  DisplayModePanel,
  SyncPanel,
  SystemPanel,
} from "../../dashboard/components.jsx";
import { generateSyncIdValue, SYNC_ID_KEY, downloadTextFile } from "../../dashboard/model.js";
import { createRecoveryBundle } from "../../dashboard/recovery.js";

export default function Settings({ gate }) {
  const d = useDashboardData();
  const install = useInstallPrompt();
  const [recoveryLimit, setRecoveryLimit] = useState(10);
  const recoveries = d.listDashboardRecoveries();
  const accountProps = {
    account: d.account,
    onGoogleSignIn: d.signInWithGoogle,
    onGoogleSignOut: d.signOutOfGoogle,
    onAccountLoad: d.loadAccountData,
    onPrepareReplacement: d.prepareAccountReplacement,
    onAccountUpload: d.uploadAccountData,
    onAccountRefresh: d.pullAccountData,
    onAccountSave: d.pushAccountData,
    onAccountRecovery: d.downloadAccountRecovery,
  };
  if (gate)
    return (
      <section className="hub-login">
        <img src={`${appBase()}app-logo-transparent.png`} alt="HUB" />
        <h1>HUB</h1>
        <p>Google 계정으로 연결해주세요.</p>
        <AccountSyncControls {...accountProps} />
      </section>
    );
  return (
    <div className="hub-settings">
      <div className="hub-page-heading">
        <h1>Settings</h1>
      </div>
      <section className="hub-install-settings">
        <h2>앱 설치</h2>
        <p>
          {install.installed
            ? "설치한 앱으로 실행 중입니다."
            : "브라우저 메뉴에서 홈 화면에 추가할 수 있습니다."}
        </p>
        {install.available && (
          <button className="hub-install-button" onClick={install.install}>
            <Download size={17} />
            현재 앱 설치
          </button>
        )}
        <div className="hub-install-links">
          {[{ id: "hub", name: "HUB" }, ...modules].map((item) => (
            <a
              key={item.id}
              href={`${appBase()}${item.id}/#/${item.id === "hub" ? "flow" : item.id}`}
            >
              <span>{item.name}</span>
              <ArrowUpRight size={16} />
            </a>
          ))}
        </div>
      </section>
      <DisplayModePanel
        displayMode={d.data.displayMode}
        effectiveMode={d.effectiveDisplayMode}
        isOpen={d.openPanels.display}
        onChange={d.updateDisplayMode}
        onToggle={() => d.togglePanel("display")}
      />
      <SyncPanel
        {...accountProps}
        forgetThisDevice={d.forgetThisDevice}
        isOpen={d.openPanels.sync}
        onToggle={() => d.togglePanel("sync")}
        onConnect={d.connectSync}
        onGenerate={() => {
          const syncId = generateSyncIdValue();
          localStorage.setItem(SYNC_ID_KEY, syncId);
          d.updateSync((current) => ({ ...current, syncId }));
        }}
        onPull={() => d.pullSyncData({ force: true })}
        onPush={() => d.pushSyncData()}
        setSync={d.updateSync}
        sync={d.sync}
        syncReady={d.syncBackendReady() && Boolean(d.sync.syncId && d.sync.pin)}
      />
      <SystemPanel
        copyBackup={d.copyBackup}
        exportBackup={d.exportBackup}
        importBackup={d.importBackup}
        isOpen={d.openPanels.system}
        onToggle={() => d.togglePanel("system")}
      />
      <button className="hub-install-button" onClick={() => downloadTextFile(
        `hub-recovery-records-${Date.now()}.json`,
        JSON.stringify(createRecoveryBundle(localStorage, d.account.user?.id, d.data), null, 2),
      )}>
        <Download size={17} />복구 기록 전체 저장
      </button>
      {recoveries.length > 0 && (
        <details className="hub-recoveries">
          <summary>복구 사본 ({recoveries.length})</summary>
          {recoveries.slice(0, recoveryLimit).map((item) => (
            <div className="hub-recovery-row" key={item.key}>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString("ko-KR")}
              </time>
              <div>
                {item.versions.map((version) => (
                  <button
                    key={version}
                    onClick={() =>
                      d.downloadDashboardRecovery(item.key, version)
                    }
                  >
                    <Download size={15} />
                    {version === "local" ? "기기 사본" : "상대 사본"}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {recoveries.length > recoveryLimit && (
            <button onClick={() => setRecoveryLimit(recoveryLimit + 10)}>
              더 보기
            </button>
          )}
        </details>
      )}
    </div>
  );
}
