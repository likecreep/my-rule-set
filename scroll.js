// ==UserScript==
// @name         回到顶部按钮（适配手机）
// @namespace    https://example.com/
// @version      1.1
// @description  在所有网站右下角添加一个“回到顶部”按钮，点击即可平滑滚动到顶部，适配手机端大小和滚动距离。
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const btn = document.createElement('div');
    btn.innerText = '↑';
    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '36px',
        height: '36px',
        lineHeight: '36px',
        textAlign: 'center',
        borderRadius: '50%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        color: '#fff',
        fontSize: '22px',
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
        zIndex: 999999,
        opacity: 0,
        transition: 'opacity 0.25s',
        userSelect: 'none',
        backdropFilter: 'blur(4px)',
    });

    document.body.appendChild(btn);

    btn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // 在手机上滚动较少就出现（100px）
    window.addEventListener('scroll', () => {
        const y = window.scrollY || document.documentElement.scrollTop;
        btn.style.opacity = y > 100 ? 1 : 0;
    });
})();
