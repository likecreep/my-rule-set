/**
 * 🌐 Egern 全能网络信息与 IP 纯净度看板 (聚合精简版)
 * 🎨 采用 ai-media-check 极客色彩体系与高级双栏自适应排版
 */
export default async function(ctx) {
  // ── 1. 采用 ai-media-check(1) 的标准色彩令牌系统 ──
  const C = {
    bg:       { light: '#FFFFFF', dark: '#050506' },
    text:     { light: '#111114', dark: '#F7F7F8' },
    dim:      { light: '#7B7B84', dark: '#85858E' },
    panel:    { light: '#F5F5F7', dark: '#111114' },
    hairline: { light: '#E4E4E8', dark: '#242429' },
    chip:     { light: '#ECECF1', dark: '#202025' },
    accent:   { light: '#7446D8', dark: '#B765FF' }, // 优雅紫
    ok:       { light: '#2F9E58', dark: '#C7FF18' }, // 纯净绿
    fail:     { light: '#D64545', dark: '#FF626A' }  // 危险红
  };

  // ── 2. 获取系统基础网络与设备信息 ──
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

  // ── 3. 严格超时熔断的多轨数据并发请求 (3500ms) ──
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

  // 并发请求直连网络与代理落地纯净度
  const [directRes, proxyRes] = await Promise.all([
    httpGetJson('https://myip.ipip.net/json'),
    httpGetJson('https://my.ippure.com/v1/info')
  ]);

  // ── 4. 解析直连公网数据 (Lan 脚本方案) ──
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
    pubLoc = `${locArr[1] || ""} ${locArr[2] || ""}`.trim() || "未知位置";
    pubIsp = fmtISP(locArr[4] || locArr[3]);
  }

  // ── 5. 解析代理落地与纯净度数据 (IP 纯净度脚本方案) ──
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
      else if (risk >= 40) { riskTxt = `中等风险 (${risk})`; riskCol = { light: '#FF9500', dark: '#FF9500' }; riskIc = "exclamationmark.shield.fill"; }
      else { riskTxt = `纯净低危 (${risk})`; riskCol = C.ok; riskIc = "checkmark.shield.fill"; }
    }
  }

  // ── 6. UI 统一样式构建器 ──
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const domColor = domesticPing === 0 ? C.dim : (domesticPing < 60 ? C.ok : C.text);
  const forColor = foreignPing === 0 ? C.dim : (foreignPing < 180 ? C.ok : C.text);

  const Row = (ic, icCol, label, val, valCol) => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 5,
    children: [
      { type: 'image', src: `sf-symbol:${ic}`, color: icCol, width: 11, height: 11 },
      { type: 'text', text: label, font: { size: 10.5, weight: 'medium' }, textColor: C.dim },
      { type: 'spacer' }, 
      { type: 'text', text: val, font: { size: 10.5, weight: 'bold', family: 'Menlo' }, textColor: valCol, maxLines: 1, minScale: 0.6 }
    ]
  });

  const Hairline = () => ({ type: 'stack', height: 0.5, backgroundColor: C.hairline });

  // ── 7. 组件渲染输出 ──
  return {
    type: 'widget',
    backgroundColor: C.bg,
    padding: [12, 12, 10, 12],
    children: [
      // 🌟 第一行标题：完全对标 networkinfo 逻辑与排版
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          { type: 'image', src: `sf-symbol:${netIcon}`, color: C.accent, width: 15, height: 15 },
          { type: 'text', text: `${pubIsp} · ${netName}`, font: { size: 13, weight: 'heavy' }, textColor: C.text, maxLines: 1, minScale: 0.7, flex: 1 },
          // 胶囊双轨延迟测速模块
          {
            type: 'stack', direction: 'row', alignItems: 'center', gap: 4, padding: [2, 5], borderRadius: 5, backgroundColor: C.chip,
            children: [
              { type: 'stack', direction: 'row', alignItems: 'center', gap: 2, children: [
                  { type: 'image', src: 'sf-symbol:mappin.circle.fill', color: domColor, width: 9, height: 9 },
                  { type: 'text', text: domesticPing > 0 ? `${domesticPing}ms` : "-", font: { size: 9, weight: 'bold', family: 'Menlo' }, textColor: domColor }
              ]},
              { type: 'text', text: '|', font: { size: 9, weight: 'light' }, textColor: C.hairline },
              { type: 'stack', direction: 'row', alignItems: 'center', gap: 2, children: [
                  { type: 'image', src: 'sf-symbol:globe.fill', color: forColor, width: 9, height: 9 },
                  { type: 'text', text: foreignPing > 0 ? `${foreignPing}ms` : "-", font: { size: 9, weight: 'bold', family: 'Menlo' }, textColor: forColor }
              ]}
            ]
          }
        ]
      },
      { type: 'spacer', length: 8 },

      // 🌟 主体内容：采用高级双栏卡片分分栏设计，完美适配 Medium 桌面组件空间且绝不遮挡溢出
      {
        type: 'stack', direction: 'row', gap: 8, flex: 1,
        children: [
          // 左侧栏：本地与直连公网数据 (基于 Lan 方案)
          {
            type: 'stack', direction: 'column', flex: 1, gap: 4, padding: [6, 8], backgroundColor: C.panel, borderRadius: 6,
            children: [
              { type: 'text', text: 'LOCAL & DIRECT', font: { size: 8.5, weight: 'heavy' }, textColor: C.accent },
              { type: 'spacer', length: 1 },
              Row("iphone", C.accent, "内网 IP", localIp, C.text),
              Hairline(),
              Row("wifi.router.fill", C.accent, "路由网关", gateway, C.text),
              Hairline(),
              Row("globe", C.accent, "直连公网", pubIp, C.ok),
              Hairline(),
              Row("mappin.and.ellipse", C.accent, "直连位置", pubLoc, C.text)
            ]
          },
          // 右侧栏：代理落地与纯净度安全评级 (基于 IP 纯净度方案)
          {
            type: 'stack', direction: 'column', flex: 1, gap: 4, padding: [6, 8], backgroundColor: C.panel, borderRadius: 6,
            children: [
              { type: 'text', text: 'PROXY & PURITY', font: { size: 8.5, weight: 'heavy' }, textColor: C.accent },
              { type: 'spacer', length: 1 },
              Row("network", C.accent, "落地 IP", proxyIp, C.ok),
              Hairline(),
              Row("mappin.and.ellipse", C.accent, "落地位置", proxyLoc, C.text),
              Hairline(),
              Row("server.rack", C.accent, "落地机房", proxyIsp, C.text),
              Hairline(),
              Row("building.2.fill", C.accent, "原生属性", nativeText, C.text),
              Hairline(),
              Row(riskIc, riskCol, "风险评级", riskTxt, riskCol)
            ]
          }
        ]
      },
      { type: 'spacer', length: 4 },

      // 🌟 右下角面板更新时间展示
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          { type: 'spacer' },
          { type: 'text', text: `更新于 ${timeStr}`, font: { size: 8.5, weight: 'bold', family: 'Menlo' }, textColor: C.dim }
        ]
      }
    ]
  };
}
