/**
 * Egern小组件: 网络服务解锁监测 (穿透 WAF 黑名单校验版)
 * 重构版：全尺寸支持流媒体 + AI 双栏显示，引入延迟 (ms) 与 Emoji 标识
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

  // ==== 核心工具函数 ====
  
  // 国籍转 Emoji
  const getFlagEmoji = (cc) => {
    if (!cc || cc === 'XX' || cc === '--' || cc === 'UNKNOWN' || cc === 'OK' || cc.length < 2) return '🌐';
    const code = cc.substring(0, 2).toUpperCase();
    return code.replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
  };

  // 增加延迟探测的 wrapper
  async function safe(fn) {
    const start = Date.now();
    try {
      const res = await fn();
      return { ...res, ms: Date.now() - start };
    } catch {
      return { code: 'ERR', region: null, ms: Date.now() - start };
    }
  }

  async function getBody(res) {
    try { return await res.text(); } catch { return ''; }
  }

  // ==== 探测逻辑 (保留原脚本判定规则) ====
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
      'Cookie': 'SOCS=CAI'
    };
    
    const res = await ctx.http.get('https://www.youtube.com/premium', {
      timeout: 4000, 
      headers: headers
    }).catch(() => null);
    
    if (!res || res.status !== 200) return { code: 'ERR', region: null };

    let regionFromCookie = null;
    const responseHeaders = res.headers || {};
    let setCookie = responseHeaders['Set-Cookie'] || responseHeaders['set-cookie'] || '';
    
    if (Array.isArray(setCookie)) setCookie = setCookie.join('; ');
    else if (typeof setCookie !== 'string') setCookie = String(setCookie);
    
    const privacyMatch = setCookie.match(/VISITOR_PRIVACY_METADATA=([^;]+)/);
    if (privacyMatch) {
      try {
        const b64 = decodeURIComponent(privacyMatch[1]);
        const decoded = atob(b64);
        regionFromCookie = decoded.substring(2, 4).toUpperCase();
      } catch (e) {}
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
      const res = await ctx.http.get('https://www.netflix.com/title/' + filmId, {
        timeout: 4000, headers: commonHeaders, followRedirect: false
      }).catch(() => null);
      
      if (!res) return { status: 'Error' };
      if (res.status === 403) return { status: 'Not Available' };
      if (res.status === 404) return { status: 'Not Found' };
      
      if (res.status === 200) {
        let region = 'US';
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
      if (!gqlRes || gqlRes.status !== 200) return { code: 'ERR', region: null };

      const data = JSON.parse(await getBody(gqlRes));
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

  async function checkChatGPT() {
    let region = null;
    const trace = await ctx.http.get('https://chatgpt.com/cdn-cgi/trace', { timeout: 3000 }).catch(() => null);
    if (trace && trace.status === 200) {
      const body = await getBody(trace);
      const match = body.match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }

    const resWeb = await ctx.http.get('https://api.openai.com/compliance/cookie_requirements', {
      timeout: 4000,
      headers: { ...commonHeaders, 'authority': 'api.openai.com', 'authorization': 'Bearer null' }
    }).catch(() => null);

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

  async function checkClaude() {
    let region = null;
    const trace = await ctx.http.get('https://claude.ai/cdn-cgi/trace', { timeout: 3000 }).catch(() => null);
    if (trace && trace.status === 200) {
      const body = await getBody(trace);
      const match = body.match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }

    const res = await ctx.http.get('https://claude.ai/', { 
        timeout: 4000, 
        headers: commonHeaders,
        followRedirect: false
    }).catch(() => null);

    if (!res) return { code: 'ERR', region: region };

    if (res.status >= 300 && res.status < 400) {
        const loc = res.headers['Location'] || res.headers['location'] || '';
        if (loc.includes('app-unavailable-in-region')) return { code: 'ERR', region: region };
    } else if (res.status === 200) {
        const body = await getBody(res);
        if (body.includes('app-unavailable-in-region')) return { code: 'ERR', region: region };
    }
    return { code: 'OK', region: region };
  }

  async function checkGemini() {
    const res = await ctx.http.get('https://gemini.google.com', {
      timeout: 5000, headers: commonHeaders, followRedirect: true
    }).catch(() => null);
    
    if (!res) return { code: 'ERR', region: null };
    const body = await getBody(res);
    
    if (!body.includes('45631641,null,true')) return { code: 'ERR', region: null };

    let region = null;
    const match = body.match(/,2,1,200,"([A-Z]{2,3})"/);
    if (match && match[1]) region = match[1];
    
    return { code: 'OK', region: region || 'OK' };
  }

  // 解除对于面板大小的探测限制，并发执行所有任务
  const checks = [
    safe(fetchProxy), safe(checkYouTube), safe(checkNetflix), 
    safe(checkDisney), safe(checkChatGPT), safe(checkClaude), safe(checkGemini)
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
      
      if (base === '--' && suffix) {
        region = `${emoji} ${suffix}`;
      } else {
        region = `${emoji} ${base}${suffix}`;
      }
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

  // ==== UI 渲染组件 ====
  const Dot = available => ({
    type: 'stack', width: isCompact ? 6 : 9, height: isCompact ? 6 : 9, borderRadius: isCompact ? 3 : 4.5,
    backgroundColor: available ? C.ok : C.fail, children: []
  });

  const RegionChip = region => ({
    type: 'stack',
    padding: isCompact ? [1.5, 4] : [2, 6], 
    backgroundColor: C.chip, borderRadius: 4, alignItems: 'center',
    children: [
      {
        type: 'text', text: region || '--',
        font: { size: isCompact ? 8 : 10, weight: 'bold', design: 'monospaced' },
        textColor: C.text, maxLines: 1
      }
    ]
  });

  const ServiceRow = item => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
    children: [
      {
        type: 'text', text: item.name,
        font: { size: isCompact ? 10 : 12, weight: 'semibold' },
        textColor: C.text, flex: 1, maxLines: 1
      },
      // 成功解锁时插入 MS 延迟时间节点
      ...(item.info.available ? [{
         type: 'text', text: `${item.info.ms}ms`,
         font: { size: isCompact ? 8 : 10, weight: 'medium', design: 'monospaced' },
         textColor: C.dim, maxLines: 1
      }] : []),
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
      type: 'stack', direction: 'column', flex: 1,
      gap: isCompact ? 4 : 6, padding: isCompact ? [6, 8] : [8, 10],
      backgroundColor: C.panel, borderRadius: 8,
      children: [
        {
          type: 'stack', direction: 'row', alignItems: 'center',
          children: [
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
    type: 'widget',
    backgroundColor: C.bg, 
    padding: isCompact ? [12, 12, 12, 12] : [10, 12, 10, 12], gap: 8,
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
            font: { size: 24, weight: 'bold', design: 'monospaced' }, textColor: C.text, maxLines: 1
          },
          { type: 'spacer' },
          {
            type: 'text', text: lockedCount === 0 ? '全部可用' : `${lockedCount} 项不可用`,
            font: { size: 11, weight: 'semibold' }, textColor: lockedCount === 0 ? C.dim : C.fail, maxLines: 1
          }
        ]
      },
      // 核心矩阵布局切换逻辑
      {
        type: 'stack',
        direction: isCompact ? 'row' : 'column',
        gap: 8, flex: 1,
        children: [
          Group(isCompact ? '流媒体' : '流媒体解锁', streaming),
          Group(isCompact ? 'AI服务' : 'AI 服务检测', ai)
        ]
      }
    ]
  };
}
