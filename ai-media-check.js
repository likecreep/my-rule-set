/**
 * Egern小组件: 网络服务解锁监测 (精确风控穿透版)
 * 大组件: 流媒体 + AI 全部显示
 * 中/小组件: 只显示流媒体
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

  const BASE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const commonHeaders = { 'User-Agent': BASE_UA };

  const family = String(ctx.widgetFamily || ctx.family || ctx.widgetSize || '').toLowerCase();
  const isLarge = MODE === 'large' || (MODE === 'auto' && family.includes('large'));
  const isCompact = !isLarge;

  async function safe(fn) {
    try {
      return await fn();
    } catch {
      return { code: 'ERR', region: null };
    }
  }

  async function getBody(res) {
    try { return await res.text(); } catch { return ''; }
  }

  async function fetchProxy() {
    try {
      const res = await ctx.http.get('http://ip-api.com/json/?lang=zh-CN', { timeout: 4000 });
      if (!res || res.status !== 200) return { code: 'ERR', region: null };
      const data = JSON.parse(await getBody(res));
      const cc = data.countryCode || null;
      return { code: cc ? 'OK' : 'ERR', region: cc };
    } catch {
      return { code: 'ERR', region: null };
    }
  }

  async function checkYouTube() {
    const res = await ctx.http.get('https://www.youtube.com/premium', {
      timeout: 4000, headers: commonHeaders
    }).catch(() => null);
    
    if (!res || res.status !== 200) return { code: 'ERR', region: null };
    const body = await getBody(res);
    const match = body.match(/"countryCode":"([A-Z]{2})"/i);
    return { code: 'OK', region: match ? match[1].toUpperCase() : null };
  }

  async function checkNetflix() {
    // 80018499 用于判定是否全解锁
    const res = await ctx.http.get('https://www.netflix.com/title/80018499', {
      timeout: 4000, headers: commonHeaders, followRedirect: false
    }).catch(() => null);

    if (!res || res.status !== 200) return { code: 'ERR', region: null };

    const body = await getBody(res);
    const match = body.match(/"requestCountry":"([A-Z]{2})"/i) || body.match(/"geolocation":\{"country":"([A-Z]{2})"\}/i);
    return { code: 'OK', region: match ? match[1].toUpperCase() : null };
  }

  async function checkDisney() {
    const res = await ctx.http.get('https://www.disneyplus.com', {
      timeout: 4000, headers: commonHeaders, followRedirect: false
    }).catch(() => null);

    if (!res || res.status === 403) return { code: 'ERR', region: null };

    let region = null;
    if (res.headers) {
      for (const [key, value] of Object.entries(res.headers)) {
        if (key.toLowerCase() === 'x-dss-edge-country') {
          region = value.toUpperCase();
          break;
        }
      }
    }
    return { code: 'OK', region };
  }

  async function checkChatGPT() {
    let region = null;
    const trace = await ctx.http.get('https://chatgpt.com/cdn-cgi/trace', { timeout: 3000 }).catch(() => null);
    if (trace && trace.status === 200) {
      const body = await getBody(trace);
      const match = body.match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }

    // 网页端检测 (通过请求接口判断，401 或 JSON 意味着穿透了 CF WAF)
    const webRes = await ctx.http.get('https://chatgpt.com/backend-api/models', {
      timeout: 4000,
      headers: { ...commonHeaders, 'Accept': 'application/json' }
    }).catch(() => null);
    
    let webOk = false;
    if (webRes) {
      const contentType = webRes.headers['Content-Type'] || webRes.headers['content-type'] || '';
      if (webRes.status === 401 || webRes.status === 200 || (webRes.status === 403 && contentType.includes('application/json'))) {
        webOk = true;
      }
    }

    // App端检测
    const appRes = await ctx.http.get('https://ios.chat.openai.com/public-api/mobile/server_status/v1', {
      timeout: 4000,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/json'
      }
    }).catch(() => null);
    const appOk = appRes && appRes.status === 200;

    // 综合判定逻辑
    if (webOk) return { code: 'OK', region: region }; // 解锁Web，直接显示地区
    if (!webOk && appOk) return { code: 'OK', region: region ? `${region}(App)` : '(App)' }; // 仅解锁App
    
    return { code: 'ERR', region: region };
  }

  async function checkClaude() {
    let region = null;
    const trace = await ctx.http.get('https://claude.ai/cdn-cgi/trace', { timeout: 3000 }).catch(() => null);
    if (trace && trace.status === 200) {
      const body = await getBody(trace);
      const match = body.match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }

    // 利用 API 接口穿透 CF JS Challenge
    const apiRes = await ctx.http.get('https://claude.ai/api/organizations', {
      timeout: 4000,
      headers: { ...commonHeaders, 'Accept': 'application/json' }
    }).catch(() => null);

    let claudeOk = false;
    if (apiRes) {
      const contentType = apiRes.headers['Content-Type'] || apiRes.headers['content-type'] || '';
      // 401/JSON 403 表示请求到达后端(未被区域封锁)；HTML 403 为 CF 阻断
      if (apiRes.status === 401 || apiRes.status === 200 || (apiRes.status === 403 && contentType.includes('application/json'))) {
        claudeOk = true;
      }
    }

    if (claudeOk) return { code: 'OK', region };
    return { code: 'ERR', region };
  }

  async function checkGemini() {
    const webRes = await ctx.http.get('https://gemini.google.com/app', {
      timeout: 4000, headers: commonHeaders, followRedirect: false
    }).catch(() => null);
    const webOk = webRes && webRes.status === 200;

    const apiRes = await ctx.http.get('https://generativelanguage.googleapis.com/v1beta/models', {
      timeout: 4000, headers: { ...commonHeaders, 'Accept': 'application/json' }
    }).catch(() => null);
    
    let apiOk = false;
    if (apiRes) {
       const contentType = apiRes.headers['Content-Type'] || apiRes.headers['content-type'] || '';
       if (apiRes.status === 401 || apiRes.status === 400 || apiRes.status === 200 || (apiRes.status === 403 && contentType.includes('application/json'))) {
         apiOk = true;
       }
    }

    if (webOk) return { code: 'OK', region: 'OK' }; // Web通杀，不再强制绑定Proxy地域
    if (!webOk && apiOk) return { code: 'OK', region: 'API' };
    
    return { code: 'ERR', region: null };
  }

  const checks = isLarge
    ? [safe(fetchProxy), safe(checkYouTube), safe(checkNetflix), safe(checkDisney), safe(checkChatGPT), safe(checkClaude), safe(checkGemini)]
    : [safe(fetchProxy), safe(checkYouTube), safe(checkNetflix), safe(checkDisney)];

  const results = await Promise.all(checks);

  const proxy = results[0];
  const youtube = results[1];
  const netflix = results[2];
  const disney = results[3];
  const chatgpt = isLarge ? results[4] : null;
  const claude = isLarge ? results[5] : null;
  const gemini = isLarge ? results[6] : null;

  // useFallback 控制是否强制继承默认出口 IP
  const resultInfo = (result, fallbackRegion, useFallback = true) => {
    const available = result && result.code !== 'ERR';
    let region = '--';
    
    if (available) {
      if (result.region && result.region !== '--') {
        region = result.region;
      } else if (useFallback && fallbackRegion) {
        region = fallbackRegion;
      } else {
        region = 'OK'; 
      }
    }
    return { available, region };
  };

  const streaming = [
    { name: 'YouTube', info: resultInfo(youtube, proxy.region, true) },
    { name: 'Netflix', info: resultInfo(netflix, proxy.region, true) },
    { name: 'Disney+', info: resultInfo(disney, proxy.region, true) }
  ];

  const ai = isLarge ? [
    // AI 探针自身拥有 Trace 能力，关闭 Fallback 防止因策略组分流不同导致地区张冠李戴
    { name: 'ChatGPT', info: resultInfo(chatgpt, proxy.region, false) },
    { name: 'Claude', info: resultInfo(claude, proxy.region, false) },
    { name: 'Gemini', info: resultInfo(gemini, proxy.region, false) }
  ] : [];

  const allServices = [...streaming, ...ai];
  const okCount = allServices.filter(item => item.info.available).length;
  const lockedCount = allServices.length - okCount;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const Dot = available => ({
    type: 'stack', width: 9, height: 9, borderRadius: 5,
    backgroundColor: available ? C.ok : C.fail, children: []
  });

  const RegionChip = region => ({
    type: 'stack',
    padding: [2, 6], 
    backgroundColor: C.chip, borderRadius: 5, alignItems: 'center',
    children: [
      {
        type: 'text', text: region || '--',
        font: { size: 10, weight: 'bold', design: 'monospaced' },
        textColor: C.text, maxLines: 1
      }
    ]
  });

  const ServiceRow = item => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 8,
    children: [
      {
        type: 'text', text: item.name,
        font: { size: isCompact ? 13 : 12, weight: 'semibold' },
        textColor: C.text, flex: 1, maxLines: 1
      },
      RegionChip(item.info.region),
      Dot(item.info.available)
    ]
  });

  const Hairline = () => ({
    type: 'stack', height: 1, backgroundColor: C.hairline
  });

  const Group = (label, items) => {
    const groupOk = items.filter(item => item.info.available).length;
    return {
      type: 'stack', direction: 'column',
      gap: isCompact ? 8 : 6, padding: isCompact ? [10, 12] : [8, 10],
      backgroundColor: C.panel, borderRadius: 8,
      children: [
        {
          type: 'stack', direction: 'row', alignItems: 'center',
          children: [
            { type: 'text', text: label, font: { size: 11, weight: 'bold' }, textColor: C.accent, maxLines: 1 },
            { type: 'spacer' },
            { type: 'text', text: `${groupOk}/${items.length}`, font: { size: 10, weight: 'semibold', design: 'monospaced' }, textColor: C.dim, maxLines: 1 }
          ]
        },
        ServiceRow(items[0]), Hairline(), ServiceRow(items[1]), Hairline(), ServiceRow(items[2])
      ]
    };
  };

  return {
    type: 'widget',
    backgroundColor: C.bg, padding: isCompact ? [12, 14, 12, 14] : [10, 12, 10, 12], gap: isCompact ? 10 : 8,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          {
            type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
            children: [
              { type: 'image', src: 'sf-symbol:globe', color: C.accent, width: 15, height: 15 },
              { type: 'text', text: 'NETWORK MONITOR', font: { size: 10, weight: 'bold' }, textColor: C.dim, maxLines: 1 }
            ]
          },
          { type: 'spacer' },
          { type: 'text', text: time, font: { size: 10, weight: 'medium', design: 'monospaced' }, textColor: C.dim, maxLines: 1 }
        ]
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 8,
        children: [
          Dot(lockedCount === 0),
          {
            type: 'text', text: `${okCount}/${allServices.length}`,
            font: { size: isCompact ? 28 : 24, weight: 'bold', design: 'monospaced' }, textColor: C.text, maxLines: 1
          },
          { type: 'spacer' },
          {
            type: 'text', text: lockedCount === 0 ? '全部可用' : `${lockedCount} 项不可用`,
            font: { size: 11, weight: 'semibold' }, textColor: lockedCount === 0 ? C.dim : C.fail, maxLines: 1
          }
        ]
      },
      Group('流媒体解锁', streaming),
      ...(isLarge ? [Group('AI 服务检测', ai)] : [])
    ]
  };
}
