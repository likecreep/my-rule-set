/**
 * Egern「网络诊断雷达 Pro」终极版
 * 
 * 融合特性：
 * 1. 深度解锁探针：引入 ai-media-check 的精准 API 解析机制 (Netflix/Disney/ChatGPT等)。
 * 2. 高可用性大盘：保留原雷达的多源并发 IP 共识、QUIC 探测与并发延迟竞速。
 * 3. Tokyo Night 视觉：日夜物理层级完全对等，发光果冻色与极简留白赛博朋克风。
 */

export default async function (ctx) {
  const env = ctx.env || {};
  const SCHEME = detectScheme(ctx);
  const C = palette(SCHEME);

  const POLICY = clean(env.POLICY);
  const POLICY_LABEL = POLICY || "默认规则";
  const MASK_IP = clean(env.YS) === "1";
  const FORCE_PROTOCOL = clean(env.XY);

  const TIMEOUT = 4500;
  const REFRESH_MINUTES = 15;
  const FORCE_LOCAL_MAINLAND = true;

  const SCREEN_W = numberInRange(pick(getScreenMetric(ctx, "width"), 440), 320, 900, 440);
  const SCREEN_H = numberInRange(pick(getScreenMetric(ctx, "height"), 956), 568, 1400, 956);
  const WIDTH_SCALE = SCREEN_W / 440;
  const HEIGHT_SCALE = SCREEN_H / 956;
  const UI_SCALE = clamp(WIDTH_SCALE * 0.88 + HEIGHT_SCALE * 0.12, 0.9, 1.06);
  const FONT_SCALE = clamp(UI_SCALE, 0.9, 1.045);

  const CURRENT_PROXY = getCurrentProxyInfo(ctx);
  const NODE_PROTOCOL = protocolFromXY(FORCE_PROTOCOL) || CURRENT_PROXY.protocol || "未暴露";

  const MAINLAND_LATENCY_URLS = [
    "http://connect.rom.miui.com/generate_204",
    "http://wifi.vivo.com.cn/generate_204",
    "https://www.baidu.com/favicon.ico",
    "https://www.qq.com/favicon.ico"
  ];
  const GLOBAL_PROXY_LATENCY_URLS = [
    "https://cp.cloudflare.com/generate_204",
    "https://www.gstatic.com/generate_204",
    "https://www.google.com/generate_204"
  ];
  const QUIC_TRACE_URLS = [
    "https://cloudflare-quic.com/cdn-cgi/trace",
    "https://www.cloudflare.com/cdn-cgi/trace",
    "https://1.1.1.1/cdn-cgi/trace"
  ];

  const BASE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const commonHeaders = { 'User-Agent': BASE_UA };

  const device = ctx.device || {};
  const wifi = device.wifi || {};
  const ipv4 = device.ipv4 || {};
  const ipv6 = device.ipv6 || {};
  const dnsServers = Array.isArray(device.dnsServers) ? device.dnsServers.filter(Boolean) : [];

  let networkName = getLocalNetworkName(device);
  const localIP = clean(pick(ipv4.address, wifi.ip, wifi.ipAddress, device.ipAddress, device.ip)) || "未获取";
  const gateway = clean(pick(ipv4.gateway, wifi.gateway, device.gateway)) || "未获取";
  const hasIPv4 = Boolean(clean(localIP)) && localIP !== "未获取";
  const hasIPv6 = Boolean(clean(pick(ipv6.address, device.ipv6Address)));
  const baseDNS = detectDNSProvider(dnsServers);
  const now = new Date();

  function S(value) { return typeof value !== "number" ? value : Math.round(value * UI_SCALE * 100) / 100; }
  function FS(value) { return typeof value !== "number" ? value : Math.round(value * FONT_SCALE * 100) / 100; }
  function displayIP(value) { return MASK_IP ? maskIP(value) : value; }

  function scaleStyle(object) {
    if (!object || typeof object !== "object" || Array.isArray(object)) return object;
    const scaled = {};
    const scaleKeys = { width: true, height: true, gap: true, borderRadius: true, borderWidth: true, length: true };
    Object.keys(object).forEach(key => {
      const value = object[key];
      if (key === "padding" && Array.isArray(value)) scaled[key] = value.map(item => S(item));
      else if (scaleKeys[key] && typeof value === "number") scaled[key] = S(value);
      else scaled[key] = value;
    });
    return scaled;
  }

  function requestOptions(extra) {
    const options = {
      timeout: TIMEOUT,
      redirect: "follow",
      credentials: "omit",
      headers: {
        "User-Agent": IOS_UA,
        Accept: "application/json,text/plain,text/html,*/*",
        "Cache-Control": "no-cache"
      }
    };
    if (POLICY) options.policy = POLICY;
    if (extra) {
      Object.keys(extra).forEach(key => {
        if (key === 'headers') options.headers = Object.assign({}, options.headers, extra.headers);
        else options[key] = extra[key];
      });
    }
    return options;
  }

  function directRequestOptions(extra) {
    return Object.assign(requestOptions(extra), { policy: "DIRECT" });
  }

  // ==========================================
  // 网络底层检测逻辑 (IP / Geo / DNS / QUIC)
  // ==========================================
  
  async function getJSON(url) {
    try {
      const response = await ctx.http.get(url, requestOptions());
      return { ok: response.status >= 200 && response.status < 400, status: response.status, data: await response.json() };
    } catch (_) { return { ok: false, status: 0, data: null }; }
  }

  async function getJSONDirect(url) {
    try {
      const response = await ctx.http.get(url, directRequestOptions());
      return { ok: response.status >= 200 && response.status < 400, status: response.status, data: await response.json() };
    } catch (_) { return { ok: false, status: 0, data: null }; }
  }

  async function getText(url) {
    const startedAt = Date.now();
    try {
      const response = await ctx.http.get(url, requestOptions());
      return { ok: response.status >= 200 && response.status < 400, text: (await response.text()) || "", ms: Math.max(1, Date.now() - startedAt) };
    } catch (_) { return { ok: false, text: "", ms: Math.max(1, Date.now() - startedAt) }; }
  }

  async function getExit() {
    const baseResults = await Promise.all([
      getJSON("https://api.ipapi.is/?_=" + Date.now()),
      getJSON("http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode,regionName,city,isp,org,as,asname,proxy,hosting,mobile&_=" + Date.now()),
      getJSON("https://ipwho.is/?lang=zh-CN&_=" + Date.now()),
      getJSON("https://ipinfo.io/json?_=" + Date.now())
    ]);
    const sourceNames = ["ipapi.is", "ip-api", "ipwho.is", "ipinfo"];
    const candidates = [];
    for (let index = 0; index < baseResults.length; index++) {
      if (!baseResults[index].ok || !baseResults[index].data) continue;
      const parsed = parseExitSource(baseResults[index].data, sourceNames[index]);
      if (parsed.ip) candidates.push(parsed);
    }
    let merged = mergeExitSources(candidates);
    if (!merged.ip || merged.ip === "未识别") {
      return { ip: "未识别", city: "检测失败", region: "", countryCode: "", isp: "未知", kind: "未知", flags: {} };
    }
    const proxyCheck = await getProxyCheck(merged.ip);
    if (proxyCheck && proxyCheck.ip) merged = mergeExitSources([merged, proxyCheck]);
    return merged;
  }

  async function getLocalExit() {
    const results = await Promise.all([
      getJSONDirect("http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode,regionName,city,isp,org,as,asname&_=" + Date.now()),
      getJSONDirect("https://ipwho.is/?lang=zh-CN&_=" + Date.now())
    ]);
    for (let index = 0; index < results.length; index++) {
      const parsed = parseLocalExit(results[index].data, FORCE_LOCAL_MAINLAND);
      if (results[index].ok && parsed.ip) return parsed;
    }
    return { ip: "", city: "", region: "", country: "中国", countryCode: "CN", isp: "", label: "中国大陆" };
  }

  async function getDNSVerified() {
    const host = randomAlphaNum(32) + ".edns.ip-api.com";
    const result = await getJSONDirect("http://" + host + "/json?_=" + Date.now());
    if (result.ok && result.data && result.data.dns && result.data.dns.ip) {
      const dnsIp = result.data.dns.ip;
      const geo = result.data.dns.geo;
      const info = await getJSONDirect("http://ip-api.com/json/" + encodeURIComponent(dnsIp) + "?lang=zh-CN");
      let isp = info.ok && info.data ? info.data.isp : geo;
      return { ok: true, ip: dnsIp, short: compactDNSProviderName(isp) };
    }
    return { ok: false, short: "未知" };
  }

  async function measureLatencySet(urls, direct) {
    const results = await Promise.all(urls.map(async url => {
      const start = Date.now();
      try {
        const res = direct ? await ctx.http.get(url, directRequestOptions()) : await ctx.http.get(url, requestOptions());
        return { ok: res.status >= 200 && res.status < 400, ms: Math.max(1, Date.now() - start) };
      } catch { return { ok: false, ms: 0 }; }
    }));
    const passed = results.filter(i => i.ok && i.ms > 0).sort((a, b) => a.ms - b.ms);
    return passed.length > 0 ? passed[0] : { ok: false, ms: 0 };
  }

  async function getQuic() {
    const urls = QUIC_TRACE_URLS.map(u => u + "?_=" + Date.now() + randomAlphaNum(5));
    const results = await Promise.all(urls.map(u => getText(u)));
    let hasH3 = false;
    let hasReachable = false;
    for (let i = 0; i < results.length; i++) {
      if (!results[i] || !results[i].ok) continue;
      hasReachable = true;
      const protocol = clean(parseTrace(results[i].text).http).toLowerCase();
      if (protocol.includes("h3") || protocol.includes("http/3")) { hasH3 = true; break; }
    }
    return hasH3 ? { value: "✓/✓", tone: "green" } : { value: "×/×", tone: hasReachable ? "amber" : "red" };
  }

  async function getProxyCheck(ip) {
    const target = clean(ip);
    if (!target || target === "未识别") return null;
    const result = await getJSON("https://proxycheck.io/v2/" + encodeURIComponent(target) + "?vpn=1&asn=1&risk=1");
    if (!result.ok || !result.data) return null;
    return parseProxyCheck(result.data, target);
  }

  // ==========================================
  // 高级流媒体与 AI 解锁探针检测 (深度重构)
  // ==========================================

  async function exactPing(url) {
    const start = Date.now();
    await ctx.http.get(url, requestOptions({ timeout: 2500, redirect: 'manual' })).catch(() => null);
    return Date.now() - start;
  }

  async function safeProbe(fn) {
    try { return await fn(); } catch { return { code: 'ERR', region: null, ms: 0 }; }
  }

  async function checkYouTube() {
    const ms = await exactPing('https://www.youtube.com/generate_204');
    const res = await ctx.http.get('https://www.youtube.com/premium', requestOptions({
      timeout: 4000, 
      headers: { 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'SOCS=CAI' }
    })).catch(() => null);
    
    if (!res || res.status !== 200) return { code: 'ERR', region: null, ms };
    const body = await res.text();
    if (body.includes('Premium is not available in your country')) return { code: 'ERR', region: 'UNAV', ms };
    
    let finalRegion = 'OK';
    const match = body.match(/"INNERTUBE_CONTEXT_GL"\s*:\s*"([^"]+)"/i);
    if (match && match[1]) finalRegion = match[1].toUpperCase();
    return { code: 'OK', region: finalRegion, ms };
  }

  async function checkNetflix() {
    const ms = await exactPing('https://www.netflix.com/.well-known/apple-app-site-association');
    const innerCheck = async (filmId) => {
      const res = await ctx.http.get('https://www.netflix.com/title/' + filmId, requestOptions({
        timeout: 4000, headers: commonHeaders, redirect: 'follow'
      })).catch(() => null);
      if (!res) return { status: 'Error' };
      if (res.status === 403) return { status: 'Not Available' };
      if (res.status === 404) return { status: 'Not Found' };
      if (res.status === 200) {
        let region = 'US';
        const url = res.headers['x-originating-url'] || res.headers['X-Originating-Url'];
        if (url) {
          const parts = url.split('/');
          if (parts.length > 3 && parts[3].split('-')[0].toUpperCase() !== 'TITLE') {
            region = parts[3].split('-')[0].toUpperCase();
          }
        }
        return { status: 'OK', region: region };
      }
      return { status: 'Error' };
    };
    const check1 = await innerCheck(81280792);
    if (check1.status === 'OK') return { code: 'OK', region: check1.region, suffix: '(全)', ms };
    if (check1.status === 'Not Found') {
      const check2 = await innerCheck(80018499);
      if (check2.status === 'OK') return { code: 'OK', region: check2.region, suffix: '(自)', ms };
    }
    return { code: 'ERR', region: null, ms };
  }

  async function checkDisney() {
    const ms = await exactPing('https://www.disneyplus.com/.well-known/apple-app-site-association');
    try {
      const gqlRes = await ctx.http.post('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', requestOptions({
        timeout: 5000,
        headers: {
          'Accept-Language': 'en',
          'Authorization': 'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84',
          'Content-Type': 'application/json',
          'User-Agent': BASE_UA
        },
        body: JSON.stringify({
          query: 'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
          variables: { input: { applicationRuntime: 'chrome', attributes: { browserName: 'chrome', operatingSystem: 'macintosh' }, deviceFamily: 'browser', deviceLanguage: 'en', deviceProfile: 'macosx' } }
        })
      })).catch(() => null);

      if (!gqlRes || gqlRes.status !== 200) return { code: 'ERR', region: null, ms };
      const data = JSON.parse(await gqlRes.text());
      if (!data?.errors && data?.extensions?.sdk) {
        const sdk = data.extensions.sdk;
        const inSupportedLocation = sdk.session?.inSupportedLocation;
        let region = sdk.session?.location?.countryCode ? sdk.session.location.countryCode.toUpperCase() : null;
        if (inSupportedLocation === false || String(inSupportedLocation) === 'false') return { code: 'OK', region: region, suffix: '(即将)', ms };
        else if (region) return { code: 'OK', region: region, ms };
      }
      return { code: 'ERR', region: null, ms };
    } catch (e) { return { code: 'ERR', region: null, ms }; }
  }

  async function checkChatGPT() {
    let region = null, ms = 0;
    const start = Date.now();
    const trace = await ctx.http.get('https://chatgpt.com/cdn-cgi/trace', requestOptions({ timeout: 3000, redirect: 'manual' })).catch(() => null);
    ms = Date.now() - start;
    if (trace && trace.status === 200) {
      const match = (await trace.text()).match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }
    const resWeb = await ctx.http.get('https://api.openai.com/compliance/cookie_requirements', requestOptions({
      timeout: 4000, headers: { ...commonHeaders, 'authority': 'api.openai.com', 'authorization': 'Bearer null' }
    })).catch(() => null);
    const resApp = await ctx.http.get('https://ios.chat.openai.com/', requestOptions({
      timeout: 4000, headers: { ...commonHeaders, 'authority': 'ios.chat.openai.com' }
    })).catch(() => null);
    
    let webBlocked = true, appBlocked = true;
    if (resWeb) { if (!(await resWeb.text()).toLowerCase().includes('unsupported_country')) webBlocked = false; }
    if (resApp) { if (!(await resApp.text()).toLowerCase().includes('vpn')) appBlocked = false; }

    if (!webBlocked && !appBlocked) return { code: 'OK', region: region, ms }; 
    if (!webBlocked && appBlocked) return { code: 'OK', region: region, suffix: '(Web)', ms };
    if (webBlocked && !appBlocked) return { code: 'OK', region: region, suffix: '(App)', ms }; 
    return { code: 'ERR', region: region, ms };
  }

  async function checkClaude() {
    let region = null, ms = 0;
    const start = Date.now();
    const trace = await ctx.http.get('https://claude.ai/cdn-cgi/trace', requestOptions({ timeout: 3000, redirect: 'manual' })).catch(() => null);
    ms = Date.now() - start;
    if (trace && trace.status === 200) {
      const match = (await trace.text()).match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }
    const res = await ctx.http.get('https://claude.ai/', requestOptions({ timeout: 4000, headers: commonHeaders, redirect: 'manual' })).catch(() => null);
    if (!res) return { code: 'ERR', region: region, ms };
    if (res.status >= 300 && res.status < 400) {
        const loc = res.headers['Location'] || res.headers['location'] || '';
        if (loc.includes('app-unavailable-in-region')) return { code: 'ERR', region: region, ms };
    } else if (res.status === 200) {
        if ((await res.text()).includes('app-unavailable-in-region')) return { code: 'ERR', region: region, ms };
    }
    return { code: 'OK', region: region, ms };
  }

  async function checkGemini() {
    const ms = await exactPing('https://gemini.google.com/generate_204');
    const res = await ctx.http.get('https://gemini.google.com', requestOptions({ timeout: 5000, headers: commonHeaders, redirect: 'follow' })).catch(() => null);
    if (!res) return { code: 'ERR', region: null, ms };
    const body = await res.text();
    if (!body.includes('45631641,null,true')) return { code: 'ERR', region: null, ms };
    let region = null;
    const match = body.match(/,2,1,200,"([A-Z]{2,3})"/);
    if (match && match[1]) region = match[1];
    return { code: 'OK', region: region || 'OK', ms };
  }

  async function checkGeneric(url) {
    const start = Date.now();
    try {
      const res = await ctx.http.get(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), requestOptions({ timeout: 4000 }));
      return { code: res.status >= 200 && res.status < 400 ? 'OK' : 'ERR', region: 'OK', ms: Date.now() - start };
    } catch { return { code: 'ERR', region: null, ms: Date.now() - start }; }
  }

  // ==========================================
  // 执行核心并发检测
  // ==========================================

  const [
    exit, localExit, verifiedDNS, proxyLatency, localLatency, quic,
    netflixRes, disneyRes, youtubeRes, spotifyRes, tiktokRes, primeRes,
    chatgptRes, claudeRes, geminiRes, deepseekRes, grokRes, perplexityRes
  ] = await Promise.all([
    getExit(), getLocalExit(), getDNSVerified(),
    measureLatencySet(GLOBAL_PROXY_LATENCY_URLS, false),
    measureLatencySet(MAINLAND_LATENCY_URLS, true),
    getQuic(),
    
    // Media & AI Probes Execute
    safeProbe(checkNetflix), safeProbe(checkDisney), safeProbe(checkYouTube),
    safeProbe(() => checkGeneric("https://open.spotify.com/")),
    safeProbe(() => checkGeneric("https://www.tiktok.com/")),
    safeProbe(() => checkGeneric("https://www.primevideo.com/")),
    safeProbe(checkChatGPT), safeProbe(checkClaude), safeProbe(checkGemini),
    safeProbe(() => checkGeneric("https://chat.deepseek.com/")),
    safeProbe(() => checkGeneric("https://grok.com/")),
    safeProbe(() => checkGeneric("https://www.perplexity.ai/"))
  ]);

  const media = [
    { name: "Netflix", kind: "netflix", color: C.netflix, info: netflixRes },
    { name: "Disney+", kind: "disney", color: C.disney, info: disneyRes },
    { name: "YouTube", kind: "youtube", color: C.youtube, info: youtubeRes },
    { name: "Spotify", kind: "spotify", color: C.spotify, info: spotifyRes },
    { name: "TikTok", kind: "tiktok", color: C.tiktok, info: tiktokRes },
    { name: "Prime", kind: "prime", color: C.prime, info: primeRes }
  ];

  const ai = [
    { name: "ChatGPT", kind: "chatgpt", color: C.chatgpt, info: chatgptRes },
    { name: "Claude", kind: "claude", color: C.claude, info: claudeRes },
    { name: "Gemini", kind: "gemini", color: C.gemini, info: geminiRes },
    { name: "DeepSeek", kind: "deepseek", color: C.deepseek, info: deepseekRes },
    { name: "Grok", kind: "grok", color: C.grok, info: grokRes },
    { name: "Perplexity", kind: "perplexity", color: C.perplexity, info: perplexityRes }
  ];

  const carrierByDirectISP = normalizeCarrierName([localExit.isp, localExit.org, localExit.asname, localExit.as].join(" "));
  if (!networkName && carrierByDirectISP) networkName = carrierByDirectISP;
  if (!networkName) networkName = "移动数据";

  const dnsLabel = chooseDNSProvider(baseDNS, verifiedDNS).short;
  const localArea = localExit.label || "中国大陆";
  const nat = detectNAT(localIP, exit.ip);
  const purity = purityScore(exit);
  const risk = riskLevel(exit, purity);

  const proxyLatencyColor = proxyLatency.ok ? proxyLatency.ms <= 220 ? C.green : C.amber : C.red;
  const localLatencyColor = localLatency.ok ? localLatency.ms <= 220 ? C.green : C.amber : C.red;
  const natColor = toneColor(nat.tone, C);
  const quicColor = toneColor(quic.tone, C);
  const purityColor = purity.score >= 75 ? C.green : purity.score >= 45 ? C.amber : C.red;
  const riskColor = risk === "低风险" ? C.green : risk === "中风险" ? C.amber : C.red;

  // ==========================================
  // UI 渲染构建 (Tokyo Night 全面适配)
  // ==========================================

  function merge(base, extra) { return scaleStyle(Object.assign({}, base || {}, extra || {})); }
  function text(value, size, weight, color, extra) {
    return merge({ type: "text", text: String(value), font: { size: FS(size), weight: weight || "regular", design: extra?.design || "default" }, textColor: color || C.text }, extra);
  }
  function image(symbol, color, width, height, extra) {
    return merge({ type: "image", src: "sf-symbol:" + symbol, color: color || C.text, width: width || 10, height: height || 10 }, extra);
  }
  function rawImage(src, width, height, extra) {
    return merge({ type: "image", src: src, width: width, height: height, resizable: true }, extra || {});
  }
  function svgImage(svg, width, height, extra) { return rawImage(svgDataURI(svg), width, height, extra); }
  function row(children, extra) { return merge({ type: "stack", direction: "row", alignItems: "center", children: children || [] }, extra); }
  function col(children, extra) { return merge({ type: "stack", direction: "column", alignItems: "start", children: children || [] }, extra); }
  function spacer(length) { return length === undefined ? { type: "spacer" } : { type: "spacer", length: S(length) }; }

  // 核心改动：卡片极客拟物风格，移除渐变，应用午夜/白瓷边缘
  function card(children, extra) {
    return merge({
      type: "stack", direction: "column", alignItems: "start", padding: [6, 7], gap: 4,
      backgroundColor: C.card, borderRadius: 10, borderWidth: 0.5, borderColor: C.cardBorder,
      children: children || []
    }, extra);
  }

  function pill(value, tone, fill, extra) {
    return row([text(value, 6, "semibold", tone, { maxLines: 1, minScale: 0.72, textAlign: "center" })],
      merge({ padding: [2, 5], backgroundColor: fill, borderRadius: 8 }, extra));
  }

  function proxyTagLine(value, tone, fill) {
    return row([text(value, 4.7, "semibold", tone, { maxLines: 1, minScale: 0.42, textAlign: "center" })],
      { width: 37, height: 7.2, padding: [0.7, 2.5], backgroundColor: fill, borderRadius: 4.8, alignItems: "center" });
  }

  function iconBox(symbol, tone, fill, side) {
    return row([image(symbol, tone, Math.round(side * 0.52), Math.round(side * 0.52))],
      { width: side, height: side, padding: 3, backgroundColor: fill, borderRadius: 12 });
  }

  function sectionTitle(symbol, title, right, tone) {
    const children = [image(symbol, tone, 11, 11), text(title, 10, "semibold", C.text, { maxLines: 1 })];
    if (right) { children.push(spacer()); children.push(right); }
    return row(children, { gap: 3 });
  }

  function metricBox(symbol, label, value, tone, extra) {
    const options = extra || {};
    return col([
        row([image(symbol, tone, 7, 7), text(label, options.labelSize || 5, "medium", C.muted, { maxLines: 1, minScale: options.labelMinScale || 0.72, textAlign: "center" })], { gap: 1, alignItems: "center" }),
        text(value, options.valueSize || 6.1, "semibold", tone, { maxLines: 1, minScale: options.valueMinScale || 0.35, textAlign: "center", design: "monospaced" })
      ], { flex: 1, height: 24, padding: [0, 0], gap: 0, alignItems: "center" });
  }

  function header() {
    return row([
        row([
            iconBox("waveform.path.ecg", C.blue, C.tileIconBg, 28),
            col([
                row([text("网络诊断雷达", 11, "bold", C.text, { maxLines: 1, minScale: 0.72 }), pill("Pro", C.purple, C.tileIconBg, { padding: [1, 4] })], { gap: 3, alignItems: "center" }),
                text("Egern · 全面网络状态检测", 6, "medium", C.muted, { maxLines: 1, minScale: 0.78 })
              ], { flex: 1, gap: 0 })
          ], { width: 171, height: 34, gap: 6 }),
        row([
            spacer(), image("scope", C.purple, 11, 11),
            col([
                text("当前策略", 5, "medium", C.muted, { maxLines: 1, textAlign: "center" }),
                row([text(POLICY ? "●" : "○", 7, "bold", POLICY ? C.green : C.purple), text(POLICY_LABEL, 7, "semibold", C.text, { maxLines: 1, minScale: 0.72 })], { gap: 2, alignItems: "center" })
              ], { width: 52, gap: 0, alignItems: "start" }),
            spacer()
          ], { flex: 1, height: 34, padding: [3, 0], gap: 3 }),
        col([
            text(timeLabel(now), 11, "bold", C.text, { maxLines: 1, minScale: 0.82, textAlign: "right", design: "monospaced" }),
            text(dateLabel(now), 5, "medium", C.muted, { maxLines: 1, minScale: 0.82, textAlign: "right" })
          ], { width: 43, height: 34, alignItems: "end", gap: 0 })
      ], { height: 34, gap: 4 });
  }

  function localCard() {
    return card([
        sectionTitle("wifi", "本地网络", image("globe.asia.australia.fill", C.blue, 12, 12), C.blue),
        row([
            iconBox("wifi", C.blue, C.tileIconBg, 42),
            col([
                row([text(networkName, 11, "semibold", C.text, { flex: 1, maxLines: 1, minScale: 0.68 }), pill("已连接", C.green, C.greenSoft, { padding: [1, 4] })], { gap: 3 }),
                text(displayIP(localIP), 8, "medium", C.subtext, { maxLines: 1, minScale: 0.72, design: "monospaced" }),
                row([text(flag(localExit.countryCode) || "🇨🇳", 8, "regular", C.text), text(localArea, 7, "medium", C.muted, { maxLines: 1, minScale: 0.72 })], { gap: 2 })
              ], { flex: 1, gap: 1 })
          ], { gap: 6 }),
        row([
            metricBox("router.fill", "网关", gatewayLabel(displayIP(gateway)), C.blue, { valueSize: 5.4, valueMinScale: 0.28 }),
            metricBox("clock", "直连延迟", localLatency.ok ? localLatency.ms + "ms" : "失败", localLatencyColor),
            metricBox("network", "IPV4/IPV6", (hasIPv4 ? "✓" : "×") + "/" + (hasIPv6 ? "✓" : "×"), hasIPv4 && hasIPv6 ? C.green : hasIPv4 ? C.amber : C.red),
            metricBox("cloud.fill", "DNS", dnsLabel, C.purple, { valueSize: 5.4, valueMinScale: 0.28 })
          ], { gap: 2 })
      ], { flex: 1, height: 100 });
  }

  function proxyCard() {
    const city = clean(exit.city) || clean(exit.country) || "未知地区";
    const tagOne = exit.kind || "未知网络";
    const tagTwo = clean(exit.cloudProvider) || (exit.kind === "住宅 IP" ? "原生住宅" : exit.kind === "移动网络" ? "移动出口" : exit.kind === "商业机房" ? "商业机房" : "出口网络");
    const tagOneTone = exit.kind === "商业机房" ? C.amber : C.green;
    const tagOneFill = exit.kind === "商业机房" ? C.amberSoft : C.greenSoft;
    return card([
        sectionTitle("point.3.connected.trianglepath.dotted", "当前代理", pill(proxyLatency.ok ? "连接正常" : "检测失败", proxyLatency.ok ? C.green : C.red, proxyLatency.ok ? C.greenSoft : C.redSoft), C.purple),
        row([
            row([text(flag(exit.countryCode) || "🌐", 22, "regular", C.text, { maxLines: 1, textAlign: "center" })], { width: 36, height: 36, padding: 2, backgroundColor: C.tileIconBg, borderRadius: 11 }),
            col([
                row([text(flag(exit.countryCode) || "🌐", 7, "regular", C.text), text(city, 9.2, "semibold", C.text, { flex: 1, maxLines: 1, minScale: 0.55 })], { gap: 2 }),
                text(shortISP(exit.isp), 7.2, "medium", C.subtext, { maxLines: 1, minScale: 0.62 }),
                col([proxyTagLine(tagOne, tagOneTone, tagOneFill), proxyTagLine(tagTwo, C.green, C.greenSoft)], { width: 39, gap: 1, alignItems: "start" })
              ], { flex: 1, gap: 1 }),
            row([
              svgImage(purityGaugeSVG(purity.score, { track: C.scoreTrack, left: C.scoreLeft, right: C.scoreRight, glow: C.scoreGlow, text: C.scoreLeft, muted: C.muted }), 68, 52, { borderRadius: 16 })
            ], { width: 68, height: 52, alignItems: "center", justifyContent: "center" })
          ], { gap: 4, alignItems: "center" }),
        row([
            metricBox("clock", "延迟", proxyLatency.ok ? proxyLatency.ms + "ms" : "失败", proxyLatencyColor),
            metricBox("circle.hexagongrid.fill", "NAT", nat.label, natColor),
            metricBox("paperplane.fill", "UDP/QUIC", quic.value, quicColor, { labelSize: 4.25, labelMinScale: 0.38 }),
            metricBox("slider.horizontal.3", "协议", NODE_PROTOCOL, C.purple, { valueSize: 5.4, valueMinScale: 0.34 })
          ], { gap: 2 })
      ], { flex: 1, height: 100, padding: [5, 6], gap: 3 });
  }

  function serviceLogoLarge(item) {
    const base = { width: 23, height: 23, padding: 2, backgroundColor: C.tileIconBg, borderRadius: 7 };
    if (item.kind === "spotify") return row([image("dot.radiowaves.left.and.right", item.color, 15, 15)], base);
    if (item.kind === "tiktok") return row([image("music.note", item.color, 15, 15)], base);
    if (item.kind === "youtube") return row([image("play.rectangle.fill", item.color, 15, 15)], base);
    if (item.kind === "prime") return row([image("play.tv.fill", item.color, 15, 15)], base);
    if (item.kind === "chatgpt") return row([image("circle.hexagongrid", item.color, 15, 15)], base);
    if (item.kind === "gemini") return row([image("sparkles", item.color, 15, 15)], base);
    if (item.kind === "grok") return row([image("xmark", item.color, 14, 14)], base);
    if (item.kind === "perplexity") return row([image("magnifyingglass", item.color, 14, 14)], base);
    const mark = item.kind === "netflix" ? "N" : item.kind === "disney" ? "D+" : item.kind === "deepseek" ? "D" : "AI";
    const fontSize = item.kind === "claude" ? 10 : item.kind === "disney" ? 10 : 13;
    return row([text(mark, fontSize, "bold", item.color, { maxLines: 1, textAlign: "center" })], base);
  }

  function compactServiceTile(item) {
    const isOk = item.info && item.info.code !== 'ERR';
    const statusColor = isOk ? C.green : C.red;
    let displayRegion = 'FAIL';
    
    if (isOk) {
      let r = item.info.region || 'US';
      let s = item.info.suffix || '';
      if (r === 'UNKNOWN' || r === 'OK' || r === '--') displayRegion = s || 'OK';
      else displayRegion = flag(r) + ' ' + r + s;
    }

    return row([
        serviceLogoLarge(item),
        col([
            text(item.name, 7, "semibold", C.text, { maxLines: 1, minScale: 0.66 }),
            row([text(displayRegion, 5.6, "semibold", statusColor, { maxLines: 1, design: "monospaced" })], { gap: 2 })
          ], { flex: 1, gap: 1 })
      ], { flex: 1, height: 31, padding: [4, 4], gap: 4, backgroundColor: C.tileBg, borderRadius: 9, borderWidth: 1, borderColor: C.tileBorder });
  }

  function serviceCard(title, symbol, items, tone) {
    const passed = items.filter(item => item.info && item.info.code !== 'ERR').length;
    return card([
        sectionTitle(symbol, title, pill(passed + "/" + items.length, passed === items.length ? C.green : C.amber, passed === items.length ? C.greenSoft : C.amberSoft), tone),
        col([
            row([compactServiceTile(items[0]), compactServiceTile(items[1])], { height: 31, gap: 5 }),
            row([compactServiceTile(items[2]), compactServiceTile(items[3])], { height: 31, gap: 5 }),
            row([compactServiceTile(items[4]), compactServiceTile(items[5])], { height: 31, gap: 5 })
          ], { flex: 1, height: 101, gap: 4 })
      ], { flex: 1, height: 133, padding: [5, 6], gap: 5 });
  }

  function footerCell(symbol, label, value, tone) {
    return col([
        row([
            image(symbol, tone, 13, 13),
            col([text(label, 6, "medium", C.muted, { maxLines: 1 }), text(value, 7, "semibold", tone, { maxLines: 1, minScale: 0.64 })], { flex: 1, gap: 0 })
          ], { gap: 4 })
      ], { flex: 1, padding: [1, 3] });
  }

  return {
    type: "widget", padding: S(8), gap: 0, backgroundColor: C.root,
    refreshAfter: new Date(Date.now() + REFRESH_MINUTES * 60 * 1000).toISOString(),
    children: [
      col([
          header(),
          row([localCard(), proxyCard()], { height: 100, gap: 6, alignItems: "start" }),
          row([serviceCard("流媒体解锁", "play.rectangle.fill", media, C.blue), serviceCard("AI 解锁检测", "sparkles", ai, C.purple)], { height: 133, gap: 6, alignItems: "start" }),
          card([
              row([
                  footerCell("server.rack", "ISP / 厂商", shortISP(exit.isp), C.blue),
                  footerCell("house.fill", "属性类型", exit.kind, exit.kind === "商业机房" ? C.amber : C.green),
                  footerCell("checkmark.shield.fill", "纯净评分", purity.score + "分", purityColor),
                  footerCell("shield.lefthalf.filled", "风险等级", risk, riskColor),
                  footerCell("arrow.clockwise", "更新时间", timeLabel(now), C.purple)
                ], { height: 30, padding: [0, 0], gap: 0, alignItems: "center" })
            ], { height: 40, padding: [4, 5], gap: 0 })
        ], { height: 342, padding: [8, 8], gap: 6 }),
      spacer()
    ]
  };
}

