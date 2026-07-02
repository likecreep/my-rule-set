/**
 * Egern小组件: 网络服务解锁监测
 * 修复版：并发解耦测速逻辑，使用 204/favicon 探针获取真实 HTTPS 延迟
 */
export default async function(ctx) {
  const MODE = 'auto'; // auto / large / compact

  const C = {
    bg:       { light: '#FFFFFF', dark: '#050506' },
    text:     { light: '#111114', dark: '#F7F7F8' },
    dim:      { light: '#7B7B84', dark: '#85858E' },
    panel:    { light: '#F5F5F7', dark: '#111114' },
    hairline: { light: '#E4E4E8', dark: '#242429' },
    chip:     { light: '#ECECF1', dark: '#202025' },
    accent:   { light: '#7446D8', dark: '#B765FF' },
    ok:       { light: '#2F9E58', dark: '#C7FF18' },
    fail:     { light: '#D64545', dark: '#FF626A' }
  };

  const BASE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const commonHeaders = { 'User-Agent': BASE_UA };

  const family = String(ctx.widgetFamily || ctx.family || ctx.widgetSize || '').toLowerCase();
  const isLarge = MODE === 'large' || (MODE === 'auto' && family.includes('large'));
  const isCompact = !isLarge;

  const getFlagEmoji = (cc) => {
    if (!cc || cc === 'XX' || cc === '--' || cc === 'UNKNOWN' || cc === 'OK' || cc.length < 2) return '🌐';
    const code = cc.substring(0, 2).toUpperCase();
    return code.replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
  };

  // ==== 核心修复：并发解耦测速逻辑 ====
  async function safe(fn, pingUrl) {
    try {
      const getPing = async () => {
        if (!pingUrl) return 0;
        const start = Date.now();
        // 请求极小的图标或 204 无内容页面，仅测算网络通信往返+首字节时间
        await ctx.http.get(pingUrl, { timeout: 3000 }).catch(() => null);
        return Date.now() - start;
      };

      // 并发执行：业务逻辑与测速逻辑同时跑，互不干扰时间
      const [res, pingMs] = await Promise.all([
        fn(),
        getPing()
      ]);

      return { ...res, ms: pingMs || 0 };
    } catch {
      return { code: 'ERR', region: null, ms: 0 };
    }
  }

  async function getBody(res) {
    try { return await res.text(); } catch { return ''; }
  }

  // ==== 业务探测逻辑 ====
  async function fetchProxy() {
    try {
      const res = await ctx.http.get('http://ip-api.com/json/?lang=zh-CN', { timeout: 4000 });
      if (!res || res.status !== 200) return { code: 'ERR', region: null };
      const data = JSON.parse(await getBody(res));
      return { code: data.countryCode ? 'OK' : 'ERR', region: data.countryCode || null };
    } catch {
      return { code: 'ERR', region: null };
    }
  }

  async function checkYouTube() {
    const IOS_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    const res = await ctx.http.get('https://www.youtube.com/premium', {
      timeout: 4000, 
      headers: { 'User-Agent': IOS_SAFARI_UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'SOCS=CAI' }
    }).catch(() => null);
    
    if (!res || res.status !== 200) return { code: 'ERR', region: null };

    let regionFromCookie = null;
    const responseHeaders = res.headers || {};
    let setCookie = responseHeaders['Set-Cookie'] || responseHeaders['set-cookie'] || '';
    if (Array.isArray(setCookie)) setCookie = setCookie.join('; ');
    else if (typeof setCookie !== 'string') setCookie = String(setCookie);
    
    const privacyMatch = setCookie.match(/VISITOR_PRIVACY_METADATA=([^;]+)/);
    if (privacyMatch) {
      try { regionFromCookie = atob(decodeURIComponent(privacyMatch[1])).substring(2, 4).toUpperCase(); } catch (e) {}
    }

    const body = await res.text();
    if (body.includes('Premium is not available in your country')) return { code: 'ERR', region: regionFromCookie };
    
    let finalRegion = regionFromCookie || 'UNKNOWN';
    const match = body.match(/"INNERTUBE_CONTEXT_GL"\s*:\s*"([^"]+)"/i)
    if (match && match[1]) finalRegion = match[1].toUpperCase();
    return { code: 'OK', region: finalRegion };
  }

  async function checkNetflix() {
    const innerCheck = async (filmId) => {
      const res = await ctx.http.get('https://www.netflix.com/title/' + filmId, { timeout: 4000, headers: commonHeaders, followRedirect: false }).catch(() => null);
      if (!res) return { status: 'Error' };
      if (res.status === 403) return { status: 'Not Available' };
      if (res.status === 404) return { status: 'Not Found' };
      
      if (res.status === 200) {
        let region = 'US';
        const headers = res.headers || {};
        const url = headers['x-originating-url'] || headers['X-Originating-Url'];
        if (url) {
          const parts = url.split('/');
          if (parts.length > 3 && parts[3].split('-')[0].toUpperCase() !== 'TITLE') region = parts[3].split('-')[0].toUpperCase();
        }
        return { status: 'OK', region: region };
      }
      return { status: 'Error' };
    };

    const check1 = await innerCheck(81280792);
    if (check1.status === 'OK') return { code: 'OK', region: check1.region, suffix: '(全)' };
    if (check1.status === 'Not Found') {
      const check2 = await innerCheck(80018499);
      if (check2.status === 'OK') return { code: 'OK', region: check2.region, suffix: '(自)' };
    }
    return { code: 'ERR', region: null };
  }

  async function checkDisney() {
    try {
      const gqlOpts = {
        timeout: 5000,
        headers: {
          'Accept-Language': 'en', 'Authorization': 'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84',
          'Content-Type': 'application/json', 'User-Agent': BASE_UA
        },
        body: JSON.stringify({
          query: 'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
          variables: { input: { applicationRuntime: 'chrome', attributes: { browserName: 'chrome', browserVersion: '94.0.4606', manufacturer: 'apple', model: null, operatingSystem: 'macintosh', operatingSystemVersion: '10.15.7', osDeviceIds: [] }, deviceFamily: 'browser', deviceLanguage: 'en', deviceProfile: 'macosx' } }
        })
      };
      
      const gqlRes = await ctx.http.post('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', gqlOpts).catch(() => null);
      if (!gqlRes || gqlRes.status !== 200) return { code: 'ERR', region: null };

      const data = JSON.parse(await getBody(gqlRes));
      if (!data?.errors && data?.extensions?.sdk) {
        const sdk = data.extensions.sdk;
        const inSupportedLocation = sdk.session?.inSupportedLocation;
        let region = sdk.session?.location?.countryCode ? sdk.session.location.countryCode.toUpperCase() : null;
        
        if (inSupportedLocation === false || String(inSupportedLocation) === 'false') return { code: 'OK', region: region, suffix: '(即将)' };
        else if (region) return { code: 'OK', region: region };
      }
      return { code: 'ERR', region: null };
    } catch (e) {
      return { code: 'ERR', region: null };
    }
  }

  async function checkChatGPT() {
    let region = null;
    const trace = await ctx.http.get('https://chatgpt.com/cdn-cgi/trace', { timeout: 3000 }).catch(() => null);
    if (trace && trace.status === 200) {
      const body = await getBody(trace);
      const match = body.match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }
    const resWeb = await ctx.http.get('https://api.openai.com/compliance/cookie_requirements', { timeout: 4000, headers: { ...commonHeaders, 'authority': 'api.openai.com', 'authorization': 'Bearer null' } }).catch(() => null);
    const resApp = await ctx.http.get('https://ios.chat.openai.com/', { timeout: 4000, headers: { ...commonHeaders, 'authority': 'ios.chat.openai.com' } }).catch(() => null);

    let webBlocked = true; let appBlocked = true;
    if (resWeb) { if (!(await getBody(resWeb)).toLowerCase().includes('unsupported_country')) webBlocked = false; }
    if (resApp) { if (!(await getBody(resApp)).toLowerCase().includes('vpn')) appBlocked = false; }

    if (!webBlocked && !appBlocked) return { code: 'OK', region: region }; 
    if (!webBlocked && appBlocked) return { code: 'OK', region: region, suffix: '(Web)' };
    if (webBlocked && !appBlocked) return { code: 'OK', region: region, suffix: '(App)' }; 
    return { code: 'ERR', region: region };
  }

  async function checkClaude() {
    let region = null;
    const trace = await ctx.http.get('https://claude.ai/cdn-cgi/trace', { timeout: 3000 }).catch(() => null);
    if (trace && trace.status === 200) {
      const match = (await getBody(trace)).match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }
    const res = await ctx.http.get('https://claude.ai/', { timeout: 4000, headers: commonHeaders, followRedirect: false }).catch(() => null);
    if (!res) return { code: 'ERR', region: region };

    if (res.status >= 300 && res.status < 400) {
        const loc = res.headers['Location'] || res.headers['location'] || '';
        if (loc.includes('app-unavailable-in-region')) return { code: 'ERR', region: region };
    } else if (res.status === 200) {
        if ((await getBody(res)).includes('app-unavailable-in-region')) return { code: 'ERR', region: region };
    }
    return { code: 'OK', region: region };
  }

  async function checkGemini() {
    const res = await ctx.http.get('https://gemini.google.com', { timeout: 5000, headers: commonHeaders, followRedirect: true }).catch(() => null);
    if (!res) return { code: 'ERR', region: null };
    const body = await getBody(res);
    if (!body.includes('45631641,null,true')) return { code: 'ERR', region: null };

    let region = null;
    const match = body.match(/,2,1,200,"([A-Z]{2,3})"/);
    if (match && match[1]) region = match[1];
    return { code: 'OK', region: region || 'OK' };
  }

  // ==== 绑定探针 URL，分离测速耗时 ====
  const checks = [
    safe(fetchProxy, 'http://cp.cloudflare.com/generate_204'), 
    safe(checkYouTube, 'https://www.youtube.com/generate_204'), 
    safe(checkNetflix, 'https://www.netflix.com/favicon.ico'), 
    safe(checkDisney, 'https://www.disneyplus.com/favicon.ico'), 
    safe(checkChatGPT, 'https://chatgpt.com/favicon.ico'), 
    safe(checkClaude, 'https://claude.ai/favicon.ico'), 
    safe(checkGemini, 'https://gemini.google.com/favicon.ico')
  ];

  const results = await Promise.all(checks);
  const [proxy, youtube, netflix, disney, chatgpt, claude, gemini] = results;

  const resultInfo = (result, fallbackRegion) => {
    const available = result && result.code !== 'ERR';
    let region = '--';
    let ms = result?.ms || 0;
    
    if (available) {
      let base = result.region || fallbackRegion || '--';
      let suffix = result.suffix || '';
      let emoji = getFlagEmoji(base);
      region = (base === '--' && suffix) ? `${emoji} ${suffix}` : `${emoji} ${base}${suffix}`;
    }
    return { available, region, ms };
  };

  const streaming = [
    { name: 'YouTube', info: resultInfo(youtube, proxy.region) },
    { name: 'Netflix', info: resultInfo(netflix, proxy.region) },
    { name: 'Disney+', info: resultInfo(disney, proxy.region) }
  ];

  const ai = [
    { name: 'ChatGPT', info: resultInfo(chatgpt, proxy.region) }, 
    { name: 'Claude', info: resultInfo(claude, proxy.region) },
    { name: 'Gemini', info: resultInfo(gemini, proxy.region) }
  ];

  const allServices = [...streaming, ...ai];
  const okCount = allServices.filter(item => item.info.available).length;
  const lockedCount = allServices.length - okCount;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const Dot = available => ({
    type: 'stack', width: isCompact ? 6 : 9, height: isCompact ? 6 : 9, borderRadius: isCompact ? 3 : 4.5,
    backgroundColor: available ? C.ok : C.fail, children: []
  });

  const RegionChip = region => ({
    type: 'stack', padding: isCompact ? [1.5, 4] : [2, 6], backgroundColor: C.chip, borderRadius: 4, alignItems: 'center',
    children: [{ type: 'text', text: region || '--', font: { size: isCompact ? 8 : 10, weight: 'bold', design: 'monospaced' }, textColor: C.text, maxLines: 1 }]
  });

  const ServiceRow = item => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
    children: [
      { type: 'text', text: item.name, font: { size: isCompact ? 10 : 12, weight: 'semibold' }, textColor: C.text, flex: 1, maxLines: 1 },
      ...(item.info.available ? [{ type: 'text', text: `${item.info.ms}ms`, font: { size: isCompact ? 8 : 10, weight: 'medium', design: 'monospaced' }, textColor: C.dim, maxLines: 1 }] : []),
      RegionChip(item.info.region),
      Dot(item.info.available)
    ]
  });

  const Hairline = () => ({ type: 'stack', height: 1, backgroundColor: C.hairline });

  const Group = (label, items) => {
    const groupOk = items.filter(item => item.info.available).length;
    return {
      type: 'stack', direction: 'column', flex: 1, gap: isCompact ? 4 : 6, padding: isCompact ? [6, 8] : [8, 10],
      backgroundColor: C.panel, borderRadius: 8,
      children: [
        {
          type: 'stack', direction: 'row', alignItems: 'center', children: [
            { type: 'text', text: label, font: { size: isCompact ? 9 : 11, weight: 'bold' }, textColor: C.accent, maxLines: 1 },
            { type: 'spacer' },
            { type: 'text', text: `${groupOk}/${items.length}`, font: { size: isCompact ? 9 : 10, weight: 'semibold', design: 'monospaced' }, textColor: C.dim, maxLines: 1 }
          ]
        },
        ServiceRow(items[0]), Hairline(), ServiceRow(items[1]), Hairline(), ServiceRow(items[2])
      ]
    };
  };

  return {
    type: 'widget', backgroundColor: C.bg, padding: isCompact ? [12, 12, 12, 12] : [10, 12, 10, 12], gap: 8,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', children: [
          { type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [
              { type: 'image', src: 'sf-symbol:globe', color: C.accent, width: 15, height: 15 },
              { type: 'text', text: 'NETWORK MONITOR', font: { size: 10, weight: 'bold' }, textColor: C.dim, maxLines: 1 }
            ]
          },
          { type: 'spacer' },
          { type: 'text', text: time, font: { size: 10, weight: 'medium', design: 'monospaced' }, textColor: C.dim, maxLines: 1 }
        ]
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 8, children: [
          Dot(lockedCount === 0),
          { type: 'text', text: `${okCount}/${allServices.length}`, font: { size: 24, weight: 'bold', design: 'monospaced' }, textColor: C.text, maxLines: 1 },
          { type: 'spacer' },
          { type: 'text', text: lockedCount === 0 ? '全部可用' : `${lockedCount} 项不可用`, font: { size: 11, weight: 'semibold' }, textColor: lockedCount === 0 ? C.dim : C.fail, maxLines: 1 }
        ]
      },
      {
        type: 'stack', direction: isCompact ? 'row' : 'column', gap: 8, flex: 1, children: [
          Group(isCompact ? '流媒体' : '流媒体解锁', streaming),
          Group(isCompact ? 'AI服务' : 'AI 服务检测', ai)
        ]
      }
    ]
  };
}
