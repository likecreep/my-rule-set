/*
 * 名称: 📅 日历 / 老黄历 (Tokyo Night 黑曜石/白瓷 终极完美版)
 * 🎨 完美对齐仪表盘系统 / 0.5px物理边框 / 极细分割线 / 发光果冻标签
 * ==========================================
 */
export default async function(ctx) {
  // ── 1. Tokyo Night 黑曜石双态色彩令牌系统 ──
  const C = {
    // 🌟 底板隐形：浅色冰蓝，深色夜空蓝，与 App 页面完全同色融合
    bg:       { light: '#EEF1FF', dark: '#16161E' }, 
    
    // 🌟 卡片主体：浅色纯白，深色极致 OLED 纯黑
    panel:    { light: '#FFFFFF', dark: '#000000' }, 
    
    // 🌟 物理反光边缘：浅色 8% 纯黑透明度模拟阴影，深色午夜蓝微光描边
    border:   { light: '#00000014', dark: '#2B3045' },
    
    // 次级模块底色 (左侧日期框、底部节气气泡)
    chip:     { light: '#F0F2F8', dark: '#1F1F24' }, 
    
    // 🌟 极细分割线：浅色钛银灰，深色午夜蓝
    hairline: { light: '#D1D9E6', dark: '#2B3045' },
    
    text:     { light: '#111114', dark: '#FFFFFF' },
    dim:      { light: '#64748B', dark: '#8F93A2' }, 
    
    // 🌟 核心强调色与语义色
    accent:   { light: '#7446D8', dark: '#B765FF' }, // 赛博紫 (用于干支、星期)
    ok:       { light: '#10B981', dark: '#C7FF18' }, // 荧光绿 (用于宜、节气)
    warn:     { light: '#F59E0B', dark: '#FFD300' }, // 赛博黄 (用于节日)
    fail:     { light: '#FF4757', dark: '#FF2A6D' }, // 霓虹红 (用于忌、冲煞)
    
    // 🌟 发光果冻标签底色 (10% 透明度)
    yiBg:     { light: '#10B9811A', dark: '#C7FF181A' }, 
    jiBg:     { light: '#FF47571A', dark: '#FF2A6D1A' }, 
  };

  const now = new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000);
  const [Y, M, D] = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  const WEEK = "日一二三四五六"[now.getDay()];
  const P = n => n < 10 ? `0${n}` : n;

  // ---------- 农历核心 (逻辑保持原样) ----------
  const Lunar = {
    info: [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,0x0d520],
    termNames: ["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"],
    getTerm(y, n) { return new Date((31556925974.7*(y-1900)+[0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758][n-1]*60000)+Date.UTC(1900,0,6,2,5)).getUTCDate() },
    parse(y, m, d) {
      let offset = Math.round((Date.UTC(y, m-1, d) - Date.UTC(1900, 0, 31)) / 86400000), i, temp = 0;
      for(i=1900; i<2101 && offset>0; i++) {
        temp = 348; for(let j=0x8000; j>0x8; j>>=1) temp += (this.info[i-1900] & j) ? 1 : 0;
        temp += (this.info[i-1900] & 0xf) ? ((this.info[i-1900] & 0x10000) ? 30 : 29) : 0;
        offset -= temp;
      }
      if(offset < 0) { offset += temp; i--; }
      const lYear = i, leap = this.info[lYear-1900] & 0xf; 
      let isLeap = false;
      for(i=1; i<13 && offset>0; i++) {
        if(leap>0 && i==(leap+1) && !isLeap) { --i; isLeap=true; temp = (this.info[lYear-1900] & 0x10000) ?