// ==========================================
// Tokyo Night 视觉色板映射字典
// ==========================================
function palette(scheme) {
  const adaptive = (light, dark) => scheme === "dark" ? dark : light;
  return {
    root: adaptive("#EEF1FF", "#16161E"), 
    card: adaptive("#FFFFFF", "#000000"), 
    cardBorder: adaptive("#00000014", "#2B3045"),
    tileBg: adaptive("#F0F2F8", "#1F1F24"), 
    tileIconBg: adaptive("#7446D81A", "#B765FF1A"), 
    tileBorder: adaptive("#D1D9E6", "#2B3045"), 
    text: adaptive("#111114", "#FFFFFF"),
    subtext: adaptive("#64748B", "#8F93A2"), 
    muted: adaptive("#64748B", "#8F93A2"),
    
    scoreTrack: adaptive("#D8E1EA", "#273045"),
    scoreGlow: adaptive("#1AE27F", "#1AE27F"),
    scoreLeft: adaptive("#22C96D", "#3BE28A"),
    scoreRight: adaptive("#E25769", "#FF627A"),

    blue: adaptive("#7446D8", "#B765FF"), 
    purple: adaptive("#7446D8", "#B765FF"), 
    green: adaptive("#10B981", "#C7FF18"), 
    greenSoft: adaptive("#10B9811A", "#C7FF181A"),
    amber: adaptive("#F59E0B", "#FFD300"), 
    amberSoft: adaptive("#F59E0B1A", "#FFD3001A"),
    red: adaptive("#FF4757", "#FF2A6D"), 
    redSoft: adaptive("#FF47571A", "#FF2A6D1A"),
    
    netflix: adaptive("#FF4757", "#FF2A6D"),
    disney: adaptive("#7446D8", "#B765FF"),
    spotify: adaptive("#10B981", "#C7FF18"),
    tiktok: adaptive("#111114", "#FFFFFF"),
    youtube: adaptive("#FF4757", "#FF2A6D"),
    prime: adaptive("#7446D8", "#B765FF"),
    chatgpt: adaptive("#111114", "#FFFFFF"),
    claude: adaptive("#F59E0B", "#FFD300"),
    gemini: adaptive("#7446D8", "#B765FF"),
    deepseek: adaptive("#7446D8", "#B765FF"),
    grok: adaptive("#111114", "#FFFFFF"),
    perplexity: adaptive("#10B981", "#C7FF18")
  };
}

