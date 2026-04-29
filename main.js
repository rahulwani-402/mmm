/**
 * SillyTavern Avatar Deblur + GIF/MP4 Support
 * ------------------------------------------------------------
 * 1. 拦截 /thumbnail?type=xxx&file=yyy 请求，重写为直接指向原图的路径（原功能）
 * 2. 额外处理 GIF：强制刷新 src 使动画生效
 * 3. 额外处理 MP4/WebM：将 <img> 替换为 <video> 并循环播放
 */

(function () {
    'use strict';

    const TAG = '[Avatar Deblur+Media]';

    // thumbnail type -> 真实资料夹
    const TYPE_MAP = {
        avatar: 'characters',
        bg: 'backgrounds',
        persona: 'User Avatars',
    };

    // 支持的视频格式（可根据需要添加）
    const VIDEO_EXTS = ['mp4', 'webm', 'mov'];

    /**
     * 把 /thumbnail?type=...&file=... 改写成直链
     */
    function rewriteUrl(url) {
        try {
            if (!url || typeof url !== 'string') return url;
            if (url.indexOf('/thumbnail') === -1) return url;

            const u = new URL(url, window.location.origin);
            if (!u.pathname.endsWith('/thumbnail')) return url;

            const type = u.searchParams.get('type');
            const file = u.searchParams.get('file');
            if (!type || !file) return url;

            const folder = TYPE_MAP[type];
            if (!folder) return url;

            // 注意：file 已经是 encodeURIComponent 过的，直接拼
            return `/${encodeURIComponent(folder)}/${file}`;
        } catch (e) {
            return url;
        }
    }

    /**
     * 从 CSS background-image 值里抽 url(...) 并改写
     */
    function rewriteBackgroundImage(value) {
        if (!value || value.indexOf('/thumbnail') === -1) return value;
        return value.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, raw) => {
            const nu = rewriteUrl(raw);
            return `url(${quote}${nu}${quote})`;
        });
    }

    // -----------------------------------------------------
    // 新增：判断文件是否为视频
    function isVideoUrl(url) {
        if (!url) return false;
        const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
        return VIDEO_EXTS.includes(ext);
    }

    // 新增：判断是否为 GIF
    function isGifUrl(url) {
        if (!url) return false;
        const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
        return ext === 'gif';
    }

    // 新增：强制刷新 GIF
    function refreshGif(img, newSrc) {
        if (!img || img.tagName !== 'IMG') return;
        // 如果 src 没变，也要重新加载一次（清除缓存）
        if (img.src === newSrc) {
            // 简单方法：加一个随机参数强制刷新
            const separator = newSrc.includes('?') ? '&' : '?';
            img.src = newSrc + separator + '_t=' + Date.now();
        } else {
            img.src = newSrc;
        }
        // 可选：把图片的 loading="lazy" 临时去掉，确保立即加载
        img.loading = 'eager';
    }

    // 新增：将 img 替换为 video
    function replaceImgWithVideo(img, videoSrc) {
        if (!img || img.tagName !== 'IMG') return;
        // 防止重复替换（原 img 可能已被替换过一次）
        if (img._replacedAsVideo) return;

        const video = document.createElement('video');
        // 复制所有重要的属性
        video.src = videoSrc;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;          // 自动播放必须静音
        video.playsInline = true;    // iOS 内联播放
        video.controls = false;
        // 复制 class、id、样式
        video.className = img.className;
        video.id = img.id;
        if (img.style.cssText) video.style.cssText = img.style.cssText;
        // 复制宽度/高度属性
        if (img.width) video.width = img.width;
        if (img.height) video.height = img.height;
        // 复制 data-* 属性
        for (const attr of img.attributes) {
            if (attr.name.startsWith('data-')) {
                video.setAttribute(attr.name, attr.value);
            }
        }
        // 标记已替换，避免重复操作
        video._isVideoReplacement = true;
        img._replacedAsVideo = true;

        // 替换节点
        img.parentNode.replaceChild(video, img);

        // 尝试播放（静音自动播放大部分浏览器允许）
        video.play().catch(e => console.debug(`${TAG} Autoplay blocked:`, e));
    }

    // -----------------------------------------------------
    // 处理单个 img (主要修改点)
    function processImg(img) {
        if (!img || img.tagName !== 'IMG') return;
        // 如果这个img已经被替换成video，不再处理
        if (img._replacedAsVideo) return;

        const src = img.getAttribute('src');
        if (!src) return;

        const newSrc = rewriteUrl(src);
        if (newSrc === src && !isGifUrl(src) && !isVideoUrl(src)) return;

        // 情况1：视频文件 -> 替换标签
        if (isVideoUrl(newSrc)) {
            replaceImgWithVideo(img, newSrc);
            return;
        }

        // 情况2：GIF 文件 -> 强制刷新，确保动起来
        if (isGifUrl(newSrc)) {
            refreshGif(img, newSrc);
            return;
        }

        // 情况3：普通图片（包括原插件功能）
        if (newSrc !== src) {
            img.setAttribute('src', newSrc);
        }
    }

    function processBg(el) {
        if (!el.style) return;
        const bg = el.style.backgroundImage;
        if (!bg) return;
        const nb = rewriteBackgroundImage(bg);
        if (nb !== bg) el.style.backgroundImage = nb;
    }

    function processElement(el) {
        if (!el || el.nodeType !== 1) return;
        // 处理 img 标签
        if (el.tagName === 'IMG') {
            processImg(el);
        }
        // 处理背景图片
        processBg(el);

        // 如果元素内有 img（例如容器内）
        if (el.querySelectorAll) {
            el.querySelectorAll('img').forEach(processImg);
            el.querySelectorAll('[style*="thumbnail"]').forEach(processBg);
        }
    }

    // 初始扫描整个文档
    function initialSweep() {
        document.querySelectorAll('img').forEach(processImg);
        document.querySelectorAll('[style*="thumbnail"]').forEach(processBg);
    }

    // --- MutationObserver 监听动态变化 ---
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) processElement(node);
                });
            } else if (m.type === 'attributes') {
                const t = m.target;
                if (m.attributeName === 'src' && t.tagName === 'IMG') {
                    // 避免对已经替换成 video 的旧元素重复处理（实际上已替换后不再是 img）
                    processImg(t);
                } else if (m.attributeName === 'style') {
                    processBg(t);
                }
            }
        }
    });

    // 拦截 fetch 作为保险（保持原功能）
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = function (input, init) {
            try {
                if (typeof input === 'string') {
                    input = rewriteUrl(input);
                } else if (input && input.url) {
                    const nu = rewriteUrl(input.url);
                    if (nu !== input.url) {
                        input = new Request(nu, input);
                    }
                }
            } catch (e) { /* noop */ }
            return origFetch.call(this, input, init);
        };
    }

    function start() {
        initialSweep();
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style'],
        });
        console.log(`${TAG} loaded — supports GIF animation & MP4 video avatars`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
