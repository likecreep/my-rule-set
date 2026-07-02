/**
 * Egern小组件: 网络服务解锁监测 (穿透 WAF 黑名单校验版)
 * 大组件: 流媒体 + AI 全部显示
 * 中/小组件: 只显示流媒体
 * 更新: AI 服务深度解锁检测重构版 (匹配最新限制规则)
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
    const IOS_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    
    const headers = { 
      'User-Agent': IOS_SAFARI_UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'SOCS=CAI' // 强制绕过隐私拦截页
    };
    
    const res = await ctx.http.get('https://www.youtube.com/premium', {
      timeout: 4000, headers
    }).catch(() => null);
    
    if (!res || res.status !== 200) return { code: 'ERR', region: null };

    // ==========================================
    // 1. 优先从 Cookie 中提取国家代码 (降维打击)
    // ==========================================
    let regionFromCookie = null;
    const responseHeaders = res.headers || {};
    const setCookieHeader = responseHeaders['Set-Cookie'] || responseHeaders['set-cookie'] || '';
    
    const privacyMatch = setCookieHeader.match(/VISITOR_PRIVACY_METADATA=([^;]+)/);
    if (privacyMatch) {
      try {
        const b64 = decodeURIComponent(privacyMatch[1]);
        // 原生 atob 解码，直接截取第 3、4 位的明文 ASCII 字符
        const decoded = atob(b64);
        regionFromCookie = decoded.substring(2, 4).toUpperCase();
      } catch (e) {
        // 解码异常则静默，交由后续 Body 正则兜底
      }
    }

    // 严格拦截送中节点
    if (regionFromCookie === 'CN') return { code: 'ERR', region: 'CN' };

    const body = await res.text();
    
    // 2. 双重文本特征拦截
    if (body.includes('www.google.cn')) return { code: 'ERR', region: 'CN' }; 
    if (body.includes('Premium is not available in your country')) return { code: 'ERR', region: null };
    
    // 3. 最终地区判定
    let finalRegion = regionFromCookie || 'UNKNOWN';
    if (finalRegion === 'UNKNOWN') {
      const match = body.match(/"?INNERTUBE_CONTEXT_GL"?\s*:\s*"([^"]+)"/i) || 
                    body.match(/"?countryCode"?\s*:\s*"([^"]+)"/i) ||
                    body.match(/"?GL"?\s*:\s*"([^"]+)"/i);
      if (match && match[1]) {
        finalRegion = match[1].toUpperCase();
      }
    }
    
    return { code: 'OK', region: finalRegion };
  }




  async function checkNetflix() {
    const innerCheck = async (filmId) => {
      const res = await ctx.http.get('https://www.netflix.com/title/' + filmId, {
        timeout: 4000, headers: commonHeaders, followRedirect: false
      }).catch(() => null);
      
      if (!res) return { status: 'Error' };
      if (res.status === 403) return { status: 'Not Available' };
      if (res.status === 404) return { status: 'Not Found' };
      
      if (res.status === 200) {
        let region = 'US'; // Fallback
        const headers = res.headers || {};
        const url = headers['x-originating-url'] || headers['X-Originating-Url'];
        
        if (url) {
          const parts = url.split('/');
          if (parts.length > 3) {
            let reg = parts[3].split('-')[0].toUpperCase();
            if (reg !== 'TITLE') region = reg;
          }
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
          'Accept-Language': 'en',
          'Authorization': 'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84',
          'Content-Type': 'application/json',
          'User-Agent': BASE_UA
        },
        body: JSON.stringify({
          query: 'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
          variables: {
            input: {
              applicationRuntime: 'chrome',
              attributes: {
                browserName: 'chrome', browserVersion: '94.0.4606', manufacturer: 'apple',
                model: null, operatingSystem: 'macintosh', operatingSystemVersion: '10.15.7', osDeviceIds: []
              },
              deviceFamily: 'browser', deviceLanguage: 'en', deviceProfile: 'macosx'
            }
          }
        })
      };
      
      const gqlRes = await ctx.http.post('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', gqlOpts).catch(() => null);
      if (!gqlRes || gqlRes.status !== 200) {
        return { code: 'ERR', region: null };
      }

      const gqlBody = await getBody(gqlRes);
      const data = JSON.parse(gqlBody);
      
      if (!data?.errors && data?.extensions?.sdk) {
        const sdk = data.extensions.sdk;
        const inSupportedLocation = sdk.session?.inSupportedLocation;
        const countryCode = sdk.session?.location?.countryCode;
        
        let region = null;
        if (countryCode) region = countryCode.toUpperCase();
        
        if (inSupportedLocation === false || String(inSupportedLocation) === 'false') {
          return { code: 'OK', region: region, suffix: '(即将)' };
        } else if (region) {
          return { code: 'OK', region: region };
        }
      }
      return { code: 'ERR', region: null };
    } catch (e) {
      return { code: 'ERR', region: null };
    }
  }

  // ==== ChatGPT 重构版 ====
  async function checkChatGPT() {
    let region = null;
    // 获取 Cloudflare Trace 节点地，便于显示
    const trace = await ctx.http.get('https://chatgpt.com/cdn-cgi/trace', { timeout: 3000 }).catch(() => null);
    if (trace && trace.status === 200) {
      const body = await getBody(trace);
      const match = body.match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }

    // Web 端校验
    const resWeb = await ctx.http.get('https://api.openai.com/compliance/cookie_requirements', {
      timeout: 4000,
      headers: { ...commonHeaders, 'authority': 'api.openai.com', 'authorization': 'Bearer null' }
    }).catch(() => null);

    // App 端校验
    const resApp = await ctx.http.get('https://ios.chat.openai.com/', {
      timeout: 4000,
      headers: { ...commonHeaders, 'authority': 'ios.chat.openai.com' }
    }).catch(() => null);

    let webBlocked = true;
    let appBlocked = true;

    if (resWeb) {
      const bodyWeb = await getBody(resWeb);
      if (!bodyWeb.toLowerCase().includes('unsupported_country')) webBlocked = false;
    }

    if (resApp) {
      const bodyApp = await getBody(resApp);
      if (!bodyApp.toLowerCase().includes('vpn')) appBlocked = false;
    }

    if (!webBlocked && !appBlocked) return { code: 'OK', region: region }; 
    if (!webBlocked && appBlocked) return { code: 'OK', region: region, suffix: '(Web)' };
    if (webBlocked && !appBlocked) return { code: 'OK', region: region, suffix: '(App)' }; 
    
    return { code: 'ERR', region: region };
  }

  // ==== Claude 重构版 ====
    async function checkClaude() {
    let region = null;
    const trace = await ctx.http.get('https://claude.ai/cdn-cgi/trace', { timeout: 3000 }).catch(() => null);
    if (trace && trace.status === 200) {
      const body = await getBody(trace);
      const match = body.match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }

    // 禁用重定向，直接探测首包状态
    const res = await ctx.http.get('https://claude.ai/', { 
        timeout: 4000, 
        headers: commonHeaders,
        followRedirect: false
    }).catch(() => null);

    if (!res) return { code: 'ERR', region: region };

    // 1. 判断是否被 Claude 边缘节点直接 30x 重定向到无服务区域页面
    if (res.status >= 300 && res.status < 400) {
        const loc = res.headers['Location'] || res.headers['location'] || '';
        if (loc.includes('app-unavailable-in-region')) {
            return { code: 'ERR', region: region }; // 明确未解锁
        }
    } 
    // 2. 判断 200 OK 页面中是否渲染了无服务特征 (备用后备)
    else if (res.status === 200) {
        const body = await getBody(res);
        if (body.includes('app-unavailable-in-region')) {
            return { code: 'ERR', region: region };
        }
    }

    // 3. 核心修复点：除了明确的黑名单路由，其他 HTTP 状态（如 Cloudflare 触发的 403 盾，或 302 到 /login）
    // 均代表 IP 的 Geo-IP 已经处于解锁区域内。
    return { code: 'OK', region: region };
  }


  // ==== Gemini 重构版 ====
  async function checkGemini() {
    const res = await ctx.http.get('https://gemini.google.com', {
      timeout: 5000, headers: commonHeaders, followRedirect: true
    }).catch(() => null);
    
    if (!res) return { code: 'ERR', region: null };
    const body = await getBody(res);
    
    // 判断是否包含解锁特性标识
    const isUnlocked = body.includes('45631641,null,true');
    if (!isUnlocked) {
        return { code: 'ERR', region: null };
    }

    // 正则提取当前解锁国家代码 (例如: ,2,1,200,"USA")
    let region = null;
    const match = body.match(/,2,1,200,"([A-Z]{2,3})"/);
    if (match && match[1]) {
        region = match[1];
    }
    
    return { code: 'OK', region: region || 'OK' };
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
    { name: 'ChatGPT', info: resultInfo(chatgpt, null) }, 
    { name: 'Claude', info: resultInfo(claude, null) },
    { name: 'Gemini', info: resultInfo(gemini, null) }
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
