/**
 * Avatar Deblur + Custom Avatar URL (GIF/MP4/图片)
 * 专为 SillyTavern 设计，在角色编辑窗口添加自定义头像 URL 输入框
 * 支持网络图片、GIF 动画、MP4/WebM 视频（自动静音循环）
 */

(function () {
    'use strict';

    const TAG = '[Avatar Deblur+URL]';
    const STORAGE_KEY = 'custom_avatar_urls';   // localStorage 存储 key

    // ---------- 辅助函数：读写自定义 URL ----------
    function saveCustomAvatarUrl(characterId, url) {
        if (!characterId) return;
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (url && url.trim()) data[characterId] = url.trim();
        else delete data[characterId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function getCustomAvatarUrl(characterId) {
        if (!characterId) return null;
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return data[characterId] || null;
    }

    // 获取当前编辑的角色ID（SillyTavern 内部通常用 character.id）
    function getCurrentCharacterId() {
        try {
            const ctx = SillyTavern.getContext();
            return ctx?.characterId || null;
        } catch(e) {
            return null;
        }
    }

    // ---------- 原有插件：URL 重写 & GIF/MP4 处理 ----------
    const TYPE_MAP = {
        avatar: 'characters',
        bg: 'backgrounds',
        persona: 'User Avatars',
    };
    const VIDEO_EXTS = ['mp4', 'webm', 'mov'];

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
            return `/${encodeURIComponent(folder)}/${file}`;
        } catch (e) {
            return url;
        }
    }

    function isVideoOrGif(url) {
        if (!url) return false;
        const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
        return ext === 'gif' || VIDEO_EXTS.includes(ext);
    }

    // 将 <img> 替换为 <video>（用于 MP4/WebM）
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
        video.play().catch(e => console.debug(`${TAG} 视频自动播放失败:`, e));
    }

    // 处理单个 img 元素（应用自定义 URL + 消除缩略图 + GIF/视频处理）
    function processImg(img) {
        if (!img || img.tagName !== 'IMG' || img._replacedAsVideo) return;

        const currentSrc = img.getAttribute('src');
        if (!currentSrc) return;

        // 1. 优先使用自定义 URL（如果存在且匹配当前角色）
        const cid = getCurrentCharacterId();
        if (cid) {
            const customUrl = getCustomAvatarUrl(cid);
            if (customUrl && img.src !== customUrl) {
                img.src = customUrl;
                // 重新调用一次，让后续逻辑处理视频/GIF
                setTimeout(() => processImg(img), 10);
                return;
            }
        }

        // 2. 没有自定义 URL，则进行原插件的 URL 重写（去模糊）
        const newSrc = rewriteUrl(currentSrc);
        if (isVideoOrGif(newSrc)) {
            if (VIDEO_EXTS.some(ext => newSrc.toLowerCase().includes('.' + ext))) {
                replaceImgWithVideo(img, newSrc);
            } else {
                // GIF: 强制刷新缓存，加时间戳
                const separator = newSrc.includes('?') ? '&' : '?';
                img.src = newSrc + separator + '_t=' + Date.now();
                img.loading = 'eager';
            }
        } else if (newSrc !== currentSrc) {
            img.setAttribute('src', newSrc);
        }
    }

    // 扫描并处理元素内的 img
    function processElement(el) {
        if (!el || el.nodeType !== 1) return;
        if (el.tagName === 'IMG') processImg(el);
        el.querySelectorAll?.('img').forEach(processImg);
    }

    // ---------- 注入自定义 UI 到角色编辑弹窗 ----------
    function injectCustomUrlInput() {
        // 等待弹窗中的头像预览 img 出现
        const previewImg = document.querySelector('#avatar_load_preview');
        if (!previewImg) {
            // 没出现，0.5 秒后再试
            setTimeout(injectCustomUrlInput, 500);
            return;
        }

        // 避免重复注入
        const parent = previewImg.closest('div[class*="avatar"]') || previewImg.parentElement;
        if (!parent) return;
        if (parent.querySelector('.custom-avatar-url-field')) return;

        // 获取当前角色 ID
        const cid = getCurrentCharacterId();
        const savedUrl = cid ? getCustomAvatarUrl(cid) : '';

        // 创建输入框容器
        const container = document.createElement('div');
        container.className = 'custom-avatar-url-field';
        container.style.marginTop = '12px';
        container.style.padding = '8px';
        container.style.backgroundColor = 'rgba(0,0,0,0.3)';
        container.style.borderRadius = '6px';
        container.style.border = '1px solid #444';

        const label = document.createElement('label');
        label.innerText = '🎞️ 自定义头像 URL (GIF/MP4/图片)';
        label.style.display = 'block';
        label.style.fontSize = '12px';
        label.style.marginBottom = '6px';
        label.style.fontWeight = 'bold';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'https:// 或 /本地路径.mp4 或 /characters/xxx.gif';
        input.value = savedUrl;
        input.style.width = '100%';
        input.style.padding = '6px';
        input.style.backgroundColor = '#222';
        input.style.color = '#eee';
        input.style.border = '1px solid #555';
        input.style.borderRadius = '4px';

        const button = document.createElement('button');
        button.innerText = '💾 保存并应用';
        button.style.marginTop = '8px';
        button.style.width = '100%';
        button.style.padding = '6px';
        button.style.backgroundColor = '#3a6ea5';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(button);

        // 插入到头像预览区域的合适位置
        parent.appendChild(container);

        // 保存按钮逻辑
        button.onclick = () => {
            const newUrl = input.value.trim();
            const cidNow = getCurrentCharacterId();
            if (!cidNow) {
                alert('无法获取角色 ID，请重新打开编辑窗口');
                return;
            }
            saveCustomAvatarUrl(cidNow, newUrl);

            // 立即更新当前预览图片
            if (newUrl) {
                // 如果原先已经是 video，需要先复原（简单粗暴刷新整个预览区域）
                // 更稳健：直接修改预览 img 的 src，然后调用 processImg
                const currentPreview = document.querySelector('#avatar_load_preview');
                if (currentPreview && currentPreview.tagName === 'IMG') {
                    currentPreview.src = newUrl;
                    // 强迫重新处理（可能变成 video）
                    processImg(currentPreview);
                } else if (currentPreview && currentPreview.tagName === 'VIDEO') {
                    // 如果已经变成 video 了，删掉 video 重新创建一个 img
                    const newImg = document.createElement('img');
                    newImg.id = 'avatar_load_preview';
                    newImg.src = newUrl;
                    newImg.className = currentPreview.className;
                    newImg.style.cssText = currentPreview.style.cssText;
                    currentPreview.parentNode.replaceChild(newImg, currentPreview);
                    processImg(newImg);
                }
            } else {
                // 清空自定义 URL，恢复默认
                const currentPreview = document.querySelector('#avatar_load_preview');
                if (currentPreview && (currentPreview.tagName === 'IMG' || currentPreview.tagName === 'VIDEO')) {
                    // 触发页面刷新一下，或者重新加载角色数据
                    location.reload(); // 简单粗暴，也可以触发角色切换事件
                }
            }
            alert('已保存，头像将在聊天界面和预览中更新');
        };
    }

    // 监听角色编辑弹窗的打开事件（SillyTavern 事件或 DOM 监听）
    function watchForEditor() {
        // 方法1：使用 SillyTavern 事件（如果可用）
        try {
            const ctx = SillyTavern.getContext();
            if (ctx && ctx.eventSource) {
                ctx.eventSource.on('characterEdit', () => {
                    setTimeout(injectCustomUrlInput, 200);
                });
            } else {
                throw new Error('No eventSource');
            }
        } catch(e) {
            // 方法2：MutationObserver 监控 body，发现弹窗出现时注入
            const observer = new MutationObserver(() => {
                if (document.querySelector('#avatar_load_preview') && !document.querySelector('.custom-avatar-url-field')) {
                    injectCustomUrlInput();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // ---------- 全局扫描和动态监听 ----------
    function init() {
        // 初始扫描所有 img
        document.querySelectorAll('img').forEach(processImg);
        // 监听新增元素
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1) processElement(node);
                    });
                } else if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG') {
                    processImg(m.target);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

        // 注入角色编辑面板 UI
        watchForEditor();

        console.log(`${TAG} 已启动 — 支持自定义头像 URL，请在角色编辑窗口查看`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
