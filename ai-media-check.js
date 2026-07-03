/**
 * Egern小组件: 网络服务解锁监测 (Tokyo Night 东京夜专属版)
 * 🎨 状态全绿正向反馈 / 模块化仪表盘封装 / 极致留白排版
 */
export default async function(ctx) {
  const MODE = 'auto'; // auto / large / compact

  // ── 1. Tokyo Night 赛博朋克 vs 科技马卡龙 双态色彩令牌系统 ──
  const C = {
    // 🌟 底层与卡片
    bg:       { light: '#EEF1FF', dark: '#000000' }, // 浅色冰蓝融入主题，深色极致 OLED 黑
    panel:    { light: '#FFFFFF', dark: '#121215' }, // 浅色纯白，深色深空灰衬托霓虹发光
    chip:     { light: '#F0F2F8', dark: '#1F1F24' }, // 地区标签底色
    
    // 🌟 极细分割线颜色 (仅用于顶栏等大结构分割)
    hairline: { light: '#E2E8F0', dark: '#2B3045' },
    
    // 文本色
    text:     { light: '#111114', dark: '#FFFFFF' },
    dim:      { light: '#64748B', dark: '#8F93A2' }, 
    
    // 🌟 核心强调色
    accent:   { light: '#7446D8', dark: '#B765FF' }, // 浅色亮面紫 / 深色赛博紫
    
    // 🌟 语义色彩 (Light: 科技马卡龙 | Dark: 夜之城霓虹)
    ok:       { light: '#10B981', dark: '#C7FF18' }, // 解锁状态：薄荷翠 / 荧光绿
    warn:     { light: '#F59E0B', dark: '#FFD300' }, // 警告状态：阳光琥珀 / 赛博黄
    fail:     { light: '#FF4757', dark: '#FF2A6D' }  // 失败状态：果冻红 / 霓虹粉红
  };

  const BASE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const commonHeaders = { 'User-Agent': BASE_UA };

  const family = String(ctx.widgetFamily || ctx.family || ctx.widgetSize || '').toLowerCase();
  const isLarge = MODE === 'large' || (MODE === 'auto' && (family.includes('large') || family === 'systemextralarge'));
  const isCompact = !isLarge;

  // ── 2. 统一尺寸体系 ──
  const layout = {
    padding:  isCompact ? [12, 12, 12, 12] : [10, 12, 10, 12],
    groupPad: isCompact ? [6, 8] : [8, 10],
    headerFz: isCompact ? 11 : 13,
    headerIcz:isCompact ? 15 : 17,
    timeFz:   10,
    listFz:   isCompact ? 10 : 12,
    chipFz:   isCompact ? 8 : 10,
    rowGap:   8
  };

  const getFlagEmoji = (cc) => {
    if (!cc || cc === 'XX' || cc === '--' || cc === 'UNKNOWN' || cc === 'OK' || cc.length < 2) return '🌐';
    const code = cc.substring(0, 2).toUpperCase();
    return code.replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
  };

  async function safe(fn) {
    try {
      return await fn();
    } catch {
      return { code: 'ERR', region: null, ms: 0 };
    }
  }

  async function getBody(res) {
    try { return await res.text(); } catch { return ''; }
  }

  // ==== 核心测速探针 ====
  async function exactPing(url) {
    const start = Date.now();
    await ctx.http.get(url, { 
      timeout: 2500, 
      redirect: 'manual', 
      headers: { 'User-Agent': IOS_UA, 'Accept': 'application/json, text/plain, */*' } 
    }).catch(() => null);
    
    return Date.now() - start;
  }

  // ==== 业务探测逻辑 ====

  async function checkYouTube() {
    const ms = await exactPing('https://www.youtube.com/generate_204');
    const res = await ctx.http.get('https://www.youtube.com/premium', {
      timeout: 4000, 
      headers: { 'User-Agent': IOS_UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'SOCS=CAI' }
    }).catch(() => null);
    
    if (!res || res.status !== 200) return { code: 'ERR', region: null, ms };

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
    if (body.includes('Premium is not available in your country')) return { code: 'ERR', region: regionFromCookie, ms };
    
    let finalRegion = regionFromCookie || 'UNKNOWN';
    const match = body.match(/"INNERTUBE_CONTEXT_GL"\s*:\s*"([^"]+)"/i)
    if (match && match[1]) finalRegion = match[1].toUpperCase();
    
    return { code: 'OK', region: finalRegion, ms };
  }

  async function checkNetflix() {
    const ms = await exactPing('https://www.netflix.com/.well-known/apple-app-site-association');
    const innerCheck = async (filmId) => {
      const res = await ctx.http.get('https://www.netflix.com/title/' + filmId, {
        timeout: 4000, headers: commonHeaders, redirect: 'follow'
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
              applicationRuntime: 'chrome', attributes: { browserName: 'chrome', browserVersion: '94.0.4606', manufacturer: 'apple', model: null, operatingSystem: 'macintosh', operatingSystemVersion: '10.15.7', osDeviceIds: [] },
              deviceFamily: 'browser', deviceLanguage: 'en', deviceProfile: 'macosx'
            }
          }
        })
      };
      const gqlRes = await ctx.http.post('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', gqlOpts).catch(() => null);
      if (!gqlRes || gqlRes.status !== 200) return { code: 'ERR', region: null, ms };

      const data = JSON.parse(await getBody(gqlRes));
      if (!data?.errors && data?.extensions?.sdk) {
        const sdk = data.extensions.sdk;
        const inSupportedLocation = sdk.session?.inSupportedLocation;
        let region = sdk.session?.location?.countryCode ? sdk.session.location.countryCode.toUpperCase() : null;
        
        if (inSupportedLocation === false || String(inSupportedLocation) === 'false') {
          return { code: 'OK', region: region, suffix: '(即将)', ms };
        } else if (region) {
          return { code: 'OK', region: region, ms };
        }
      }
      return { code: 'ERR', region: null, ms };
    } catch (e) {
      return { code: 'ERR', region: null, ms };
    }
  }

  async function checkChatGPT() {
    let region = null;
    let ms = 0;
    const start = Date.now();
    const trace = await ctx.http.get('https://chatgpt.com/cdn-cgi/trace', { timeout: 3000, redirect: 'manual' }).catch(() => null);
    ms = Date.now() - start;

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

    if (resWeb) { if (!(await getBody(resWeb)).toLowerCase().includes('unsupported_country')) webBlocked = false; }
    if (resApp) { if (!(await getBody(resApp)).toLowerCase().includes('vpn')) appBlocked = false; }

    if (!webBlocked && !appBlocked) return { code: 'OK', region: region, ms }; 
    if (!webBlocked && appBlocked) return { code: 'OK', region: region, suffix: '(Web)', ms };
    if (webBlocked && !appBlocked) return { code: 'OK', region: region, suffix: '(App)', ms }; 
    
    return { code: 'ERR', region: region, ms };
  }

  async function checkClaude() {
    let region = null;
    let ms = 0;
    const start = Date.now();
    const trace = await ctx.http.get('https://claude.ai/cdn-cgi/trace', { timeout: 3000, redirect: 'manual' }).catch(() => null);
    ms = Date.now() - start;

    if (trace && trace.status === 200) {
      const match = (await getBody(trace)).match(/loc=([A-Z]{2})/);
      if (match) region = match[1].toUpperCase();
    }

    const res = await ctx.http.get('https://claude.ai/', { 
        timeout: 4000, headers: commonHeaders, redirect: 'manual'
    }).catch(() => null);

    if (!res) return { code: 'ERR', region: region, ms };

    if (res.status >= 300 && res.status < 400) {
        const loc = res.headers['Location'] || res.headers['location'] || '';
        if (loc.includes('app-unavailable-in-region')) return { code: 'ERR', region: region, ms };
    } else if (res.status === 200) {
        if ((await getBody(res)).includes('app-unavailable-in-region')) return { code: 'ERR', region: region, ms };
    }
    return { code: 'OK', region: region, ms };
  }

  async function checkGemini() {
    const ms = await exactPing('https://gemini.google.com/generate_204');
    const res = await ctx.http.get('https://gemini.google.com', {
      timeout: 5000, headers: commonHeaders, redirect: 'follow'
    }).catch(() => null);
    
    if (!res) return { code: 'ERR', region: null, ms };
    
    const body = await getBody(res);
    if (!body.includes('45631641,null,true')) return { code: 'ERR', region: null, ms };

    let region = null;
    const match = body.match(/,2,1,200,"([A-Z]{2,3})"/);
    if (match && match[1]) region = match[1];
    
    return { code: 'OK', region: region || 'OK', ms };
  }

  const checks = [
    safe(checkYouTube), safe(checkNetflix), safe(checkDisney), 
    safe(checkChatGPT), safe(checkClaude), safe(checkGemini)
  ];

  const results = await Promise.all(checks);
  const [youtube, netflix, disney, chatgpt, claude, gemini] = results;

  const resultInfo = (result) => {
    const available = result && result.code !== 'ERR';
    let region = '--';
    let ms = result?.ms || 0;
    
    if (available) {
      let base = result.region || 'US'; 
      let suffix = result.suffix || '';
      let emoji = getFlagEmoji(base);
      
      if (base === 'UNKNOWN' || base === '--') {
        region = suffix || 'OK';
      } else {
        region = `${emoji} ${base}${suffix}`;
      }
    }
    return { available, region, ms };
  };

  const streaming = [
    { name: 'YouTube', info: resultInfo(youtube) },
    { name: 'Netflix', info: resultInfo(netflix) },
    { name: 'Disney+', info: resultInfo(disney) }
  ];

  const ai = [
    { name: 'ChatGPT', info: resultInfo(chatgpt) }, 
    { name: 'Claude', info: resultInfo(claude) },
    { name: 'Gemini', info: resultInfo(gemini) }
  ];

  const allServices = [...streaming, ...ai];
  const okCount = allServices.filter(item => item.info.available).length;
  const lockedCount = allServices.length - okCount;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

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
        font: { size: layout.chipFz, weight: 'bold', design: 'monospaced' },
        textColor: C.text, maxLines: 1
      }
    ]
  });

  const ServiceRow = item => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
    children: [
      {
        type: 'text', text: item.name,
        font: { size: layout.listFz, weight: 'semibold' },
        textColor: C.text, flex: 1, maxLines: 1
      },
      ...(item.info.available ? [{
         type: 'text', text: `${item.info.ms}ms`,
         font: { size: isCompact ? 8 : 10, weight: 'medium', design: 'monospaced' },
         textColor: C.dim, maxLines: 1
      }] : []),
      RegionChip(item.info.region),
      Dot(item.info.available)
    ]
  });

  // 顶栏专属大结构分割线
  const TopHairline = () => ({
    type: 'stack', direction: 'row', height: 1, backgroundColor: C.hairline,
    children: [ { type: 'spacer' } ]
  });

  const Group = (label, items) => {
    const groupOk = items.filter(item => item.info.available).length;
    return {
      type: 'stack', direction: 'column', flex: 1,
      // 去除了固定 gap，内部通过 spacer 弹性分布，彻底对齐 ip-info
      padding: layout.groupPad,
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
        // 🌟 核心升级：去除极细实体分割线，使用纯净留白伸缩，视觉极其清透
        { type: 'spacer' },
        ServiceRow(items[0]),
        { type: 'spacer' },
        ServiceRow(items[1]),
        { type: 'spacer' },
        ServiceRow(items[2])
      ]
    };
  };

  return {
    type: 'widget',
    backgroundColor: C.bg, 
    padding: layout.padding, 
    gap: layout.rowGap,
    children: [
      // 🌟 顶栏仪表盘封装
      {
        type: 'stack', direction: 'column', gap: 8,
        backgroundColor: C.panel, borderRadius: 8, padding: layout.groupPad,
        children: [
          // 第 1 行：网络解锁总览与时间
          {
            type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
            children: [
              { type: 'image', src: 'sf-symbol:globe', color: C.accent, width: layout.headerIcz, height: layout.headerIcz },
              { type: 'text', text: 'NETWORK MONITOR', font: { size: layout.headerFz, weight: 'bold' }, textColor: C.text, maxLines: 1 },
              { type: 'spacer' },
              { type: 'text', text: time, font: { size: layout.timeFz, weight: 'medium', design: 'monospaced' }, textColor: C.dim, maxLines: 1 }
            ]
          },
          
          // 🔪 宏观物理分割，仅保留这一根 Hairline 确立仪表盘上下结构
          TopHairline(),

          // 第 2 行：大比分解锁状态
          {
            type: 'stack', direction: 'row', alignItems: 'center', gap: 8,
            children: [
              Dot(lockedCount === 0),
              {
                type: 'text', text: `${okCount}/${allServices.length}`,
                font: { size: 24, weight: 'bold', design: 'monospaced' }, textColor: C.text, maxLines: 1
              },
              { type: 'spacer' },
              // 🌟 高光反馈：将全部可用时的灰色改为充满极客爽感的荧光绿/薄荷翠 (C.ok)
              {
                type: 'text', text: lockedCount === 0 ? '全部可用' : `${lockedCount} 项不可用`,
                font: { size: 11, weight: 'semibold' }, textColor: lockedCount === 0 ? C.ok : C.fail, maxLines: 1
              }
            ]
          }
        ]
      },

      // 🌟 下方解锁状态组
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
