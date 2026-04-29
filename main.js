/**
 * Avatar Deblur + Custom Avatar URL + GIF/MP4 Support
 * ----------------------------------------------------
 * 1. 修复模糊头像
 * 2. 支持自定义头像 URL（GIF/MP4/网络图片）
 * 3. 在角色编辑弹窗中添加输入框
 * 4. 自动保存/加载自定义头像 URL
 */

(function () {
    'use strict';

    const TAG = '[Avatar Deblur+URL]';
    const STORAGE_KEY = 'custom_avatar_urls';

    // 获取 SillyTavern 上下文
    let context;
    try { context = SillyTavern.getContext(); } catch(e) { console.warn(TAG, '上下文获取失败，等待重试'); }

    // 辅助：存储自定义头像 URL（按角色 ID）
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

    // 获取当前角色ID（SillyTavern 内部使用 character.id 或 character.name）
    function getCurrentCharacterId() {
        if (!context || !context.characterId) return null;
        return context.characterId;
    }

    // 强制让某个 img 元素使用自定义 URL（如果存在）
    function applyCustomUrlToImg(img, characterId) {
        if (!img || img.tagName !== 'IMG') return false;
        const customUrl = getCustomAvatarUrl(characterId);
        if (!customUrl) return false;
        // 避免重复设置死循环
        if (img.getAttribute('data-custom-url') === customUrl) return true;
        img.setAttribute('data-custom-url', customUrl);
        // 直接修改 src（插件后续还会拦截 /thumbnail，但自定义 URL 一般已经是直链）
        if (img.src !== customUrl) {
            img.src = customUrl;
            // 如果是 GIF/视频，后续 processImg 会进一步处理
        }
        return true;
    }

    // ========== 原有的 Url 重写逻辑（保持不变） ==========
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

        // 优先使用自定义 URL（如果存在）
        const cid = getCurrentCharacterId();
        if (cid) {
            const customUrl = getCustomAvatarUrl(cid);
            if (customUrl && img.src !== customUrl) {
                img.src = customUrl;
                // 递归一次处理新 src
                setTimeout(() => processImg(img), 10);
                return;
            }
        }

        const newSrc = rewriteUrl(src);
        if (isVideoOrGif(newSrc)) {
            if (VIDEO_EXTS.some(ext => newSrc.toLowerCase().includes('.' + ext))) {
                replaceImgWithVideo(img, newSrc);
            } else {
                // GIF: 强制刷新
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

    // ========== 新增：注入角色编辑弹窗的 UI ==========
    function injectCustomUrlInput() {
        // 等待角色编辑弹窗出现
        const popupSelector = '.character_editor, .character-editor, .character_popup, [class*="characterEditor"]';
        let popup = document.querySelector(popupSelector);
        if (!popup) {
            // 没有弹窗就每 500ms 检查一次，直到出现
            setTimeout(injectCustomUrlInput, 500);
            return;
        }

        // 避免重复注入
        if (popup.querySelector('.custom-avatar-url-field')) return;

        // 找到合适的位置插入（通常在头像预览区域附近）
        const targetArea = popup.querySelector('.avatar-preview, .character-avatar, .avatar_section, [class*="avatar"]');
        if (!targetArea) return;

        // 创建输入框
        const container = document.createElement('div');
        container.className = 'custom-avatar-url-field';
        container.style.marginTop = '10px';
        container.style.padding = '5px';
        container.style.borderTop = '1px solid #ccc';

        const label = document.createElement('label');
        label.innerText = '🎥 自定义头像 URL (GIF/MP4/图片):';
        label.style.display = 'block';
        label.style.fontSize = '12px';
        label.style.marginBottom = '5px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'https:// 或 /本地路径.mp4';
        input.style.width = '100%';
        input.style.padding = '4px';

        const saveBtn = document.createElement('button');
        saveBtn.innerText = '保存并应用';
        saveBtn.style.marginTop = '5px';
        saveBtn.style.width = '100%';

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(saveBtn);
        targetArea.appendChild(container);

        // 获取当前角色 ID 并回填已有 URL
        const currentId = getCurrentCharacterId();
        if (currentId) {
            const saved = getCustomAvatarUrl(currentId);
            if (saved) input.value = saved;
        }

        // 保存按钮逻辑
        saveBtn.onclick = () => {
            const newUrl = input.value.trim();
            const cid = getCurrentCharacterId();
            if (!cid) {
                alert('无法获取角色 ID，请重试');
                return;
            }
            saveCustomAvatarUrl(cid, newUrl);
            // 立即刷新界面中的头像
            document.querySelectorAll('img.avatar, img.character_image, .chara-thumb img').forEach(img => {
                if (img.closest('.character_editor, .character-editor')) return; // 避免刷新弹窗内的头像
                processImg(img);
            });
            alert('已保存，稍后头像会自动更新');
        };
    }

    // 监听角色编辑弹窗打开（SillyTavern 有事件）
    function watchForCharacterEditor() {
        if (context && context.eventSource) {
            context.eventSource.on('characterEdit', () => {
                setTimeout(injectCustomUrlInput, 200);
            });
        } else {
            // 后备：MutationObserver 监听 body 变化
            const obs = new MutationObserver(() => {
                const editor = document.querySelector('.character_editor, .character-editor, .character_popup');
                if (editor && !editor.querySelector('.custom-avatar-url-field')) {
                    injectCustomUrlInput();
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    }

    // ========== 启动 ==========
    function init() {
        // 原有扫描
        const scan = () => {
            document.querySelectorAll('img').forEach(processImg);
        };
        scan();

        // 监听动态变化
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(node => node.nodeType === 1 && processElement(node));
                } else if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG') {
                    processImg(m.target);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

        // 注入 URL 设置面板
        watchForCharacterEditor();

        console.log(`${TAG} 已加载 — 支持自定义 GIF/MP4 头像 URL，并在角色编辑窗口添加输入框`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