// ==========================================
// 底层辅助函数群
// ==========================================
function getLocalNetworkName(device) {
  const wifi = (device && device.wifi) || {};
  const cellular = (device && device.cellular) || {};
  const wifiName = firstMeaningful(wifi.ssid, wifi.name, wifi.networkName, getAt(device, "network.ssid"), getAt(device, "wifiSSID"));
  if (wifiName) return wifiName;
  const carrierName = firstMeaningful(cellular.carrier, cellular.carrierName, cellular.operator, cellular.operatorName, getAt(device, "carrier"));
  if (carrierName) return normalizeCarrierName(carrierName);
  const code = firstMeaningful(cellular.mccmnc, cellular.mccMnc, cellular.plmn, cellular.operatorCode);
  const byCode = carrierByMCCMNC(code);
  return byCode ? byCode : "";
}
function firstMeaningful() {
  for (let i = 0; i < arguments.length; i++) {
    const value = clean(arguments[i]);
    if (isMeaningful(value)) return value;
  }
  return "";
}
function isMeaningful(value) {
  const v = clean(value); const lower = v.toLowerCase();
  if (!v || v === "--" || v === "-" || lower === "null" || lower === "undefined" || lower === "unknown" || lower === "wifi" || lower === "5g" || lower === "4g" || lower === "lte") return false;
  return true;
}
function normalizeCarrierName(value) {
  const raw = clean(value); const lower = raw.toLowerCase();
  if (!raw) return "";
  if (raw.includes("中国移动") || lower.includes("china mobile") || lower.includes("cmcc")) return "中国移动";
  if (raw.includes("中国联通") || lower.includes("china unicom") || lower.includes("unicom")) return "中国联通";
  if (raw.includes("中国电信") || lower.includes("china telecom") || lower.includes("telecom")) return "中国电信";
  if (raw.includes("中国广电") || lower.includes("china broadnet") || lower.includes("cbn")) return "中国广电";
  return raw;
}
function carrierByMCCMNC(value) {
  const code = clean(value).replace(/\D/g, "");
  if (["46000","46002","46004","46007","46008"].includes(code)) return "中国移动";
  if (["46001","46006","46009"].includes(code)) return "中国联通";
  if (["46003","46005","46011","46012"].includes(code)) return "中国电信";
  if (["46015"].includes(code)) return "中国广电";
  return "";
}
function maskIP(value) {
  const raw = clean(value);
  if (!raw || raw === "未获取" || raw === "—" || raw === "-") return raw;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) { const parts = raw.split("."); return parts[0] + "." + parts[1] + ".*.*"; }
  if (raw.includes(":")) { const parts = raw.split(":").filter(Boolean); if (parts.length >= 2) return parts[0] + ":" + parts[1] + ":****:****"; }
  return raw;
}
function purityGaugeSVG(score, colors) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const cx = 75, cy = 85, rx = 55, ry = 55;
  const theta = Math.PI - Math.PI * value / 100;
  const px = cx + rx * Math.cos(theta); const py = cy - ry * Math.sin(theta);
  const leftDash = value >= 99.9 ? "100 0" : Math.max(0.1, value).toFixed(1) + " 100";
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="112" viewBox="0 0 150 112"><defs><filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.1" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>',
    `<path d="M20 85 A55 55 0 0 1 130 85" fill="none" stroke="${colors.track}" stroke-width="9" stroke-linecap="round" opacity="0.75"/>`,
    `<path d="M20 85 A55 55 0 0 1 130 85" fill="none" stroke="${colors.right}" stroke-width="8.2" stroke-linecap="round" opacity="0.95"/>`,
    `<path d="M20 85 A55 55 0 0 1 130 85" fill="none" stroke="${colors.glow}" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="${leftDash}" opacity="0.16"/>`,
    `<path d="M20 85 A55 55 0 0 1 130 85" fill="none" stroke="${colors.left}" stroke-width="8.4" stroke-linecap="round" pathLength="100" stroke-dasharray="${leftDash}" opacity="1"/>`,
    `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="6.5" fill="${colors.glow}" opacity="0.20"/>`,
    `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="4.2" fill="${colors.left}" filter="url(#softGlow)" opacity="1"/>`,
    `<text x="75" y="61" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif" font-size="30" font-weight="850" fill="${colors.text}">${Math.round(value)}</text>`,
    `<text x="75" y="75" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif" font-size="10" font-weight="760" fill="${colors.muted}">/100</text>`,
    `<text x="75" y="90" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif" font-size="10" font-weight="760" fill="${colors.muted}">纯净评分</text></svg>`
  ].join("");
}
function svgDataURI(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22"); }
function getCurrentProxyInfo(ctx) {
  const proxyName = clean(pick(getAt(ctx, "node.name"), getAt(ctx, "proxy.name"), getAt(ctx, "policy.node.name")));
  const rawProtocol = clean(pick(getAt(ctx, "node.protocol"), getAt(ctx, "proxy.protocol"), getAt(ctx, "node.type")));
  return { name: proxyName, protocol: normalizeProxyProtocol(rawProtocol) || normalizeProxyProtocol(proxyName) };
}
function protocolFromXY(value) { return normalizeProxyProtocol(clean(value)) || clean(value); }
function normalizeProxyProtocol(value) {
  const text = clean(value).toLowerCase().replace(/[_\-]+/g, " ").replace(/[()[\]{}|,;]+/g, " ");
  if (!text) return "";
  const checks = [[/vless/, "VLESS"], [/vmess/, "VMESS"], [/trojan/, "Trojan"], [/shadowsocks\s*r|ssr/, "SSR"], [/shadowsocks|(^|\s)ss($|\s)/, "SS"], [/hysteria\s*2|hy2/, "HY2"], [/hysteria/, "Hysteria"], [/tuic/, "TUIC"], [/any\s*tls|anytls/, "AnyTLS"], [/wireguard|(^|\s)wg($|\s)/, "WireGuard"], [/socks\s*5|socks5/, "SOCKS5"]];
  for (let i = 0; i < checks.length; i++) if (checks[i][0].test(text)) return checks[i][1];
  return "";
}
function parseExitSource(data, sourceName) {
  if (!data || typeof data !== "object") return {};
  const ip = clean(pick(data.ip, data.query, data.ip_address, getAt(data, "location.ip")));
  if (!ip) return {};
  const isp = clean(pick(getAt(data, "company.name"), getAt(data, "connection.isp"), data.isp, data.org, data.asname, data.as, "未知组织"));
  const cloud = cloudProviderFromText([isp, data.org, data.as, data.asname, getAt(data, "company.name")].join(" "));
  const flags = {
    datacenter: truthy(pick(data.is_datacenter, data.hosting, getAt(data, "security.is_datacenter"))) || cloud.hit,
    hosting: truthy(pick(data.hosting, data.is_hosting)) || cloud.hit,
    cloud: cloud.hit,
    proxy: truthy(pick(data.proxy, data.is_proxy, getAt(data, "security.is_proxy"))),
    vpn: truthy(pick(data.is_vpn, getAt(data, "security.is_vpn"))),
    tor: truthy(pick(data.is_tor, getAt(data, "security.is_tor"))),
    abuser: truthy(pick(data.is_abuser, getAt(data, "security.is_abuser"))),
    mobile: truthy(pick(data.mobile, data.is_mobile)),
    residential: false,
    risk: numberOrNull(pick(data.risk, getAt(data, "security.risk"), getAt(data, "risk.score")))
  };
  const rawType = clean(pick(getAt(data, "company.type"), getAt(data, "connection.type"))).toLowerCase();
  if (rawType.includes("isp") || rawType.includes("residential") || rawType.includes("broadband")) flags.residential = true;
  if (rawType.includes("hosting") || rawType.includes("datacenter") || rawType.includes("cloud")) { flags.datacenter = true; flags.hosting = true; }
  const rawCountry = clean(pick(getAt(data, "location.country"), data.country_name, data.country));
  return {
    source: sourceName || "", ip: ip, city: clean(pick(getAt(data, "location.city"), data.city, getAt(data, "location.region"), data.regionName, data.region, "未知城市")),
    region: clean(pick(getAt(data, "location.region"), data.regionName, data.region)), country: rawCountry.length === 2 ? "" : rawCountry,
    countryCode: countryCode(pick(getAt(data, "location.country_code"), data.countryCode, rawCountry.length === 2 ? rawCountry : "")),
    isp: cloud.name || isp, cloudProvider: cloud.name, kind: classifyExitKind(flags), flags: flags
  };
}
function parseProxyCheck(data, ip) {
  if (!data || typeof data !== "object") return null;
  const target = clean(ip); const keys = Object.keys(data);
  const fallbackKey = keys.find(k => k !== "status" && k !== "message");
  const item = data[target] || data[fallbackKey];
  if (!item || typeof item !== "object") return null;
  const typeText = clean(pick(item.type, item.proxy, item.provider, item.organisation, item.asn));
  const cloud = cloudProviderFromText([item.provider, item.organisation, item.operator, item.asn, item.type].join(" "));
  const proxyValue = clean(item.proxy).toLowerCase(); const typeLower = typeText.toLowerCase();
  const flags = {
    datacenter: cloud.hit || typeLower.includes("hosting") || typeLower.includes("server") || typeLower.includes("business"),
    hosting: cloud.hit || typeLower.includes("hosting") || typeLower.includes("server"), cloud: cloud.hit,
    proxy: proxyValue === "yes" || typeLower.includes("proxy"), vpn: typeLower.includes("vpn"), tor: typeLower.includes("tor"),
    abuser: typeLower.includes("abuse") || typeLower.includes("blacklist") || typeLower.includes("spam"),
    mobile: typeLower.includes("mobile"), residential: typeLower.includes("residential"), risk: numberOrNull(item.risk)
  };
  return { source: "proxycheck.io", ip: target, city: clean(item.city), region: clean(item.region), country: clean(item.country), countryCode: countryCode(item.isocode), isp: clean(pick(cloud.name, item.provider, item.organisation, item.operator, "未知组织")), cloudProvider: cloud.name, kind: classifyExitKind(flags), flags: flags };
}
function mergeExitSources(sources) {
  const valid = (sources || []).filter(i => i && i.ip);
  if (valid.length === 0) return { ip: "未识别", city: "检测失败", region: "", countryCode: "", isp: "未知组织", kind: "未知网络", flags: {} };
  const primaryIP = mostCommon(valid.map(i => i.ip)) || valid[0].ip;
  const sameIP = valid.filter(i => i.ip === primaryIP);
  const cloud = cloudProviderFromText(sameIP.map(i => [i.isp, i.cloudProvider, i.country, i.city, i.region].join(" ")).join(" "));
  const evidence = { proxyCount: 0, vpnCount: 0, torCount: 0, abuserCount: 0, mobileCount: 0, residentialCount: 0, riskMax: null, riskCount: 0 };
  let dcCount = 0, hostCount = 0, cloudCount = cloud.hit ? 1 : 0;
  sameIP.forEach(i => {
    const f = i.flags || {};
    if (f.datacenter) dcCount++; if (f.hosting) hostCount++; if (f.cloud) cloudCount++;
    if (f.proxy) evidence.proxyCount++; if (f.vpn) evidence.vpnCount++; if (f.tor) evidence.torCount++;
    if (f.abuser) evidence.abuserCount++; if (f.mobile) evidence.mobileCount++; if (f.residential) evidence.residentialCount++;
    if (Number.isFinite(Number(f.risk))) { evidence.riskCount++; evidence.riskMax = Math.max(Number(evidence.riskMax || 0), Number(f.risk)); }
  });
  const mergedFlags = {
    datacenter: dcCount > 0, hosting: hostCount > 0, cloud: cloudCount > 0, proxy: evidence.proxyCount > 0, vpn: evidence.vpnCount > 0,
    tor: evidence.torCount > 0, abuser: evidence.abuserCount > 0, mobile: evidence.mobileCount > 0, residential: evidence.residentialCount > 0, risk: evidence.riskMax, evidence: evidence
  };
  if (cloud.hit) { mergedFlags.datacenter = true; mergedFlags.hosting = true; mergedFlags.cloud = true; mergedFlags.residential = false; }
  return {
    ip: primaryIP, city: bestField(sameIP, "city") || "未知城市", region: bestField(sameIP, "region"), country: bestField(sameIP, "country"),
    countryCode: countryCode(bestField(sameIP, "countryCode")), isp: cloud.name || bestField(sameIP, "isp") || "未知组织", cloudProvider: cloud.name, kind: classifyExitKind(mergedFlags), flags: mergedFlags
  };
}
function classifyExitKind(flags) {
  if (flags.mobile) return "移动网络";
  if (flags.residential) return "住宅 IP";
  if (flags.datacenter || flags.hosting || flags.cloud) return "商业机房";
  if (flags.proxy || flags.vpn) return "住宅 IP";
  return "未知网络";
}
function cloudProviderFromText(value) {
  const text = clean(value).toLowerCase();
  if (!text) return { hit: false, name: "" };
  const providers = [["oracle", "Oracle"], ["aws", "AWS"], ["amazon", "AWS"], ["google cloud", "Google Cloud"], ["azure", "Microsoft Azure"], ["microsoft", "Microsoft Azure"], ["digitalocean", "DigitalOcean"], ["vultr", "Vultr"], ["linode", "Akamai Linode"], ["akamai", "Akamai"], ["cloudflare", "Cloudflare"], ["tencent cloud", "Tencent Cloud"], ["alibaba cloud", "Alibaba Cloud"], ["aliyun", "Alibaba Cloud"]];
  for (let i = 0; i < providers.length; i++) if (text.includes(providers[i][0])) return { hit: true, name: providers[i][1] };
  return { hit: false, name: "" };
}
function mostCommon(values) {
  const count = {}; let best = ""; let bestCount = 0;
  values.map(clean).filter(Boolean).forEach(v => { count[v] = (count[v] || 0) + 1; if (count[v] > bestCount) { best = v; bestCount = count[v]; } });
  return best;
}
function bestField(items, field) {
  const values = (items || []).map(i => clean(i[field])).filter(Boolean);
  return mostCommon(values) || values[0] || "";
}
function numberOrNull(value) { const parsed = Number(value); return !Number.isFinite(parsed) ? null : parsed; }
function parseLocalExit(data, forceLocalMainland) {
  if (!data || typeof data !== "object") return {};
  const ip = clean(pick(data.query, data.ip, data.ip_address, getAt(data, "location.ip")));
  if (!ip) return {};
  const cc = countryCode(pick(data.countryCode, data.country_code, getAt(data, "location.country_code")));
  const country = clean(pick(data.country, data.country_name, getAt(data, "location.country")));
  const region = clean(pick(data.regionName, data.region, getAt(data, "location.region")));
  const city = clean(pick(data.city, getAt(data, "location.city")));
  const isChina = cc === "CN" || country.includes("中国") || forceLocalMainland;
  return { ip: ip, country: isChina ? "中国" : country, countryCode: isChina ? "CN" : cc, region: region, city: city, isp: clean(pick(data.isp, data.org, data.organization)), label: isChina ? (region.replace(/省|市|自治区/g, "") || "中国大陆") : city };
}
function compactDNSProviderName(value) {
  const text = clean(value); if (!text) return "未知";
  const lower = text.toLowerCase();
  if (lower.includes("telecom")) return "电信"; if (lower.includes("mobile")) return "移动"; if (lower.includes("unicom")) return "联通";
  if (lower.includes("cloudflare")) return "CF"; if (lower.includes("google")) return "谷歌";
  const cleaned = text.replace(/company|limited|inc\.?|llc|corporation|network|communications?/ig, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "未知";
  if (/[\u4e00-\u9fa5]/.test(cleaned)) return cleaned.slice(0, 4);
  const first = cleaned.split(/[ ,，/|()]+/).filter(Boolean)[0];
  return first ? (first.length > 6 ? first.slice(0, 6) : first) : "未知";
}
function chooseDNSProvider(baseDNS, verifiedDNS) {
  if (verifiedDNS && verifiedDNS.ok && verifiedDNS.short) return { short: verifiedDNS.short };
  if (baseDNS && baseDNS.short) return { short: baseDNS.short };
  return { short: "未知" };
}
function purityScore(exit) {
  const flags = (exit && exit.flags) || {}; const evidence = flags.evidence || {}; const kind = clean(exit && exit.kind);
  let score = kind === "住宅 IP" ? 92 : kind === "移动网络" ? 92 : kind === "商业机房" ? 78 : 72;
  const proxyVpnCount = Number(evidence.proxyCount || 0) + Number(evidence.vpnCount || 0);
  if (Number(evidence.torCount || 0) > 0 || flags.tor) score -= 55;
  if (Number(evidence.abuserCount || 0) > 0 || flags.abuser) score -= 35;
  if (proxyVpnCount >= 2) score -= 30; else if (proxyVpnCount === 1) score -= 16;
  const rv = Number(flags.risk);
  if (Number.isFinite(rv)) { if (rv >= 80) score -= 25; else if (rv >= 70) score -= 20; else if (rv >= 40) score -= 10; else if (rv >= 20) score -= 4; }
  if (kind === "商业机房" || flags.datacenter || flags.hosting || flags.cloud) score -= 8;
  if ((kind === "住宅 IP" || kind === "移动网络") && !flags.proxy && !flags.vpn && !flags.tor && !flags.abuser) score += 3;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score: score, risk: 100 - score, evidence: evidence };
}
function riskLevel(exit, purity) {
  const flags = (exit && exit.flags) || {}; const evidence = flags.evidence || {};
  const score = Number(purity && purity.score); const rv = Number(flags.risk);
  const proxyVpnCount = Number(evidence.proxyCount || 0) + Number(evidence.vpnCount || 0);
  if (flags.tor || Number(evidence.torCount || 0) > 0 || flags.abuser || Number(evidence.abuserCount || 0) > 0 || rv >= 85 || score < 45 || (proxyVpnCount >= 2 && (score < 60 || rv >= 70))) return "高风险";
  if (score < 75 || flags.datacenter || flags.hosting || flags.cloud || proxyVpnCount > 0 || rv >= 40) return "中风险";
  return "低风险";
}
function toneColor(tone, colors) { return tone === "green" ? colors.green : tone === "red" ? colors.red : colors.amber; }
function parseIPv4(ip) { const parts = clean(ip).split("."); if (parts.length !== 4) return null; const values = parts.map(Number); return values.some(v => !Number.isInteger(v) || v < 0 || v > 255) ? null : values; }
function isPrivateIPv4(ip) { const p = parseIPv4(ip); return p ? (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)) : false; }
function isCGNATIPv4(ip) { const p = parseIPv4(ip); return p ? (p[0] === 100 && p[1] >= 64 && p[1] <= 127) : false; }
function isPublicIPv4(ip) { const p = parseIPv4(ip); return p ? (!isPrivateIPv4(ip) && !isCGNATIPv4(ip) && p[0] !== 0 && p[0] !== 127 && p[0] < 224 && !(p[0] === 169 && p[1] === 254)) : false; }
function detectNAT(localIP, exitIP) {
  if (isCGNATIPv4(localIP)) return { label: "CGNAT", tone: "amber" };
  if ((isPrivateIPv4(localIP) && isPublicIPv4(exitIP)) || isPublicIPv4(localIP)) return { label: "Open", tone: "green" };
  if (isPrivateIPv4(localIP)) return { label: "NAT", tone: "amber" };
  return { label: "未知", tone: "red" };
}
function detectDNSProvider(addresses) {
  const list = Array.isArray(addresses) ? addresses.map(clean).filter(Boolean) : [clean(addresses)].filter(Boolean);
  if (list.length === 0) return { short: "系统" };
  for (let i = 0; i < list.length; i++) {
    const raw = list[i].toLowerCase();
    if (raw.includes("1.1.1.1") || raw.includes("1.0.0.1") || raw.includes("cloudflare")) return { short: "CF" };
    if (raw.includes("8.8.8.8") || raw.includes("8.8.4.4") || raw.includes("google")) return { short: "谷歌" };
    if (raw.includes("223.5.5.5") || raw.includes("alidns")) return { short: "阿里" };
    if (raw.includes("119.29.29.29")) return { short: "腾讯" };
    if (raw.includes("114.114.114.114")) return { short: "114" };
  }
  return { short: "自定义" };
}
function gatewayLabel(value) { const gateway = clean(value); return (!gateway || gateway === "未获取") ? "—" : gateway; }
function shortISP(value) { const isp = clean(value); if (!isp || isp === "未知组织") return "未知"; if (isp.length <= 12) return isp; const words = isp.split(/\s+/); return words.length > 1 ? words[0] : isp.slice(0, 11) + "…"; }
function randomAlphaNum(length) { const chars = "abcdefghijklmnopqrstuvwxyz0123456789"; let out = ""; for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]; return out; }
function timeLabel(date) { return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0"); }
function dateLabel(date) { const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()]; return String(date.getMonth() + 1).padStart(2, "0") + "/" + String(date.getDate()).padStart(2, "0") + " 周" + weekday; }
function getScreenMetric(ctx, key) {
  const candidates = [getAt(ctx, "screen." + key), getAt(ctx, "device.screen." + key), getAt(ctx, "device.screenSize." + key)];
  try { if (typeof screen !== "undefined" && screen && Number(screen[key]) > 0) candidates.push(screen[key]); } catch (_) {}
  for (let i = 0; i < candidates.length; i++) { const value = Number(candidates[i]); if (Number.isFinite(value) && value > 0) return value; } return "";
}
function detectScheme(ctx) {
  const raw = clean(pick(ctx.colorScheme, ctx.appearance, ctx.theme, ctx.widgetColorScheme)).toLowerCase();
  return (raw.includes("dark") || raw.includes("深") || raw === "2") ? "dark" : "light";
}
function clean(value) { return String(value === undefined || value === null ? "" : value).trim(); }
function clamp(value, min, max) { const number = Number(value); return !Number.isFinite(number) ? min : Math.max(min, Math.min(max, number)); }
function numberInRange(value, min, max, fallback) { const parsed = Number(value); return !Number.isFinite(parsed) ? fallback : Math.max(min, Math.min(max, Math.round(parsed))); }
function pick() { for (let i = 0; i < arguments.length; i++) { const value = arguments[i]; if (value !== undefined && value !== null && clean(value) !== "") return value; } return ""; }
function getAt(object, path) {
  const keys = String(path).split("."); let current = object;
  for (let i = 0; i < keys.length; i++) { if (!current || typeof current !== "object" || !(keys[i] in current)) return ""; current = current[keys[i]]; }
  return current === undefined || current === null ? "" : current;
}
function truthy(value) { return value === true || value === 1 || ["true", "1", "yes", "y"].includes(clean(value).toLowerCase()); }
function parseTrace(value) {
  const output = {};
  String(value || "").split(/\r?\n/).forEach(line => { const position = line.indexOf("="); if (position > 0) output[line.slice(0, position).trim()] = line.slice(position + 1).trim(); });
  return output;
}
function countryCode(value) { const code = clean(value).toUpperCase(); return /^[A-Z]{2}$/.test(code) ? code : ""; }
function flag(value) { const code = countryCode(value); return !code ? "" : String.fromCodePoint(code.charCodeAt(0) + 127397) + String.fromCodePoint(code.charCodeAt(1) + 127397); }
