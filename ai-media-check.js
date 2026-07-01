/**
 * Egern小组件: 网络服务解锁监测 (穿透 WAF 黑名单校验版)
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

  // 伪装成现代 macOS Chrome 以减少底层 WAF 阻断
  const BASE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
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
      return { code: data.countryCode ? 'OK' : 'ERR', region: data.countryCode || null };
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
    // 增加一种正则匹配模式，防止 YT DOM 结构变化导致提取 null
    let match = body.match(/"countryCode":"([A-Z]{2})"/i);
    if (!match) match = body.match(/GL":\s*"([A-Z]{2})"/i);
    return { code: 'OK', region: match ? match[1].toUpperCase() : null };
  }

  async function checkNetflix() {
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

    // 放弃直接请求网页端 API 以避开 WAF，改用物理落地国家比对 OpenAI 黑名单
    const blockedRegions = ['CN', 'HK', 'MO', 'RU', 'IR', 'KP', 'SY', 'CU'];
    const webOk = region && !blockedRegions.includes(region);

    // App API 通常允许部分黑名单地区（如 HK）直连，作为特判
    const appRes = await ctx.http.get('https://ios.chat.openai.com/public-api/mobile/server_status/v1', {
      timeout: 4000,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' }
    }).catch(() => null);
    const appOk = appRes && appRes.status === 200;

    if (webOk) return { code: 'OK', region: region }; 
    if (!webOk && appOk) return { code: 'OK', region: region, suffix: '(App)' }; 
    
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

    // 同样放弃请求 login 或 api 接口硬刚 CF 验证码，改用物理落地黑名单校验
    const blockedRegions = ['CN', 'HK', 'MO', 'RU', 'BY', 'IR', 'KP', 'SY', 'CU'];
    const claudeOk = region && !blockedRegions.includes(region);

    if (claudeOk) return { code: 'OK', region: region };
    return { code: 'ERR', region: region };
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

    // region 为 null，完全交由外层的 youtube/proxy 区域解析链处理
    if (webOk) return { code: 'OK', region: null }; 
    if (!webOk && apiOk) return { code: 'OK', region: null, suffix: '(API)' };
    
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

  const resultInfo = (result, fallbackRegion) => {
    const available = result && result.code !== 'ERR';
    let region = '--';
    
    if (available) {
      // 深度降级链：自身区域 -> 传入的 fallback -> '--'
      let base = result.region || fallbackRegion || '--';
      let suffix = result.suffix || '';
      
      if (base === '--' && suffix) {
        region = suffix;
      } else {
        region = `${base}${suffix}`;
      }
    }
    return { available, region };
  };

  const streaming = [
    { name: 'YouTube', info: resultInfo(youtube, proxy.region) },
    { name: 'Netflix', info: resultInfo(netflix, proxy.region) },
    { name: 'Disney+', info: resultInfo(disney, proxy.region) }
  ];

  const ai = isLarge ? [
    // GPT 和 Claude 不接受回退区域，强制依赖自身 Trace 确保不出错
    { name: 'ChatGPT', info: resultInfo(chatgpt, null) }, 
    { name: 'Claude', info: resultInfo(claude, null) },
    // 强制 Gemini 挂靠 YouTube 区域，若 YouTube 测出 null，则再次降级使用底层节点 proxy 区域
    { name: 'Gemini', info: resultInfo(gemini, youtube.region || proxy.region) }
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
