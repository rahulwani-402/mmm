// 拦截所有头像图片的缩略图请求，重定向到原图
// 同时将 .gif / .mp4 文件正确处理：GIF 保持 img 但去模糊，MP4 转换为 video 标签

(function() {
    // 防止重复加载
    if (window._avatarDeblurEnhancedLoaded) return;
    window._avatarDeblurEnhancedLoaded = true;

    const ST = SillyTavern.getContext();  // 获取 SillyTavern 上下文

    // 检测是否为缩略图路径，并转换为原图 URL
    function getOriginalUrl(url) {
        if (!url) return url;
        // 常见缩略图模式：/thumb/xxx 或包含 'thumbnail'
        let newUrl = url;
        newUrl = newUrl.replace(/\/thumb\//g, '/');
        newUrl = newUrl.replace(/thumbnail/gi, '');
        // 去除可能残留的尺寸参数 (如 ?height=100)
        newUrl = newUrl.replace(/\?.*$/, '');
        // 如果去缩略图后路径与原图不同，返回新路径
        if (newUrl !== url) return newUrl;
        return url;
    }

    // 判断文件类型
    function getMediaType(url) {
        const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
        if (ext === 'mp4' || ext === 'webm' || ext === 'mov') return 'video';
        if (ext === 'gif') return 'gif';
        return 'image';
    }

    // 处理单个头像元素 (img 标签)
    function processAvatarElement(img) {
        if (!img || img._avatarProcessed) return;
        img._avatarProcessed = true;

        const originalSrc = img.src;
        if (!originalSrc) return;

        const originalUrl = getOriginalUrl(originalSrc);
        const mediaType = getMediaType(originalUrl);

        // 如果是普通图片或 GIF，直接修改 img 的 src 即可（GIF 会动画）
        if (mediaType === 'image' || mediaType === 'gif') {
            if (originalUrl !== originalSrc) {
                img.src = originalUrl;
            }
            return;
        }

        // 如果是视频文件（mp4 等），将 img 替换为 video 标签
        if (mediaType === 'video') {
            const video = document.createElement('video');
            // 复制所有有用的属性
            video.src = originalUrl;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;      // 自动播放必须静音
            video.playsInline = true;
            video.controls = false;   // 头像通常不需要控制条
            // 复制 class、id、style 等
            video.className = img.className;
            video.id = img.id;
            video.style.cssText = img.style.cssText;
            // 复制宽度/高度
            if (img.width) video.width = img.width;
            if (img.height) video.height = img.height;
            // 复制 data-* 属性
            for (const attr of img.attributes) {
                if (attr.name.startsWith('data-')) {
                    video.setAttribute(attr.name, attr.value);
                }
            }
            // 替换节点
            img.parentNode.replaceChild(video, img);
            // 尝试播放（某些浏览器需要用户交互，但静音自动播放多数支持）
            video.play().catch(e => console.debug('Autoplay blocked:', e));
            return;
        }
    }

    // 扫描整个 DOM，处理所有头像相关元素
    function scanAndProcess() {
        // 选择器覆盖常见的头像/角色图像/背景
        const selectors = [
            'img.avatar',           // 常见类名
            'img.character_image',
            'img[class*="avatar"]',
            'img[class*="character"]',
            '.chara-thumb img',     // 角色选择栏
            '.mes_avatar img',      // 消息头像
            '.persona-avatar img',
            '[data-avatar] img',
            '.avatar_image img',
            '.sprite-image',        // 不确定，但涵盖
            'img[src*="characters"]' // 任何包含 characters 路径的图片
        ];
        const elements = document.querySelectorAll(selectors.join(','));
        elements.forEach(el => {
            if (el.tagName === 'IMG') processAvatarElement(el);
            // 如果选择器选中的不是 img，再找内部的 img
            if (el.querySelectorAll) {
                el.querySelectorAll('img').forEach(img => processAvatarElement(img));
            }
        });
    }

    // 监听动态添加的新元素
    let observer;
    function startObserver() {
        if (observer) observer.disconnect();
        observer = new MutationObserver(mutations => {
            let needScan = false;
            for (const mut of mutations) {
                if (mut.addedNodes.length) {
                    needScan = true;
                    break;
                }
                // 属性变化也可能是头像 src 更新
                if (mut.type === 'attributes' && mut.attributeName === 'src') {
                    const target = mut.target;
                    if (target.tagName === 'IMG') {
                        // 重新处理该 img（因为 src 变了，可能变成新的缩略图）
                        target._avatarProcessed = false;
                        processAvatarElement(target);
                    }
                }
            }
            if (needScan) scanAndProcess();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }

    // 当 SillyTavern 界面完全加载后启动
    function init() {
        scanAndProcess();
        startObserver();
        // 监听角色切换事件（SillyTavern 的自定义事件）
        window.addEventListener('sillytavern:character-selected', () => {
            // 延迟一点让 DOM 更新
            setTimeout(scanAndProcess, 200);
        });
        // 也可以监听消息发送等事件
        window.addEventListener('sillytavern:message-sent', () => setTimeout(scanAndProcess, 100));
    }

    // 等待 DOM 和 SillyTavern 上下文就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();