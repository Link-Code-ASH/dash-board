const env = import.meta.env || {};
export const googleConfigured = Boolean(env.VITE_GOOGLE_CLIENT_ID && env.VITE_GOOGLE_PICKER_API_KEY && env.VITE_GOOGLE_APP_ID);
const scope = "https://www.googleapis.com/auth/drive.file";
let token = null, expires = 0, generation = 0, loading;
let cancelPending = null;
const scripts = new Map();

export function clearGoogleToken() {
  token = null; expires = 0; generation++;
  cancelPending?.(); cancelPending = null;
}

function loadScript(src, available) {
  if (available()) return Promise.resolve();
  if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => fail(), 15000);
    const fail = () => { clearTimeout(timer); script.remove(); scripts.delete(src); reject(new Error("Google 연결을 불러오지 못했습니다. 네트워크를 확인해 주세요.")); };
    script.src = src; script.async = true;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = fail;
    document.head.append(script);
  }));
  return scripts.get(src);
}

export function prepareGoogle() {
  if (!googleConfigured) return Promise.reject(new Error("Google 시트 연결 설정이 필요합니다. 파일 업로드는 바로 사용할 수 있습니다."));
  if (!loading) loading = Promise.all([
    loadScript("https://accounts.google.com/gsi/client", () => window.google?.accounts?.oauth2),
    loadScript("https://apis.google.com/js/api.js", () => window.gapi),
  ]).then(() => new Promise((resolve, reject) => {
    window.gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("파일 선택기를 불러오지 못했습니다.")),
      timeout: 15000, ontimeout: () => reject(new Error("파일 선택기 연결 시간이 초과되었습니다.")) });
  })).catch((error) => { loading = null; throw error; });
  return loading;
}

// Must be called directly from a user click, after prepareGoogle has completed.
function authorize() {
  if (token && Date.now() < expires) return Promise.resolve(token);
  const epoch = generation;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); cancelPending = null; error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("Google 연결 시간이 초과되었습니다. 다시 시도해 주세요.")), 120000);
    cancelPending = () => finish(new Error("Google 연결을 취소했습니다."));
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: env.VITE_GOOGLE_CLIENT_ID, scope, include_granted_scopes: false,
      error_callback: () => finish(new Error("Google 연결을 취소했거나 팝업이 차단되었습니다.")),
      callback: (response) => {
        if (settled) return;
        if (epoch !== generation) return finish(new Error("계정이 변경되었습니다."));
        if (response.error || !window.google.accounts.oauth2.hasGrantedAllScopes(response, scope))
          return finish(new Error("선택한 구글 시트에 대한 접근 권한이 필요합니다."));
        token = response.access_token; expires = Date.now() + Number(response.expires_in || 3600) * 1000 - 60000;
        finish(null, token);
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function get(path, accessToken, signal) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, signal,
  });
  if (response.status === 401) { clearGoogleToken(); throw new Error("Google 연결이 만료되었습니다. 다시 연결해 주세요."); }
  if (response.status === 403 || response.status === 404) throw new Error("구글 시트 접근 권한을 확인하고 파일을 다시 선택해 주세요.");
  if (!response.ok) throw new Error("구글 시트를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return response.json();
}

export async function openGoogleSheet(previousSource, signal) {
  const epoch = generation;
  const accessToken = await authorize();
  if (signal.aborted || epoch !== generation) throw new Error("가져오기를 취소했습니다.");
  const documentId = previousSource?.documentId || await new Promise((resolve, reject) => {
    let settled = false;
    const pickerApi = window.google.picker;
    const view = new pickerApi.DocsView(pickerApi.ViewId.SPREADSHEETS)
      .setMimeTypes("application/vnd.google-apps.spreadsheet");
    const finish = (id, error) => {
      if (settled) return;
      settled = true;
      picker.setVisible(false); picker.dispose(); signal.removeEventListener("abort", cancel);
      cancelPending = null;
      error ? reject(error) : resolve(id);
    };
    const cancel = () => finish(null, new Error("가져오기를 취소했습니다."));
    const picker = new pickerApi.PickerBuilder().setDeveloperKey(env.VITE_GOOGLE_PICKER_API_KEY)
      .setAppId(env.VITE_GOOGLE_APP_ID).setOAuthToken(accessToken).setOrigin(window.location.origin)
      .setLocale("ko").addView(view).setCallback((result) => {
        if (result.action === pickerApi.Action.PICKED) finish(result.docs[0].id);
        else if (result.action === pickerApi.Action.CANCEL) cancel();
      }).build();
    signal.addEventListener("abort", cancel, { once: true }); cancelPending = cancel;
    picker.setVisible(true);
  });
  if (signal.aborted || epoch !== generation) throw new Error("가져오기를 취소했습니다.");
  const metadata = await get(`${encodeURIComponent(documentId)}?fields=properties(title),sheets(properties(sheetId,title,sheetType))`, accessToken, signal);
  return {
    name: metadata.properties.title, documentId,
    sheets: metadata.sheets.filter((s) => s.properties.sheetType === "GRID").map(({ properties }) => ({
      name: properties.title, sheetId: properties.sheetId,
      async read(readSignal) {
        if (epoch !== generation || Date.now() >= expires) throw new Error("Google 연결이 만료되었습니다. 다시 연결해 주세요.");
        const range = `'${properties.title.replaceAll("'", "''")}'`;
        const result = await get(`${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`, accessToken, readSignal);
        return result.values || [];
      },
    })),
  };
}
