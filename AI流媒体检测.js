/**
 * Egern小组件: 网络服务解锁监测
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
      return { code: 'ERR', region: '--' };
    }
  }

  async function fetchProxy() {
    try {
      const res = await ctx.http.get('http://ip-api.com/json/?lang=zh-CN', {
        timeout: 4000
      });

      if (!res) return { code: 'ERR', region: '--' };

      const data = JSON.parse(await res.text());
      const cc = data.countryCode || '--';

      return {
        code: cc === '--' ? 'ERR' : 'OK',
        region: cc
      };
    } catch {
      return { code: 'ERR', region: '--' };
    }
  }

  async function checkNetflix() {
    const res = await ctx.http.get('https://www.netflix.com/title/70143836', {
      timeout: 4000,
      headers: commonHeaders,
      followRedirect: false
    }).catch(() => null);

    return { code: res?.status === 200 ? 'OK' : 'ERR' };
  }

  async function checkDisney() {
    const res = await ctx.http.get('https://www.disneyplus.com', {
      timeout: 4000,
      headers: commonHeaders,
      followRedirect: false
    }).catch(() => null);

    return { code: res && res.status !== 403 ? 'OK' : 'ERR' };
  }

  async function checkChatGPT() {
    const res = await ctx.http.get('https://chatgpt.com/cdn-cgi/trace', {
      timeout: 3000
    }).catch(() => null);

    if (!res) return { code: 'ERR', region: '--' };

    const body = await res.text().catch(() => '');
    const match = body.match(/loc=([A-Z]{2})/);

    return match
      ? { code: match[1], region: match[1] }
      : { code: 'ERR', region: '--' };
  }

  async function checkClaude() {
    const res = await ctx.http.get('https://claude.ai/login', {
      timeout: 5000,
      headers: commonHeaders
    }).catch(() => null);

    return { code: res ? 'OK' : 'ERR' };
  }

  async function checkGemini() {
    const res = await ctx.http.get('https://gemini.google.com/app', {
      timeout: 4000,
      headers: commonHeaders,
      followRedirect: false
    }).catch(() => null);

    return { code: res ? 'OK' : 'ERR' };
  }

  const checks = isLarge
    ? [
        safe(fetchProxy),
        safe(checkNetflix),
        safe(checkDisney),
        safe(checkChatGPT),
        safe(checkClaude),
        safe(checkGemini)
      ]
    : [
        safe(fetchProxy),
        safe(checkNetflix),
        safe(checkDisney)
      ];

  const results = await Promise.all(checks);

  const proxy = results[0];
  const netflix = results[1];
  const disney = results[2];
  const chatgpt = results[3];
  const claude = results[4];
  const gemini = results[5];

  const resultInfo = (result, fallbackRegion) => {
    const available = result && result.code !== 'ERR';

    let region = '--';
    if (available) {
      if (result.region) region = result.region;
      else if (result.code === 'OK') region = fallbackRegion || '--';
      else region = result.code;
    }

    return { available, region };
  };

  const streaming = [
    {
      name: 'YouTube',
      info: {
        available: proxy.code === 'OK',
        region: proxy.region || '--'
      }
    },
    { name: 'Netflix', info: resultInfo(netflix, proxy.region) },
    { name: 'Disney+', info: resultInfo(disney, proxy.region) }
  ];

  const ai = isLarge ? [
    { name: 'ChatGPT', info: resultInfo(chatgpt, proxy.region) },
    { name: 'Claude', info: resultInfo(claude, proxy.region) },
    { name: 'Gemini', info: resultInfo(gemini, proxy.region) }
  ] : [];

  const allServices = [...streaming, ...ai];
  const okCount = allServices.filter(item => item.info.available).length;
  const lockedCount = allServices.length - okCount;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const Dot = available => ({
    type: 'stack',
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: available ? C.ok : C.fail,
    children: []
  });

  const RegionChip = region => ({
    type: 'stack',
    width: 38,
    padding: [2, 0],
    backgroundColor: C.chip,
    borderRadius: 5,
    alignItems: 'center',
    children: [
      {
        type: 'text',
        text: region || '--',
        font: { size: 10, weight: 'bold', design: 'monospaced' },
        textColor: C.text,
        maxLines: 1
      }
    ]
  });

  const ServiceRow = item => ({
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 8,
    children: [
      {
        type: 'text',
        text: item.name,
        font: { size: isCompact ? 13 : 12, weight: 'semibold' },
        textColor: C.text,
        flex: 1,
        maxLines: 1
      },
      RegionChip(item.info.region),
      Dot(item.info.available)
    ]
  });

  const Hairline = () => ({
    type: 'stack',
    height: 1,
    backgroundColor: C.hairline
  });

  const Group = (label, items) => {
    const groupOk = items.filter(item => item.info.available).length;

    return {
      type: 'stack',
      direction: 'column',
      gap: isCompact ? 8 : 6,
      padding: isCompact ? [10, 12] : [8, 10],
      backgroundColor: C.panel,
      borderRadius: 8,
      children: [
        {
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          children: [
            {
              type: 'text',
              text: label,
              font: { size: 11, weight: 'bold' },
              textColor: C.accent,
              maxLines: 1
            },
            { type: 'spacer' },
            {
              type: 'text',
              text: `${groupOk}/${items.length}`,
              font: { size: 10, weight: 'semibold', design: 'monospaced' },
              textColor: C.dim,
              maxLines: 1
            }
          ]
        },
        ServiceRow(items[0]),
        Hairline(),
        ServiceRow(items[1]),
        Hairline(),
        ServiceRow(items[2])
      ]
    };
  };

  return {
    type: 'widget',
    backgroundColor: C.bg,
    padding: isCompact ? [12, 14, 12, 14] : [10, 12, 10, 12],
    gap: isCompact ? 10 : 8,
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 6,
            children: [
              {
                type: 'image',
                src: 'sf-symbol:globe',
                color: C.accent,
                width: 15,
                height: 15
              },
              {
                type: 'text',
                text: 'NETWORK MONITOR',
                font: { size: 10, weight: 'bold' },
                textColor: C.dim,
                maxLines: 1
              }
            ]
          },
          { type: 'spacer' },
          {
            type: 'text',
            text: time,
            font: { size: 10, weight: 'medium', design: 'monospaced' },
            textColor: C.dim,
            maxLines: 1
          }
        ]
      },

      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 8,
        children: [
          Dot(lockedCount === 0),
          {
            type: 'text',
            text: `${okCount}/${allServices.length}`,
            font: { size: isCompact ? 28 : 24, weight: 'bold', design: 'monospaced' },
            textColor: C.text,
            maxLines: 1
          },
          { type: 'spacer' },
          {
            type: 'text',
            text: lockedCount === 0 ? '全部可用' : `${lockedCount} 项不可用`,
            font: { size: 11, weight: 'semibold' },
            textColor: lockedCount === 0 ? C.dim : C.fail,
            maxLines: 1
          }
        ]
      },

      Group('流媒体解锁', streaming),

      ...(isLarge ? [Group('AI 服务检测', ai)] : [])
    ]
  };
}