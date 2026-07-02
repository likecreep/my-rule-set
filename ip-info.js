/**
 * 🌐 Egern 全能网络信息与 IP 纯净度看板 (完美终极版)
 * 🎨 深度融合 ai-media-check 色彩、双块卡片分组与 Lan 级精准对齐
 */
export default async function(ctx) {
  // ── 1. 动态侦测小组件尺寸 (基于官方 ctx.widgetFamily 规范) ──
  const family = String(ctx.widgetFamily || '').toLowerCase();
  const isLarge = family === 'systemlarge' || family === 'systemextralarge';

  // ── 2. ai-media-check 标准色彩令牌系统 ──
  const C = {
    bg:       { light: '#FFFFFF', dark: '#050506' },
    text:     { light: '#111114', dark: '#F7F7F8' },
    dim:      { light: '#7B7B84', dark: '#85858E' }, 
    panel:    { light: '#F5F5F7', dark: '#111114' },
    hairline: { light: '#E4E4E8', dark: '#242429' },
    chip:     { light: '#ECECF1', dark: '#202025' },
    accent:   { light: '#7446D8', dark: '#B765FF' }, 
    ok:       { light: '#2F9E58', dark: '#C7FF18' }, 
    warn:     { light: '#FF9500', dark: '#FFD60A' }, 
    fail:     { light: '#D64545', dark: '#FF626A' }  
  };

  // ── 3. 动态响应式布局参数 (边距对标 ai-media-check，字号对标 Lan) ──
  const layout = {
    padding:    isLarge ? [16, 20, 16, 20] : [12, 12, 12, 12],
    headerFz:   isLarge ? 16 : 13,
    headerIcz:  isLarge ? 17 : 14,
    pingFz:     isLarge ? 12 : 9.5,
    pingIcz:    isLarge ? 12 : 9.5,
    pingPad:    isLarge ? [4, 8] : [3, 6],
    rowFz:      isLarge ? 14 : 11,    // 对标 Lan 脚本，标题与数值的字号皆为 11
    rowIcz:     isLarge ? 16 : 13,    // 图标大小对应为 13
    rowGap:     isLarge ? 8 : 6,      // 行内图标与文字间距
    itemGap:    isLarge ? 6 : 4,      // 组内上下行间距
    groupPad:   isLarge ? [10, 14] : [6, 10], // Panel 卡片内部边距
    groupGap:   isLarge ? 10 : 6,     // 两个卡片组块之间的间距
    spacerTop:  isLarge ? 12 : 8,
    footerFz:   isLarge ? 11 : 9
  };

  // ── 4. 获取系统基础网络信息 ──
  const d = ctx.device || {};
  const isWifi = !!d.wifi?.ssid;
  
  let netName = "未连接", netIcon = "wifi.slash";
  if (isWifi) {
    netName = d.wifi.ssid; 
    netIcon = "wifi";
  } else if (d.cellular?.radio) {
    const radioMap = { "GPRS": "2.5G", "EDGE": "2.75G", "WCDMA": "3G", "LTE": "4G", "NR": "5G", "NRNSA": "5G" };
    const rawRadio = d.cellular.radio.toUpperCase().replace(/\s+/g, "");
    netName = radioMap[rawRadio] || rawRadio;
    netIcon = "antenna.radiowaves.left.and.right";
  }

  const localIp = d.ipv4?.address || "获取失败";
  const gateway = d.ipv4?.gateway || "获取失败";

  // ── 5. 多轨数据并发请求 (3500ms 超时防假死) ──
  const TIMEOUT_MS = 3500;
  const httpGetJson = async (url) => {
    try {
      const start = Date.now();
      const res = await ctx.http.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: TIMEOUT_MS });
      const text = await res.text();
      return { data: JSON.parse(text), ping: Date.now() - start };
    } catch (e) {
      return { data: null, ping: 0 };
    }
  };

  const [directRes, proxyRes] = await Promise.all([
    httpGetJson('https://myip.ipip.net/json'),
    httpGetJson('https://my.ippure.com/v1/info')
  ]);

  // ── 6. 解析直连公网与位置数据 (Lan 样式本地国旗) ──
  let pubIp = "获取失败", pubLoc = "未知位置", pubIsp = "未知运营商";
  let domesticPing = directRes.ping;

  const fmtISP = (isp) => {
    if (!isp) return "未知";
    const s = String(isp).toLowerCase();
    if (/移动|mobile|cmcc/i.test(s)) return "中国移动";
    if (/电信|telecom|chinanet/i.test(s)) return "中国电信";
    if (/联通|unicom/i.test(s)) return "中国联通";
    if (/广电|broadcast|cbn/i.test(s)) return "中国广电";
    return isp; 
  };

  if (directRes.data && directRes.data.data) {
    const body = directRes.data.data;
    pubIp = body.ip || "获取失败";
    const locArr = body.location || [];
    pubIsp = fmtISP(locArr[4] || locArr[3]);
    
    let pubLocStr = `${locArr[1] || ""} ${locArr[2] || ""}`.trim();
    let pubFlag = "🇨🇳"; // 本地绝大多数情况为中国，特殊情况匹配地球
    if (locArr[0] && locArr[0] !== "中国") pubFlag = "🌐"; 
    pubLoc = pubLocStr ? `${pubFlag} ${pubLocStr}` : `${pubFlag} 中国`;
  }

  // ── 7. 解析代理落地与纯净度数据 ──
  let proxyIp = "获取失败", proxyLoc = "未知位置", proxyIsp = "未知", nativeText = "未知", riskTxt = "获取失败";
  let riskCol = C.dim, riskIc = "questionmark.shield.fill";
  let foreignPing = proxyRes.ping;

  if (proxyRes.data) {
    const p = proxyRes.data;
    proxyIp = p.ip || "获取失败";
    proxyIsp = p.asn ? `AS${p.asn} ${p.asOrganization || ""}`.trim() : "未知";
    
    let code = p.countryCode || "";
    if (code.toUpperCase() === 'TW') code = 'CN';
    const flag = code ? String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt())) : "🌐";
    proxyLoc = `${flag} ${p.country || ""} ${p.city || ""}`.trim() || "未知位置";
    
    nativeText = p.isResidential === true ? "🏠 原生住宅" : (p.isResidential === false ? "🏢 商业机房" : "未知");

    const risk = p.fraudScore;
    if (risk !== undefined) {
      if (risk >= 80) { riskTxt = `极高风险 (${risk})`; riskCol = C.fail; riskIc = "xmark.shield.fill"; }
      else if (risk >= 70) { riskTxt = `高风险 (${risk})`; riskCol = C.fail; riskIc = "exclamationmark.shield.fill"; }
      else if (risk >= 40) { riskTxt = `中等风险 (${risk})`; riskCol = C.warn; riskIc = "exclamationmark.shield.fill"; }
      else { riskTxt = `纯净低危 (${risk})`; riskCol = C.ok; riskIc = "checkmark.shield.fill"; }
    }
  }

  // ── 8. UI 统一样式构建器 ──
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const getPingColor = (ping) => {
    if (ping === 0) return C.dim;
    if (ping < 80) return C.ok;
    if (ping < 200) return C.warn;
    return C.fail;
  };
  const domColor = getPingColor(domesticPing);
  const forColor = getPingColor(foreignPing);

  // 严格两端对齐行组件：固定图标宽度确保左对齐，Spacer 将数值顶到最右侧
  const Row = (ic, icColor, label, val, valCol) => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: layout.rowGap,
    children: [
      // 固定宽度的盒子，确保即便 SF Symbols 比例不同，也绝对垂直左对齐
      { type: 'stack', width: layout.rowIcz, alignItems: 'center', children: [
          { type: 'image', src: `sf-symbol:${ic}`, color: icColor, width: layout.rowIcz, height: layout.rowIcz }
      ]},
      { type: 'text', text: label, font: { size: layout.rowFz }, textColor: C.dim },
      { type: 'spacer' },
      { type: 'text', text: val, font: { size: layout.rowFz, weight: 'bold', family: 'Menlo' }, textColor: valCol, maxLines: 1, minScale: 0.6 }
    ]
  });

  // ── 9. 最终组件渲染输出 ──
  return {
    type: 'widget',
    backgroundColor: C.bg,
    padding: layout.padding,
    children: [
      // 🌟 第一行标题 (极简深色标题，去除 ms 为名字留出空间)
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          { type: 'image', src: `sf-symbol:${netIcon}`, color: C.accent, width: layout.headerIcz, height: layout.headerIcz },
          { type: 'text', text: `${pubIsp} · ${netName}`, font: { size: layout.headerFz, weight: 'bold' }, textColor: C.dim, maxLines: 1, minScale: 0.7, flex: 1 },
          {
            type: 'stack', direction: 'row', alignItems: 'center', gap: 4, padding: layout.pingPad, borderRadius: 6, backgroundColor: C.chip,
            children: [
              { type: 'stack', direction: 'row', alignItems: 'center', gap: 2, children: [
                  { type: 'image', src: 'sf-symbol:mappin.circle.fill', color: domColor, width: layout.pingIcz, height: layout.pingIcz },
                  { type: 'text', text: domesticPing > 0 ? `${domesticPing}` : "-", font: { size: layout.pingFz, weight: 'bold', family: 'Menlo' }, textColor: domColor }
              ]},
              { type: 'text', text: '|', font: { size: layout.pingFz, weight: 'light' }, textColor: C.hairline },
              { type: 'stack', direction: 'row', alignItems: 'center', gap: 2, children: [
                  { type: 'image', src: 'sf-symbol:globe.fill', color: forColor, width: layout.pingIcz, height: layout.pingIcz },
                  { type: 'text', text: foreignPing > 0 ? `${foreignPing}` : "-", font: { size: layout.pingFz, weight: 'bold', family: 'Menlo' }, textColor: forColor }
              ]}
            ]
          }
        ]
      },
      { type: 'spacer', length: layout.spacerTop },

      // 🌟 主体内容：分组 Panel 卡片，一列到底展示
      {
        type: 'stack', direction: 'column', flex: 1, gap: layout.groupGap,
        children: [
          // 第一组：本地网络
          {
            type: 'stack', direction: 'column', gap: layout.itemGap, padding: layout.groupPad, backgroundColor: C.panel, borderRadius: 8,
            children: [
              Row("iphone", C.accent, "内网 IP", localIp, C.text),
              Row("wifi.router.fill", C.accent, "路由网关", gateway, C.text),
              Row("globe", C.accent, "直连公网", pubIp, C.ok),
              Row("mappin.and.ellipse", C.accent, "本地位置", pubLoc, C.text)
            ]
          },
          // 第二组：落地网络与纯净度
          {
            type: 'stack', direction: 'column', gap: layout.itemGap, padding: layout.groupPad, backgroundColor: C.panel, borderRadius: 8,
            children: [
              Row("network", C.accent, "落地 IP", proxyIp, C.ok),
              Row("location.fill", C.accent, "位置", proxyLoc, C.text), // 缩短标签字数给值留空间
              Row("server.rack", C.accent, "落地机房", proxyIsp, C.text),
              Row("building.2.fill", C.accent, "原生属性", nativeText, C.text),
              Row(riskIc, riskCol, "风险评级", riskTxt, riskCol)
            ]
          }
        ]
      },

      { type: 'spacer', length: layout.groupGap },

      // 🌟 右下角面板更新时间
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          { type: 'spacer' },
          { type: 'text', text: `更新于 ${timeStr}`, font: { size: layout.footerFz, weight: 'bold', family: 'Menlo' }, textColor: C.dim }
        ]
      }
    ]
  };
}
