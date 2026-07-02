/**
 * 🌐 Egern 全能网络信息与 IP 纯净度看板 (高精度测速版)
 * 🎨 对齐 ai-media-check 间距与字号 / 同步阻塞精准测速 / 严格遵循官方 API 规范
 */
export default async function(ctx) {
  // ── 1. 动态侦测小组件尺寸 ──
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

  // ── 3. 严格对标 ai-media-check 尺寸体系 ──
  const layout = {
    padding:    isLarge ? [10, 12, 10, 12] : [12, 12, 12, 12], 
    headerFz:   isLarge ? 12 : 10,
    headerIcz:  isLarge ? 17 : 15,
    timeFz:     isLarge ? 12 : 10,
    delayFz:    isLarge ? 13 : 11,
    delayIcz:   isLarge ? 13 : 11,
    rowFz:      isLarge ? 13 : 11,    
    rowIcz:     isLarge ? 15 : 13,    
    rowGap:     6,                    
    groupPad:   isLarge ? [8, 10] : [6, 8]
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

  // ── 5. 同步阻塞式网络测速 (严格应用官方 redirect: 'manual' 阻断重定向) ──
  let domesticPing = 0;
  try {
    const s1 = Date.now();
    await ctx.http.get('http://wifi.vivo.com.cn/generate_204', { 
      method: 'HEAD', 
      timeout: 2000, 
      redirect: 'manual' 
    });
    domesticPing = Date.now() - s1;
  } catch (e) {}

  let foreignPing = 0;
  try {
    const s2 = Date.now();
    await ctx.http.get('http://1.1.1.1/generate_204', { 
      method: 'HEAD', 
      timeout: 2000, 
      redirect: 'manual' 
    });
    foreignPing = Date.now() - s2;
  } catch (e) {}

  // ── 6. 获取节点 IP 与纯净度数据 ──
  const TIMEOUT_MS = 3500;
  const httpGetJson = async (url) => {
    try {
      const res = await ctx.http.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: TIMEOUT_MS });
      return JSON.parse(await res.text());
    } catch (e) {
      return null;
    }
  };

  const [directRes, proxyRes] = await Promise.all([
    httpGetJson('https://myip.ipip.net/json'),
    httpGetJson('https://my.ippure.com/v1/info')
  ]);

  // ── 7. 解析直连公网与位置数据 ──
  let pubIp = "获取失败", pubLoc = "未知位置", pubIsp = "未知运营商";
  
  const fmtISP = (isp) => {
    if (!isp) return "未知";
    const s = String(isp).toLowerCase();
    if (/移动|mobile|cmcc/i.test(s)) return "中国移动";
    if (/电信|telecom|chinanet/i.test(s)) return "中国电信";
    if (/联通|unicom/i.test(s)) return "中国联通";
    if (/广电|broadcast|cbn/i.test(s)) return "中国广电";
    return isp; 
  };

  if (directRes && directRes.data) {
    const body = directRes.data;
    pubIp = body.ip || "获取失败";
    const locArr = body.location || [];
    pubIsp = fmtISP(locArr[4] || locArr[3]);
    
    let pubLocStr = `${locArr[1] || ""} ${locArr[2] || ""}`.trim();
    let pubFlag = "🇨🇳"; 
    if (locArr[0] && locArr[0] !== "中国") pubFlag = "🌐"; 
    pubLoc = pubLocStr ? `${pubFlag} ${pubLocStr}` : `${pubFlag} 中国`;
  }

  // ── 8. 解析代理外网与纯净度数据 ──
  let proxyIp = "获取失败", proxyLoc = "未知位置", proxyIsp = "未知", nativeText = "未知", riskTxt = "获取失败";
  let riskCol = C.dim, riskIc = "questionmark.shield.fill";

  if (proxyRes) {
    const p = proxyRes;
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

  // ── 9. 格式化输出与颜色构造 ──
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

  const Row = (ic, icColor, label, val, valCol) => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: layout.rowGap,
    children: [
      { type: 'stack', width: layout.rowIcz, alignItems: 'center', children: [
          { type: 'image', src: `sf-symbol:${ic}`, color: icColor, width: layout.rowIcz, height: layout.rowIcz }
      ]},
      { type: 'text', text: label, font: { size: layout.rowFz }, textColor: C.dim },
      { type: 'spacer' },
      { type: 'text', text: val, font: { size: layout.rowFz, weight: 'bold', family: 'Menlo' }, textColor: valCol, maxLines: 1, minScale: 0.6 }
    ]
  });

  // ── 10. 最终组件渲染输出 ──
  return {
    type: 'widget',
    backgroundColor: C.bg,
    padding: layout.padding,
    gap: 8, 
    children: [
      // 🌟 第 1 行：左侧运营商/网络名 (bold)，右侧时间含秒数 (monospaced)
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          { type: 'image', src: `sf-symbol:${netIcon}`, color: C.accent, width: layout.headerIcz, height: layout.headerIcz },
          { type: 'text', text: `${pubIsp} · ${netName}`, font: { size: layout.headerFz, weight: 'bold' }, textColor: C.dim, maxLines: 1, minScale: 0.7 },
          { type: 'spacer' },
          { type: 'text', text: timeStr, font: { size: layout.timeFz, weight: 'medium', design: 'monospaced' }, textColor: C.dim }
        ]
      },

      // 🌟 第 2 行：测速延迟独占一行，右侧对齐，字体对齐
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          { type: 'spacer' },
          { type: 'image', src: 'sf-symbol:mappin.circle.fill', color: domColor, width: layout.delayIcz, height: layout.delayIcz },
          { type: 'text', text: domesticPing > 0 ? `${domesticPing}ms` : "-", font: { size: layout.delayFz, weight: 'semibold' }, textColor: domColor },
          { type: 'spacer', length: 12 },
          { type: 'image', src: 'sf-symbol:globe.fill', color: forColor, width: layout.delayIcz, height: layout.delayIcz },
          { type: 'text', text: foreignPing > 0 ? `${foreignPing}ms` : "-", font: { size: layout.delayFz, weight: 'semibold' }, textColor: forColor }
        ]
      },

      // 🌟 主体内容：包裹在垂直 flex 容器内，自动撑满剩余空间
      {
        type: 'stack', direction: 'column', flex: 1, gap: 8,
        children: [
          // 第 1 组：本地与公网网络
          {
            type: 'stack', direction: 'column', flex: 1, padding: layout.groupPad, backgroundColor: C.panel, borderRadius: 8,
            children: [
              Row("globe", C.accent, "公网 IP", pubIp, C.ok),
              { type: 'spacer' },
              Row("mappin.and.ellipse", C.accent, "位置", pubLoc, C.text),
              { type: 'spacer' },
              Row("iphone", C.accent, "内网 IP", localIp, C.text),
              { type: 'spacer' },
              Row("wifi.router.fill", C.accent, "路由网关", gateway, C.text)
            ]
          },
          // 第 2 组：外网与纯净度 
          {
            type: 'stack', direction: 'column', flex: 1, padding: layout.groupPad, backgroundColor: C.panel, borderRadius: 8,
            children: [
              Row("network", C.accent, "外网 IP", proxyIp, C.ok),
              { type: 'spacer' },
              Row("location.fill", C.accent, "位置", proxyLoc, C.text), 
              { type: 'spacer' },
              Row("server.rack", C.accent, "落地机房", proxyIsp, C.text),
              { type: 'spacer' },
              Row("building.2.fill", C.accent, "原生属性", nativeText, C.text),
              { type: 'spacer' },
              Row(riskIc, riskCol, "风险评级", riskTxt, riskCol)
            ]
          }
        ]
      }
    ]
  };
}
