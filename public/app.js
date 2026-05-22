/**
 * 笔耕书院 · 前端交互
 * 所有数据通过 RESTful API 获取，不再使用硬编码模拟数据
 */

/* ============================================================
   应用状态
   ============================================================ */
let currentMajor = null;   // { id, name }
let currentClass = null;   // { id, name }
let currentNote = null;    // { id, title, content, ... }
let editorMode = 'add';    // 'add' | 'edit'
let deleteModal = null;

/* ============================================================
   主应用对象
   ============================================================ */
const App = {

    /* ====== 路由 ====== */
    updateHash(hash) {
        if (window.location.hash !== '#' + hash) {
            window.location.hash = hash;
        }
    },

    goHome(pushState) {
        currentMajor = null;
        currentClass = null;
        currentNote = null;
        this.renderMajors();
        this.switchView('Home');
        if (pushState !== false) this.updateHash('/');
    },

    handleHashChange() {
        const hash = window.location.hash.slice(1) || '/';
        const parts = hash.split('/').filter(Boolean);

        if (parts.length === 0 || hash === '/') {
            currentMajor = null;
            currentClass = null;
            currentNote = null;
            this.renderMajors();
            this.switchView('Home');
        } else if (parts[0] === 'major' && parts[1]) {
            const name = decodeURIComponent(parts.slice(2).join('/'));
            this.openMajor(parseInt(parts[1]), name, false);
        } else if (parts[0] === 'class' && parts[1]) {
            const name = decodeURIComponent(parts.slice(2).join('/'));
            this.openClass(parseInt(parts[1]), name, false);
        } else if (parts[0] === 'note' && parts[1]) {
            this.openNote(parseInt(parts[1]), false);
        } else if (parts[0] === 'editor' && parts[1] === 'add') {
            this.showEditor('add', null, false);
        } else if (parts[0] === 'editor' && parts[1] === 'edit' && parts[2]) {
            this.showEditor('edit', parseInt(parts[2]), false);
        }
    },

    switchView(name) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const el = document.getElementById('view' + name);
        if (el) el.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    /* ====== 加载状态 ====== */
    loadingEl: null,

    showLoading() {
        if (!this.loadingEl) {
            this.loadingEl = document.createElement('div');
            this.loadingEl.className = 'loading-overlay';
            this.loadingEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
            document.body.appendChild(this.loadingEl);
        }
        this.loadingEl.classList.add('active');
    },

    hideLoading() {
        if (this.loadingEl) this.loadingEl.classList.remove('active');
    },

    /* ====== API 请求封装 ====== */
    async api(url, options = {}) {
        this.showLoading();
        try {
            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...options
            });
            const data = await res.json();
            this.hideLoading();
            if (!data.success) {
                this.toast(data.message || '操作失败', 'danger');
                return null;
            }
            return data.data;
        } catch (err) {
            this.hideLoading();
            this.toast('网络连接异常，请稍后重试', 'danger');
            return null;
        }
    },

    /* ====== 首页：专业列表 ====== */
    async renderMajors() {
        const majors = await this.api('/api/majors');
        if (!majors) return;

        const box = document.getElementById('majorList');
        box.innerHTML = majors.map(m => `
            <div class="col-sm-6 col-lg-4 col-xl-3">
                <div class="category-card" onclick="App.openMajor(${m.id}, '${App.escapeAttr(m.name)}')">
                    <span class="watermark-char">${m.watermark}</span>
                    <div class="seal-icon"><i class="bi ${m.icon}"></i></div>
                    <div class="category-name">${App.escapeHtml(m.name)}</div>
                    <div class="category-meta">
                        <span class="meta-badge"><i class="bi bi-people"></i> ${m.class_count}班</span>
                        <span class="meta-badge"><i class="bi bi-file-text"></i> ${m.note_count}篇</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /* ====== 打开专业 → 班级列表 ====== */
    async openMajor(id, name, updateHash) {
        currentMajor = { id, name };
        currentClass = null;
        currentNote = null;

        if (updateHash !== false) this.updateHash(`/major/${id}/${encodeURIComponent(name)}`);

        const classes = await this.api(`/api/majors/${id}/classes`);
        if (!classes) return;

        document.getElementById('classBreadcrumb').innerHTML =
            `<a onclick="App.goHome()">首页</a><span class="sep">/</span><span class="current">${App.escapeHtml(name)}</span>`;
        document.getElementById('className').textContent = name;
        document.getElementById('classSubtitle').textContent = `共 ${classes.length} 个班级`;

        const box = document.getElementById('classList');
        if (!classes.length) {
            box.innerHTML = `<div class="col-12"><div class="empty-state">
                <div class="empty-state-icon"><i class="bi bi-inbox"></i></div>
                <div class="empty-state-text">尚无班级</div>
                <div class="empty-state-sub">该专业下尚未添加班级</div>
            </div></div>`;
        } else {
            const tianGan = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
            box.innerHTML = classes.map((c, i) => `
                <div class="col-sm-6 col-lg-4">
                    <div class="category-card" onclick="App.openClass(${c.id}, '${App.escapeAttr(c.name)}')">
                        <span class="watermark-char">${tianGan[i % 10]}</span>
                        <div class="seal-icon"><i class="bi bi-people-fill"></i></div>
                        <div class="category-name">${App.escapeHtml(c.name)}</div>
                        <div class="category-meta">
                            <span class="meta-badge"><i class="bi bi-file-text"></i> ${c.note_count}篇</span>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        this.switchView('Classes');
    },

    /* ====== 打开班级 → 笔记列表 ====== */
    async openClass(id, name, updateHash) {
        if (!currentMajor) {
            const majors = await this.api('/api/majors');
            if (!majors) return;
            const classes = await this.api(`/api/majors/${id}/classes`);
            if (classes && classes.length > 0) {
                currentMajor = { id: classes[0].major_id, name: '' };
                const major = majors.find(m => m.id === currentMajor.id);
                if (major) currentMajor.name = major.name;
            } else {
                this.toast('无法确定班级所属专业', 'danger');
                return;
            }
        }

        currentClass = { id, name };

        if (updateHash !== false) this.updateHash(`/class/${id}/${encodeURIComponent(name)}`);

        const notes = await this.api(`/api/classes/${id}/notes`);
        if (!notes) return;

        document.getElementById('noteBreadcrumb').innerHTML =
            `<a onclick="App.goHome()">首页</a><span class="sep">/</span>` +
            `<a onclick="App.openMajor(${currentMajor.id},'${App.escapeAttr(currentMajor.name)}')">${App.escapeHtml(currentMajor.name)}</a>` +
            `<span class="sep">/</span><span class="current">${App.escapeHtml(name)}</span>`;
        document.getElementById('noteClassName').textContent = name;
        document.getElementById('noteSubtitle').textContent = `共 ${notes.length} 篇笔记`;

        this.renderNotes(notes);
        this.switchView('Notes');
    },

    /* ====== 渲染笔记列表 ====== */
    renderNotes(notes) {
        const box = document.getElementById('noteList');
        if (!notes || !notes.length) {
            box.innerHTML = `<div class="empty-state">
                <div class="empty-state-icon"><i class="bi bi-journal-x"></i></div>
                <div class="empty-state-text">尚无笔记</div>
                <div class="empty-state-sub">点击上方「落笔成文」添加第一篇笔记</div>
            </div>`;
            return;
        }
        box.innerHTML = notes.map(n => {
            const edited = n.created_at !== n.updated_at;
            return `
            <div class="note-card d-flex align-items-start gap-3">
                <div class="flex-grow-1">
                    <a class="note-title-link" onclick="App.openNote(${n.id})">${App.escapeHtml(n.title)}</a>
                    <div class="note-time mt-1">
                        <i class="bi bi-clock me-1"></i>${n.updated_at}${edited ? '（已修）' : ''}
                    </div>
                    <div class="note-preview">${App.escapeHtml(n.preview || '')}</div>
                </div>
                ${n.firstImage ? `<img src="${n.firstImage}" class="note-thumb d-none d-sm-block" alt="">` : (n.hasImage ? '<div class="note-thumb-icon d-none d-sm-flex"><i class="bi bi-image"></i></div>' : '')}
                <div class="note-actions flex-shrink-0">
                    <button class="btn-icon" title="编辑" onclick="App.showEditor('edit',${n.id})"><i class="bi bi-pencil"></i></button>
                    <button class="btn-icon btn-icon-danger" title="删除" onclick="App.confirmDelete(${n.id})"><i class="bi bi-trash3"></i></button>
                </div>
            </div>`;
        }).join('');
    },

    /* ====== 打开笔记详情 ====== */
    async openNote(id, updateHash) {
        const note = await this.api(`/api/notes/${id}`);
        if (!note) return;
        currentNote = note;

        if (updateHash !== false) this.updateHash(`/note/${id}`);

        if (!currentMajor) currentMajor = { id: note.major_id, name: note.major_name };
        if (!currentClass) currentClass = { id: note.class_id, name: note.class_name };

        document.getElementById('detailBreadcrumb').innerHTML =
            `<a onclick="App.goHome()">首页</a><span class="sep">/</span>` +
            `<a onclick="App.openMajor(${currentMajor.id},'${App.escapeAttr(currentMajor.name)}')">${App.escapeHtml(currentMajor.name)}</a>` +
            `<span class="sep">/</span>` +
            `<a onclick="App.openClass(${currentClass.id},'${App.escapeAttr(currentClass.name)}')">${App.escapeHtml(currentClass.name)}</a>` +
            `<span class="sep">/</span><span class="current">${App.escapeHtml(note.title)}</span>`;

        document.getElementById('detailTitle').textContent = note.title;
        document.getElementById('detailMeta').innerHTML =
            `<i class="bi bi-clock me-1"></i>创建于 ${note.created_at}` +
            (note.created_at !== note.updated_at ? `&nbsp;&nbsp;<i class="bi bi-pencil-square me-1"></i>修于 ${note.updated_at}` : '');
        document.getElementById('detailContent').innerHTML = note.content;
        this.switchView('Detail');
    },

    /* ====== 显示编辑器 ====== */
    showEditor(mode, noteId, updateHash) {
        editorMode = mode;

        if (mode === 'edit') {
            const targetId = noteId || (currentNote && currentNote.id);
            if (targetId) {
                if (updateHash !== false) this.updateHash(`/editor/edit/${targetId}`);
                if (!currentNote || currentNote.id !== targetId) {
                    this.api(`/api/notes/${targetId}`).then(note => {
                        if (note) {
                            currentNote = note;
                            this.fillEditor(note);
                        }
                    });
                    return;
                }
                this.fillEditor(currentNote);
            }
        } else {
            if (updateHash !== false) this.updateHash('/editor/add');
            currentNote = null;
            document.getElementById('editorTitle').textContent = '落笔成文';
            document.getElementById('editorSubtitle').textContent = '书写笔记，可粘贴文字与图片';
            document.getElementById('submitText').textContent = '发布笔记';
            document.getElementById('inputTitle').value = '';
            document.getElementById('editorArea').innerHTML = '';
        }

        this.setEditorBreadcrumb(mode);
        this.switchView('Editor');
        setTimeout(() => document.getElementById('inputTitle').focus(), 120);
    },

    /* 填充编辑器（编辑模式） */
    fillEditor(note) {
        document.getElementById('editorTitle').textContent = '修润旧文';
        document.getElementById('editorSubtitle').textContent = '修改后点击发布即可更新';
        document.getElementById('submitText').textContent = '更新笔记';
        document.getElementById('inputTitle').value = note.title;
        document.getElementById('editorArea').innerHTML = note.content;
        this.setEditorBreadcrumb('edit');
        this.switchView('Editor');
        setTimeout(() => document.getElementById('inputTitle').focus(), 120);
    },

    /* 编辑器面包屑 */
    setEditorBreadcrumb(mode) {
        if (!currentMajor || !currentClass) return;
        document.getElementById('editorBreadcrumb').innerHTML =
            `<a onclick="App.goHome()">首页</a><span class="sep">/</span>` +
            `<a onclick="App.openMajor(${currentMajor.id},'${App.escapeAttr(currentMajor.name)}')">${App.escapeHtml(currentMajor.name)}</a>` +
            `<span class="sep">/</span>` +
            `<a onclick="App.openClass(${currentClass.id},'${App.escapeAttr(currentClass.name)}')">${App.escapeHtml(currentClass.name)}</a>` +
            `<span class="sep">/</span><span class="current">${mode === 'edit' ? '修润旧文' : '落笔成文'}</span>`;
    },

    /* ====== 提交笔记 ====== */
    async submitNote() {
        const title = document.getElementById('inputTitle').value.trim();
        const content = document.getElementById('editorArea').innerHTML.trim();

        if (!title) {
            this.toast('请拟定笔记标题', 'danger');
            document.getElementById('inputTitle').focus();
            return;
        }
        if (!content || content === '<br>') {
            this.toast('请书写笔记内容', 'danger');
            document.getElementById('editorArea').focus();
            return;
        }

        let result;
        if (editorMode === 'add') {
            result = await this.api('/api/notes', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    content,
                    major_id: currentMajor.id,
                    class_id: currentClass.id
                })
            });
            if (result) this.toast('笔记已发布', 'success');
        } else {
            result = await this.api(`/api/notes/${currentNote.id}`, {
                method: 'PUT',
                body: JSON.stringify({ title, content })
            });
            if (result) this.toast('笔记已更新', 'success');
        }

        if (result) this.openClass(currentClass.id, currentClass.name);
    },

    /* ====== 取消编辑 ====== */
    cancelEditor() {
        if (currentClass) this.openClass(currentClass.id, currentClass.name);
        else this.goHome();
    },

    /* ====== 删除确认 ====== */
    confirmDelete(noteId) {
        if (!deleteModal) {
            deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
        }
        document.getElementById('confirmDeleteBtn').onclick = async () => {
            const tid = noteId || (currentNote ? currentNote.id : null);
            const result = await this.api(`/api/notes/${tid}`, { method: 'DELETE' });
            deleteModal.hide();
            if (result) {
                this.toast('笔记已删除', 'danger');
                currentNote = null;
                if (currentClass) this.openClass(currentClass.id, currentClass.name);
            }
        };
        deleteModal.show();
    },

    /* ====== 富文本命令 ====== */
    execCmd(cmd) {
        document.execCommand(cmd, false, null);
        document.getElementById('editorArea').focus();
    },

    execCmdVal(cmd, val) {
        document.execCommand(cmd, false, val);
        document.getElementById('editorArea').focus();
    },

    /* ====== 图片上传 ====== */
    async uploadImage(file) {
        const formData = new FormData();
        formData.append('majorName', currentMajor ? currentMajor.name : '未分类');
        formData.append('className', currentClass ? currentClass.name : '未分类');
        formData.append('image', file);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) return data.data.url;
            this.toast(data.message || '图片上传失败', 'danger');
            return null;
        } catch (err) {
            this.toast('图片上传失败', 'danger');
            return null;
        }
    },

    /* 点击「插入图片」按钮 → 打开文件选择器 */
    pickImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/gif,image/webp';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                this.toast('图片大小不能超过5MB', 'danger');
                return;
            }
            const url = await this.uploadImage(file);
            if (url) {
                document.execCommand('insertImage', false, url);
                this.toast('图片已插入', 'success');
            }
        };
        input.click();
    },

    /* ====== 粘贴图片支持 ====== */
    initPasteImage() {
        const area = document.getElementById('editorArea');
        area.addEventListener('paste', async (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const file = items[i].getAsFile();
                    if (file.size > 5 * 1024 * 1024) {
                        this.toast('图片大小不能超过5MB', 'danger');
                        return;
                    }
                    // 先插入一个loading占位
                    const tempId = 'img-loading-' + Date.now();
                    document.execCommand('insertHTML', false,
                        `<span id="${tempId}" style="display:inline-block;padding:8px 16px;background:#FEF2E8;color:#9B2C2C;border-radius:4px;font-size:0.85rem;">图片上传中...</span>`
                    );
                    // 上传
                    const url = await this.uploadImage(file);
                    // 替换占位
                    const placeholder = document.getElementById(tempId);
                    if (placeholder) {
                        if (url) {
                            placeholder.outerHTML = `<img src="${url}" alt="粘贴的图片">`;
                            this.toast('图片已粘贴', 'success');
                        } else {
                            placeholder.remove();
                        }
                    }
                    return;
                }
            }
        });
    },

    /* ====== 搜索 ====== */
    searchTimer: null,

    initSearch() {
        const input = document.getElementById('searchInput');
        input.addEventListener('input', (e) => {
            clearTimeout(this.searchTimer);
            const q = e.target.value.trim();
            if (!q) return;
            this.searchTimer = setTimeout(() => this.performSearch(q), 400);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(this.searchTimer);
                const q = input.value.trim();
                if (q) this.performSearch(q);
            }
        });
    },

    async performSearch(q) {
        const results = await this.api(`/api/search?q=${encodeURIComponent(q)}`);
        if (results === null) return;

        document.getElementById('searchTitle').textContent = `搜索「${q}」`;
        document.getElementById('searchSubtitle').textContent = `找到 ${results.length} 条结果`;

        const box = document.getElementById('searchResults');
        if (!results.length) {
            box.innerHTML = `<div class="empty-state">
                <div class="empty-state-icon"><i class="bi bi-search"></i></div>
                <div class="empty-state-text">未找到相关笔记</div>
                <div class="empty-state-sub">换个关键词试试</div>
            </div>`;
        } else {
            box.innerHTML = results.map(n => `
            <div class="note-card d-flex align-items-start gap-3">
                <div class="flex-grow-1">
                    <a class="note-title-link" onclick="App.openNote(${n.id})">${App.escapeHtml(n.title)}</a>
                    <div class="note-time mt-1">
                        <span class="meta-badge me-2"><i class="bi bi-book"></i> ${App.escapeHtml(n.major_name)}</span>
                        <span class="meta-badge me-2"><i class="bi bi-people"></i> ${App.escapeHtml(n.class_name)}</span>
                        <i class="bi bi-clock me-1"></i>${n.updated_at}
                    </div>
                    <div class="note-preview">${App.escapeHtml(n.preview || '')}</div>
                </div>
                <div class="note-actions flex-shrink-0">
                    <button class="btn-icon" title="查看" onclick="App.openNote(${n.id})"><i class="bi bi-eye"></i></button>
                </div>
            </div>`).join('');
        }
        this.switchView('Search');
    },

    /* ====== Toast 通知 ====== */
    toast(msg, type) {
        const box = document.getElementById('toastContainer');
        const icon = type === 'danger' ? 'bi-exclamation-circle' : 'bi-check-circle';
        const cls = type === 'danger' ? 'toast-danger' : '';
        const el = document.createElement('div');
        el.className = `custom-toast ${cls}`;
        el.innerHTML = `<i class="bi ${icon}"></i>${msg}`;
        box.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
    },

    /* ====== 工具 ====== */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    escapeAttr(str) {
        return String(str).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    formatNow() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    /* ====== 初始化 ====== */
    init() {
        this.initPasteImage();
        this.initSearch();
        window.addEventListener('hashchange', () => this.handleHashChange());
        this.handleHashChange();
    }
};

/* 启动 */
document.addEventListener('DOMContentLoaded', () => App.init());
