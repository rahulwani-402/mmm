/**
 * SillyTavern Avatar Deblur + GIF/MP4/WebM 完整版
 * 支持 GIF 动画 + MP4/WebM 视频（需配合 URL 使用）
 */

(function () {
    'use strict';
    const TAG = '[Avatar Deblur+Media]';

    const TYPE_MAP = {
        avatar: 'characters',
        bg: 'backgrounds',
        persona: 'User Avatars',
    };
    const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi'];

    function rewriteUrl(url) {
        try {
            if (!url || typeof url !== 'string' || url.indexOf('/thumbnail') === -1) return url;
            const u = new URL(url, window.location.origin);
            if (!u.pathname.endsWith('/thumbnail')) return url;
            const type = u.searchParams.get('type');
            const file = u.searchParams.get('file');
            if (!type || !file) return url;
            const folder = TYPE_MAP[type];
            return folder ? `/${encodeURIComponent(folder)}/${file}` : url;
        } catch { return url; }
    }

    function isVideoOrGif(url) {
        const ext = url?.split('?')[0]?.split('.').pop()?.toLowerCase();
        return ext === 'gif' || VIDEO_EXTS.includes(ext);
    }

    function replaceImgWithVideo(img, videoSrc) {
        if (!img || img.tagName !== 'IMG' || img._replacedAsVideo) return;
        const video = document.createElement('video');
        video.src = videoSrc;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.controls = false;
        video.className = img.className;
        video.id = img.id;
        if (img.style.cssText) video.style.cssText = img.style.cssText;
        if (img.width) video.width = img.width;
        if (img.height) video.height = img.height;
        for (const attr of img.attributes) {
            if (attr.name.startsWith('data-')) video.setAttribute(attr.name, attr.value);
        }
        video._isVideoReplacement = true;
        img._replacedAsVideo = true;
        img.parentNode.replaceChild(video, img);
        video.play().catch(e => console.debug(`${TAG} 视频自动播放被阻止:`, e));
    }

    function processImg(img) {
        if (!img || img.tagName !== 'IMG' || img._replacedAsVideo) return;
        const src = img.getAttribute('src');
        if (!src) return;
        const newSrc = rewriteUrl(src);
        if (isVideoOrGif(newSrc)) {
            if (VIDEO_EXTS.some(ext => newSrc.toLowerCase().includes('.' + ext))) {
                replaceImgWithVideo(img, newSrc);
            } else {
                // GIF：强制刷新
                const separator = newSrc.includes('?') ? '&' : '?';
                img.src = newSrc + separator + '_t=' + Date.now();
                img.loading = 'eager';
            }
        } else if (newSrc !== src) {
            img.setAttribute('src', newSrc);
        }
    }

    function processElement(el) {
        if (!el || el.nodeType !== 1) return;
        if (el.tagName === 'IMG') processImg(el);
        el.querySelectorAll?.('img').forEach(processImg);
    }

    function initialSweep() {
        document.querySelectorAll('img').forEach(processImg);
    }

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach(node => (node.nodeType === 1) && processElement(node));
            } else if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG') {
                processImg(m.target);
            }
        }
    });

    function start() {
        initialSweep();
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src'],
        });
        console.log(`${TAG} 已加载 —— 支持 GIF 动画和 MP4/WebM 视频（需配合外部 URL）`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
