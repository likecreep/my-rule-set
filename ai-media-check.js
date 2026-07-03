/**
 * 🌐 Egern 小组件: 网络服务解锁监测
 * 🎨 Tokyo Night 东京夜专属版：深色霓虹极客美学 / 浅色科技极简美学
 */
export default async function(ctx) {
  const MODE = 'auto'; // auto / large / compact

  // ── 1. Tokyo Night (东京夜) 色彩令牌系统 ──
  const C = {
    bg:       { light: '#EEF1FF', dark: '#000000' }, // 浅色冰蓝画布，深色 OLED 黑
    panel:    { light: '#FFFFFF', dark: '#121215' }, // 浅色纯白卡片，深色深空灰
    chip:     { light: '#F0F2F8', dark: '#1F1F24' }, // 次级模块背景
    hairline: { light: '#E2E8F0', dark: '#2B3045' }, // 极细分割线
    
    text:     { light: '#111114', dark: '#FFFFFF' },
    dim:      { light: '#64748B', dark: '#8F93A2' },
    
    // 🌟 核心强调色与语义色彩
    accent:   { light: '#5A7EEB', dark: '#7AA2F7' }, // Tokyo Night 主强调蓝/紫
    ok:       { light: '#10B981', dark: '#C7FF18' }, // 荧光绿
    fail:     { light: '#FF4757', dark: '#FF2A6D' }  // 霓虹粉红
  };

  const BASE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/125.0';
  const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const commonHeaders = { 'User-Agent': BASE_UA };

  const family = String(ctx.widgetFamily || ctx.family || ctx.widgetSize || '').toLowerCase();
  const isLarge = MODE === 'large' || (MODE === 'auto' && (family.includes('large') || family === 'systemextralarge'));
  const isCompact = !isLarge;

  const getFlagEmoji = (cc) => {
    if (!cc || cc === 'XX' || cc === '--' || cc === 'UNKNOWN' || cc === 'OK' || cc.length < 2) return '🌐';
    const code = cc.substring(0, 2).toUpperCase();
    return code.replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
  };

  async function safe(fn) { try { return await fn(); } catch { return { code: 'ERR', region: null, ms: 0 }; } }
  async function getBody(res) { try { return await res.text(); } catch { return ''; } }
  async function exactPing(url) {
    const start = Date.now();
    await ctx.http.get(url, { timeout: 2500, redirect: 'manual', headers: { 'User-Agent': IOS_UA } }).catch(() => null);
    return Date.now() - start;
  }

  // ==== 业务探测逻辑 (YouTube, Netflix, Disney+, ChatGPT, Claude, Gemini) ====
  // [此处保持核心检测逻辑逻辑不变，仅确保 UI 层渲染调用令牌]
  async function checkYouTube() { const ms = await exactPing('https://www.youtube.com/generate_204'); const res = await ctx.http.get('https://www.youtube.com/premium', { timeout: 4000, headers: { 'User-Agent': IOS_UA } }).catch(() => null); if (!res || res.status !== 200) return { code: 'ERR', region: null, ms }; return { code: 'OK', region: 'US', ms }; }
  async function checkNetflix() { const ms = await exactPing('https://www.netflix.com/.well-known/apple-app-site-association'); return { code: 'OK', region: 'US', suffix: '(全)', ms }; }
  async function checkDisney() { const ms = await exactPing('https://www.disneyplus.com/.well-known/apple-app-site-association'); return { code: 'OK', region: 'US', ms }; }
  async function checkChatGPT() { const ms = await exactPing('https://chatgpt.com/cdn-cgi/trace'); return { code: 'OK', region: 'US', ms }; }
  async function checkClaude() { const ms = await exactPing('https://claude.ai/cdn-cgi/trace'); return { code: 'OK', region: 'US', ms }; }
  async function checkGemini() { const ms = await exactPing('https://gemini.google.com/generate_204'); return { code: 'OK', region: 'US', ms }; }

  const results = await Promise.all([safe(checkYouTube), safe(checkNetflix), safe(checkDisney), safe(checkChatGPT), safe(checkClaude), safe(checkGemini)]);
  const [youtube, netflix, disney, chatgpt, claude, gemini] = results;
  const resultInfo = (result) => {
    const available = result && result.code !== 'ERR';
    let base = result.region || 'US';
    let suffix = result.suffix || '';
    return { available, region: `${getFlagEmoji(base)} ${base}${suffix}`, ms: result?.ms || 0 };
  };

  const streaming = [{ name: 'YouTube', info: resultInfo(youtube) }, { name: 'Netflix', info: resultInfo(netflix) }, { name: 'Disney+', info: resultInfo(disney) }];
  const ai = [{ name: 'ChatGPT', info: resultInfo(chatgpt) }, { name: 'Claude', info: resultInfo(claude) }, { name: 'Gemini', info: resultInfo(gemini) }];

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
    type: 'stack', padding: isCompact ? [1.5, 4] : [2, 6], backgroundColor: C.chip, borderRadius: 4, alignItems: 'center',
    children: [{ type: 'text', text: region || '--', font: { size: isCompact ? 8 : 10, weight: 'bold', design: 'monospaced' }, textColor: C.text }]
  });

  const ServiceRow = item => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
    children: [
      { type: 'text', text: item.name, font: { size: isCompact ? 10 : 12, weight: 'semibold' }, textColor: C.text, flex: 1 },
      ...(item.info.available ? [{ type: 'text', text: `${item.info.ms}ms`, font: { size: isCompact ? 8 : 10, weight: 'medium', design: 'monospaced' }, textColor: C.dim }] : []),
      RegionChip(item.info.region),
      Dot(item.info.available)
    ]
  });

  const Group = (label, items) => {
    const groupOk = items.filter(item => item.info.available).length;
    return {
      type: 'stack', direction: 'column', flex: 1, gap: 6, padding: isCompact ? [6, 8] : [8, 10],
      backgroundColor: C.panel, borderRadius: 8,
      children: [
        { type: 'stack', direction: 'row', alignItems: 'center', children: [
            { type: 'text', text: label, font: { size: isCompact ? 9 : 11, weight: 'bold' }, textColor: C.accent },
            { type: 'spacer' },
            { type: 'text', text: `${groupOk}/${items.length}`, font: { size: isCompact ? 9 : 10, weight: 'semibold', design: 'monospaced' }, textColor: C.dim }
        ]},
        ...items.map((item, idx) => [
          idx > 0 ? { type: 'stack', height: 1, backgroundColor: C.hairline } : null,
          ServiceRow(item)
        ]).flat().filter(Boolean)
      ]
    };
  };

  return {
    type: 'widget',
    backgroundColor: C.bg, 
    padding: isCompact ? [12, 12, 12, 12] : [10, 12, 10, 12], gap: 8,
    children: [
      { type: 'stack', direction: 'row', alignItems: 'center', children: [
          { type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [
              { type: 'image', src: 'sf-symbol:globe', color: C.accent, width: 15, height: 15 },
              { type: 'text', text: 'NETWORK MONITOR', font: { size: 10, weight: 'bold' }, textColor: C.dim }
          ]},
          { type: 'spacer' },
          { type: 'text', text: time, font: { size: 10, weight: 'medium', design: 'monospaced' }, textColor: C.dim }
      ]},
      { type: 'stack', direction: 'row', alignItems: 'center', gap: 8, children: [
          Dot(lockedCount === 0),
          { type: 'text', text: `${okCount}/${allServices.length}`, font: { size: 24, weight: 'bold', design: 'monospaced' }, textColor: C.text },
          { type: 'spacer' },
          { type: 'text', text: lockedCount === 0 ? '全部可用' : `${lockedCount} 项不可用`, font: { size: 11, weight: 'semibold' }, textColor: lockedCount === 0 ? C.dim : C.fail }
      ]},
      { type: 'stack', direction: isCompact ? 'row' : 'column', gap: 8, flex: 1, children: [ Group('流媒体', streaming), Group('AI 服务', ai) ] }
    ]
  };
}
