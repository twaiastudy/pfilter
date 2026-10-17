// 在頁面環境(MAIN world)執行:攔截 fetch / XHR,抓出實際送出的 prompt 與上傳檔案
(() => {
  if (window.__pvInstalled) return;
  window.__pvInstalled = true;

  const debug = (...args) => {
    try { console.info('[Prompt Filter][inject]', ...args); } catch (_) {}
  };
  const debugState = (window.__pvDebug ||= { events: [] });
  const pushDebug = (type, data = {}) => {
    const entry = { type, ts: Date.now(), ...data };
    debugState.events.push(entry);
    debugState.last = entry;
    debug(type, data);
  };

  const host = location.hostname.toLowerCase();
  const SITE = host.includes('claude') ? 'claude'
    : host.includes('gemini') ? 'gemini'
    : host.includes('notebook') ? 'notebook'
    : 'chatgpt';
  debugState.site = SITE;
  debugState.href = location.href;
  pushDebug('init', { site: SITE, href: location.href });
  const MAX_FILE_BYTES = 30 * 1024 * 1024; // 超過就只記錄 metadata
  const pendingNames = []; // ChatGPT 先送檔名、再 PUT 檔案內容,用大小配對

  const emit = (msg) => {
    try {
      pushDebug('emit', { kind: msg && msg.kind, site: msg && msg.site, endpoint: msg && msg.endpoint });
      window.postMessage({ __pv: true, msg }, location.origin);
    } catch (e) {
      pushDebug('emit-failed', { error: String(e) });
    }
  };
  const toURL = (u) => { try { return new URL(u, location.href); } catch (_) { return null; } };

  function isPromptEndpoint(u, method) {
    if (method !== 'POST') return false;
    const p = u.pathname;
    if (SITE === 'chatgpt') return /\/backend-(api|anon)\/(f\/)?conversation$/.test(p);
    if (SITE === 'claude') return /\/chat_conversations\/[^/]+\/(retry_)?completion$/.test(p);
    if (SITE === 'gemini') {
      return (u.hostname === 'geminiweb-pa.clients6.google.com' && /\/processSession$/.test(p)) ||
        /\/StreamGenerate$/.test(p);
    }
    if (SITE === 'notebook') return /\/GenerateFreeFormStreamed$/.test(p);
    return false;
  }

  function isUploadEndpoint(u, method) {
    if (method !== 'POST' && method !== 'PUT') return false;
    const h = u.hostname, p = u.pathname;
    if (SITE === 'chatgpt') {
      return /\/backend-api\/files/.test(p) ||
             /oaiusercontent\.com$|blob\.core\.windows\.net$/.test(h);
    }
    return /\/upload/.test(p) || /\/files(\/|$)/.test(p);
  }

  const toDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  function readVarint(b, pos) {
    let result = 0, shift = 0;
    while (pos < b.length && shift <= 49) {
      const byte = b[pos++];
      result += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return [result, pos];
      shift += 7;
    }
    return null;
  }

  // 從 protobuf 位元組中取出指定編號的 length-delimited 欄位;格式不符回傳 null
  function protoField(b, fieldNo) {
    let pos = 0;
    while (pos < b.length) {
      const tag = readVarint(b, pos);
      if (!tag) return null;
      pos = tag[1];
      const no = Math.floor(tag[0] / 8), wt = tag[0] % 8;
      if (wt === 0) {
        const v = readVarint(b, pos);
        if (!v) return null;
        pos = v[1];
      } else if (wt === 1) pos += 8;
      else if (wt === 5) pos += 4;
      else if (wt === 2) {
        const len = readVarint(b, pos);
        if (!len) return null;
        const start = len[1], end = start + len[0];
        if (end > b.length) return null;
        if (no === fieldNo) return b.subarray(start, end);
        pos = end;
      } else return null;
    }
    return null;
  }

  // Gemini 網頁版:XHR POST geminiweb-pa.clients6.google.com/v1/processSession,
  // body 為 reqN___data__=<base64 protobuf>,prompt 在欄位 2 → 9 → 1
  function extractGeminiSessionPrompt(bodyStr) {
    const params = new URLSearchParams(bodyStr);
    for (const [k, v] of params) {
      if (!/^req\d+___data__$/.test(k)) continue;
      let cur;
      try { cur = Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)); } catch (_) { continue; }
      for (const f of [2, 9, 1]) cur = cur && protoField(cur, f);
      if (cur && cur.length) {
        try { return new TextDecoder('utf-8', { fatal: true }).decode(cur); } catch (_) {}
      }
    }
    return '';
  }

  // 舊版 batchexecute 格式:f.req=[null,"[[\"prompt\",...],...]"]
  function extractFreqPrompt(bodyStr) {
    try {
      const outer = JSON.parse(new URLSearchParams(bodyStr).get('f.req') || 'null');
      const inner = JSON.parse(outer[1]);
      if (inner && Array.isArray(inner[0]) && typeof inner[0][0] === 'string') return inner[0][0];
      if (inner && typeof inner[1] === 'string') return inner[1];
    } catch (_) {}
    return '';
  }

  function emitPrompt(u, bodyStr) {
    let json = null;
    try { json = JSON.parse(bodyStr); } catch (_) {}
    let text = '';
    let attachments = [];
    let model = '';
    if (json) {
      model = json.model || '';
      if (SITE === 'claude') {
        text = json.prompt || '';
        attachments = (json.attachments || []).map((a) => ({
          file_name: a.file_name, file_type: a.file_type,
          file_size: a.file_size, extracted_content: a.extracted_content
        }));
        if (json.files && json.files.length) attachments.push({ files: json.files });
      } else if (SITE === 'gemini' || SITE === 'notebook') {
        return; // Gemini / Notebook 的 prompt 請求不是 JSON
      } else {
        const msgs = json.messages || [];
        text = msgs.map((m) => {
          const parts = (m && m.content && m.content.parts) || [];
          return parts.map((p) => {
            if (typeof p === 'string') return p;
            if (p && p.text) return p.text;
            if (p && p.asset_pointer) return `[${p.content_type || 'asset'}: ${p.asset_pointer}]`;
            return '';
          }).filter(Boolean).join('\n');
        }).filter(Boolean).join('\n\n');
        attachments = msgs.flatMap((m) => (m && m.metadata && m.metadata.attachments) || []);
      }
    } else if (SITE === 'gemini') {
      text = /\/processSession$/.test(u.pathname) ? extractGeminiSessionPrompt(bodyStr) : extractFreqPrompt(bodyStr);
    } else if (SITE === 'notebook') {
      text = extractFreqPrompt(bodyStr);
    }
    if (!text && !attachments.length) return; // 例如 regenerate,沒有新內容
    emit({
      kind: 'prompt', ts: Date.now(), site: SITE, model,
      endpoint: u.pathname, pageUrl: location.href, text, attachments,
      raw: bodyStr.length > 2000000 ? bodyStr.slice(0, 2000000) : bodyStr
    });
  }

  async function emitFile(file, u) {
    let name = file.name;
    if (!name) {
      const i = pendingNames.findIndex((p) => p.size === file.size);
      if (i >= 0) name = pendingNames.splice(i, 1)[0].name;
    }
    const meta = {
      kind: 'file', ts: Date.now(), site: SITE, pageUrl: location.href,
      endpoint: u.hostname + u.pathname, name: name || 'unnamed',
      type: file.type || '', size: file.size
    };
    if (file.size > MAX_FILE_BYTES) { emit({ ...meta, skipped: true }); return; }
    meta.dataUrl = await toDataUrl(file);
    emit(meta);
  }

  async function handleBody(u, method, body) {
    if (typeof body === 'string') {
      if (isPromptEndpoint(u, method)) {
        pushDebug('prompt-body-matched', { endpoint: u.pathname, method, length: body.length });
        return emitPrompt(u, body);
      }
      if (SITE === 'gemini' || SITE === 'notebook') {
        pushDebug('string-body-seen', { endpoint: u.pathname, method, length: body.length });
      }
      if (SITE === 'chatgpt' && method === 'POST' && /\/backend-api\/files$/.test(u.pathname)) {
        try {
          const j = JSON.parse(body);
          if (j.file_name) pendingNames.push({ name: j.file_name, size: j.file_size });
        } catch (_) {}
      }
      return;
    }
    if (!isUploadEndpoint(u, method)) return;
    pushDebug('upload-body-matched', { endpoint: u.pathname, method, bodyType: body && body.constructor && body.constructor.name });
    if (body instanceof FormData) {
      for (const [, v] of body.entries()) {
        if (v instanceof File && v.size > 0) await emitFile(v, u);
      }
    } else if (body instanceof Blob) {
      if (body.size > 0) await emitFile(body, u);
    } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      await emitFile(new Blob([body]), u);
    }
  }

  async function fromRequest(req) {
    const u = toURL(req.url);
    if (!u) return;
    const m = req.method.toUpperCase();
    const prompt = isPromptEndpoint(u, m);
    pushDebug('fromRequest', { endpoint: u.pathname, method: m, prompt, upload: isUploadEndpoint(u, m) });
    if (!prompt && !isUploadEndpoint(u, m)) return;
    const c = req.clone();
    const ct = c.headers.get('content-type') || '';
    if (prompt) return handleBody(u, m, await c.text());
    if (ct.includes('multipart/form-data')) return handleBody(u, m, await c.formData());
    return handleBody(u, m, await c.blob());
  }

  // ---- fetch ----
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      if (input instanceof Request && !(init && init.body)) {
        fromRequest(input).catch(() => {});
      } else if (init && init.body != null) {
        const u = toURL(input instanceof Request ? input.url : String(input));
        const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (u) {
          pushDebug('fetch-hook', { endpoint: u.pathname, method, bodyType: init.body && init.body.constructor && init.body.constructor.name });
          handleBody(u, method, init.body).catch(() => {});
        }
      }
    } catch (_) {}
    return origFetch.apply(this, arguments);
  };

  // ---- XHR ----
  const xOpen = XMLHttpRequest.prototype.open;
  const xSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__pv = { m: String(method).toUpperCase(), u: url };
    pushDebug('xhr-open', { method: this.__pv.m, url: String(url) });
    return xOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      const i = this.__pv;
      const u = i && toURL(i.u);
      if (u && body != null) {
        pushDebug('xhr-send', { endpoint: u.pathname, method: i.m, bodyType: body && body.constructor && body.constructor.name });
        handleBody(u, i.m, body).catch(() => {});
      }
    } catch (_) {}
    return xSend.apply(this, arguments);
  };
})();