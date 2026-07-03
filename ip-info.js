/**
 * 🌐 Egern 全能网络信息与 IP 纯净度看板 (高精度测速版)
 * 🎨 Tokyo Night 东京夜专属版：模块化仪表盘封装 / 告别悬浮感
 */
export default async function(ctx) {
  // ── 1. 动态侦测小组件尺寸 ──
  const family = String(ctx.widgetFamily || '').toLowerCase();
  const isLarge = family === 'systemlarge' || family === 'systemextralarge';

  // ── 2. Tokyo Night 赛博朋克 vs 科技马卡龙 双态色彩令牌系统 ──
  const C = {
    // 🌟 底层与卡片
    bg:       { light: '#EEF1FF', dark: '#000000' }, // 浅色冰蓝融入主题，深色极致 OLED 黑
    panel:    { light: '#FFFFFF', dark: '#121215' }, // 浅色纯白，深色深空灰衬托霓虹发光
    chip:     { light: '#F0F2F8', dark: '#1F1F24' }, 
    
    // 文本色 (浅色冷灰呼应冰蓝，深色科技灰)
    text:     { light: '#111114', dark: '#FFFFFF' },
    dim:      { light: '#64748B', dark: '#8F93A2' }, 
    
    // 🌟 核心强调色
    accent:   { light: '#7446D8', dark: '#B765FF' }, // 浅色亮面紫 / 深色赛博紫
    
    // 🌟 语义色彩 (Light: 科技马卡龙 | Dark: 夜之城霓虹)
    ok:       { light: '#10B981', dark: '#C7FF18' }, // 浅色薄荷翠 / 深色荧光绿
    warn:     { light: '#F59E0B', dark: '#FFD300' }, // 浅色阳光琥珀 / 深色赛博黄
    fail:     { light: '#FF4757', dark: '#FF2A6D' }  // 浅色果冻红 / 深色霓虹粉红
  };

  // ── 3. 像素级对标尺寸体系 ──
  const layout = {
    padding:    isLarge ? [10, 12, 10, 12] : [12, 12, 12, 12], 
    headerFz:   isLarge ? 13 : 11,  
    headerIcz:  isLarge ? 17 : 15,  
    timeFz:     10,  
    delayFz:    11,  
    delayIcz:   12,  
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

  const [directRes, proxyRes, ipApiRes] = await Promise.all([
    httpGetJson('https://myip.ipip.net/json'),
    httpGetJson('https://my.ippure.com/v1/info'),
    httpGetJson('http://ip-api.com/json/?lang=zh-CN')
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

  if (ipApiRes && ipApiRes.as) {
    proxyIsp = ipApiRes.as;
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
      
      // 🌟 核心升级：将孤立的顶部信息封装为「顶栏仪表盘卡片」
      {
        type: 'stack', direction: 'column', gap: 8,
        backgroundColor: C.panel, borderRadius: 8, padding: layout.groupPad,
        children: [
          // 第 1 行：网络名称与时间
          {
            type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
            children: [
              { type: 'image', src: `sf-symbol:${netIcon}`, color: C.accent, width: layout.headerIcz, height: layout.headerIcz },
              { type: 'text', text: `${pubIsp} · ${netName}`, font: { size: layout.headerFz, weight: 'bold' }, textColor: C.text, maxLines: 1, minScale: 0.7 },
              { type: 'spacer' },
              { type: 'text', text: timeStr, font: { size: layout.timeFz, weight: 'medium', design: 'monospaced' }, textColor: C.dim }
            ]
          },
          // 第 2 行：测速延迟 (内嵌式 LCD 发光屏设计)
          {
            type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
            padding: [6, 8], backgroundColor: C.chip, borderRadius: 6,
            children: [
              { type: 'spacer' },
              { type: 'image', src: 'sf-symbol:mappin.circle.fill', color: domColor, width: layout.delayIcz, height: layout.delayIcz },
              { type: 'text', text: domesticPing > 0 ? `${domesticPing}ms` : "-", font: { size: layout.delayFz, weight: 'semibold', design: 'monospaced' }, textColor: domColor },
              { type: 'spacer', length: 16 },
              { type: 'image', src: 'sf-symbol:globe.fill', color: forColor, width: layout.delayIcz, height: layout.delayIcz },
              { type: 'text', text: foreignPing > 0 ? `${foreignPing}ms` : "-", font: { size: layout.delayFz, weight: 'semibold', design: 'monospaced' }, textColor: forColor },
              { type: 'spacer' }
            ]
          }
        ]
      },

      // 🌟 主体内容
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
              Row("server.rack", C.accent, "机房", proxyIsp, C.text),
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
