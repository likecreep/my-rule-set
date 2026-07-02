/**
 * 拦截 tftsbpakai.io 并返回跳转逻辑
 */

const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting...</title>
</head>
<body>
  <script>
    (function openSite() {
      // 1. 准备跳转参数
      const params = JSON.stringify({
        data: {
          path: "home/tftQrcode"
        },
        callback: null,
        extra: null,
      });

      try {
        // 2. 告诉 iOS 打开原生路径
        window.webkit.messageHandlers.openNativePath.postMessage(params);
        
        // 3. 立即尝试关闭当前 WebView
        // 注意：这里将参数也序列化为字符串，防止原生端解析失败
        
      } catch (e) {
        // 动态创建一个红色的悬浮层来显示错误
        const errorBox = document.createElement("div");
        errorBox.style.cssText = "position:fixed; top:20px; left:10px; right:10px; background-color:#ff4d4f; color:white; padding:15px; border-radius:8px; z-index:9999; font-size:14px; word-break:break-all; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";
        
        // 获取具体的错误信息
        const errorMsg = e.message || String(e);
        errorBox.innerHTML = "<strong>❌ JSBridge 调用失败:</strong><br><br>" + errorMsg;
        
        // 将错误框添加到页面中
        document.body.appendChild(errorBox);
      }

    })();
  </script>
</body>
</html>
`;

$done({
  response: {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    },
    body: htmlContent
  }
});
