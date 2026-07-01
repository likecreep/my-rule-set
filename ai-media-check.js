/**
 * Egern小组件: 网络服务解锁监测 (穿透 WAF 黑名单校验版)
 * 大组件: 流媒体 + AI 全部显示
 * 中/小组件: 只显示流媒体
 * 更新：已集成 Stream-All 细化解锁判定逻辑 (YouTube 精确区域/Netflix 剧集分类/Disney+ GraphQL 验证)
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
    
    if (body.includes('Premium is not available in your country')) {
      return { code: 'ERR', region: null };
    }
    
    let region = 'US'; // 默认回退
    const match = body.match(/"countryCode":"(.*?)"/) || body.match(/GL":\s*"([A-Z]{2})"/i);
    
    if (match && match[1]) {
      region = match[1].toUpperCase();
    } else if (body.includes('www.google.cn')) {
      region = 'CN';
    }
    
    return { code: 'OK', region: region };
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
        } else {
          const body = await getBody(res);
          const match = body.match(/"requestCountry":"([A-Z]{2})"/i) || body.match(/"geolocation":\{"country":"([A-Z]{2})"\}/i);
          if (match) region = match[1].toUpperCase();
        }
        return { status: 'OK', region: region };
      }
      return { status: 'Error' };
    };

    // 81280792: 绝命毒师 (非自制剧) 测试完整解锁
    const check1 = await innerCheck(81280792);
    if (check1.status === 'OK') return { code: 'OK', region: check1.region, suffix: '(全)' };
    
    // 若非自制剧未找到，测试 80018499: 怪奇物语 (自制剧) 测试仅自制剧解锁
    if (check1.status === 'Not Found') {
      const check2 = await innerCheck(80018499);
      if (check2.status === 'OK') return { code: 'OK', region: check2.region, suffix: '(自)' };
    }
    
    return { code: 'ERR', region: null };
  }

  async function checkDisney() {
    try {
      const homeRes = await ctx.http.get('https://www.disneyplus.com/', {
        timeout: 5000, headers: commonHeaders
      }).catch(() => null);
      
      if (!homeRes || homeRes.status !== 200) return { code: 'ERR', region: null };
      
      const homeBody = await getBody(homeRes);
      if (homeBody.includes('Sorry, Disney+ is not available in your region.')) {
        return { code: 'ERR', region: null };
      }
      
      let region = '';
      const match = homeBody.match(/Region:\s*([A-Za-z]{2})[\s\S]*?CNBL:\s*([12])/i);
      if (match) region = match[1].toUpperCase();

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
      if (gqlRes && gqlRes.status === 200) {
        const gqlBody = await getBody(gqlRes);
        const data = JSON.parse(gqlBody);
        
        if (!data?.errors && data?.extensions?.sdk) {
          const sdk = data.extensions.sdk;
          const inSupportedLocation = sdk.session?.inSupportedLocation;
          const countryCode = sdk.session?.location?.countryCode;
          
          if (countryCode) region = countryCode.toUpperCase();
          
          if (inSupportedLocation === false || String(inSupportedLocation) === 'false') {
            return { code: 'OK', region: region, suffix: '(即将)' };
          } else {
            return { code: 'OK', region: region };
          }
        }
      }
      return region ? { code: 'OK', region: region } : { code: 'ERR', region: null };
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

    const blockedRegions = ['CN', 'HK', 'MO', 'RU', 'IR', 'KP', 'SY', 'CU'];
    const webOk = region && !blockedRegions.includes(region);

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
