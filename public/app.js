/**
 * 笔耕书院 · 前端交互
 * 生产环境优化版 - 修复并发竞态、状态管理、错误处理等问题
 */

/* ============================================================
   应用状态（闭包封装，防止意外修改）
   ============================================================ */
const State = (() => {
    let currentMajor = null;
    let currentClass = null;
    let currentNote = null;
    let editorMode = 'add';
    let pendingDeleteId = null;
    let isSubmitting = false;

    return {
        getMajor: () => currentMajor,
        setMajor: (v) => { currentMajor = v; },
        getClass: () => currentClass,
        setClass: (v) => { currentClass = v; },
        getNote: () => currentNote,
        setNote: (v) => { currentNote = v; },
        getEditorMode: () => editorMode,
        setEditorMode: (v) => { editorMode = v; },
        getPendingDeleteId: () => pendingDeleteId,
        setPendingDeleteId: (v) => { pendingDeleteId = v; },
        isSubmittingFlag: () => isSubmitting,
        setSubmitting: (v) => { isSubmitting = v; },
        clear: () => {
            currentMajor = null;
            currentClass = null;
            currentNote = null;
        }
    };
})();

let deleteModal = null;
let quillEditor = null;

/* ============================================================
   主应用对象
   ============================================================ */
const App = {

    /* ====== 请求管理 ====== */
    pendingRequests: new Map(),
    requestCounter: 0,

    cancelPendingRequest(key) {
        if (this.pendingRequests.has(key)) {
            this.pendingRequests.get(key).cancelled = true;
            this.pendingRequests.delete(key);
        }
    },

    createRequest(key) {
        this.cancelPendingRequest(key);
        const req = { cancelled: false, id: ++this.requestCounter };
        this.pendingRequests.set(key, req);
        return req;
    },

    isRequestValid(req) {
        return req && !req.cancelled;
    },

    /* ====== 加载状态（计数器模式） ====== */
    loadingEl: null,
    activeRequests: 0,

    showLoading() {
        this.activeRequests++;
        if (!this.loadingEl) {
            this.loadingEl = document.createElement('div');
            this.loadingEl.className = 'loading-overlay';
            this.loadingEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
            document.body.appendChild(this.loadingEl);
        }
        this.loadingEl.classList.add('active');
    },

    hideLoading() {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        if (this.activeRequests === 0 && this.loadingEl) {
            this.loadingEl.classList.remove('active');
        }
    },

    /* ====== 路由 ====== */
    updateHash(hash) {
        if (window.location.hash !== '#' + hash) {
            window.location.hash = hash;
        }
    },

    goHome(pushState) {
        State.clear();
        this.renderMajors();
        this.switchView('Home');
        if (pushState !== false) this.updateHash('/');
    },

    handleHashChange() {
        const hash = window.location.hash.slice(1) || '/';
        const parts = hash.split('/').filter(Boolean);

        if (parts.length === 0 || hash === '/') {
            State.clear();
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

    /* ====== API 请求封装 ====== */
    async api(url, options = {}) {
        this.showLoading();
        try {
            const { signal, ...fetchOptions } = options;
            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...(signal ? { signal } : {}),
                ...fetchOptions
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
            if (err.name === 'AbortError') return null;
            this.toast('网络连接异常，请稍后重试', 'danger');
            return null;
        }
    },

    /* ====== 首页：专业列表 ====== */
    async renderMajors() {
        const req = this.createRequest('majors');
        const majors = await this.api('/api/majors');
        if (!this.isRequestValid(req)) return;

        const box = document.getElementById('majorList');
        if (!box) return;
        box.innerHTML = majors.map(m => `
            <div class="col-sm-6 col-lg-4 col-xl-3">
                <div class="category-card" onclick="App.openMajor(${m.id}, ${App.escapeJs(m.name)})">
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
        State.setMajor({ id, name });
        State.setClass(null);
        State.setNote(null);

        if (updateHash !== false) this.updateHash(`/major/${id}/${encodeURIComponent(name)}`);

        const req = this.createRequest(`major_${id}`);
        const classes = await this.api(`/api/majors/${id}/classes`);
        if (!this.isRequestValid(req)) return;
        if (!classes) return;

        const breadcrumb = document.getElementById('classBreadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML =
                `<a onclick="App.goHome()">首页</a><span class="sep">/</span><span class="current">${App.escapeHtml(name)}</span>`;
        }
        const classNameEl = document.getElementById('className');
        if (classNameEl) classNameEl.textContent = name;
        const subtitleEl = document.getElementById('classSubtitle');
        if (subtitleEl) subtitleEl.textContent = `共 ${classes.length} 个班级`;

        const box = document.getElementById('classList');
        if (!box) return;
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
                    <div class="category-card" onclick="App.openClass(${c.id}, ${App.escapeJs(c.name)})">
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
        const major = State.getMajor();
        if (!major) {
            const req0 = this.createRequest('resolve_major');
            const majors = await this.api('/api/majors');
            if (!this.isRequestValid(req0)) return;
            if (!majors) return;

            const classes = await this.api(`/api/majors/${id}/classes`);
            if (!this.isRequestValid(req0)) return;
            if (classes && classes.length > 0) {
                const resolvedMajor = majors.find(m => m.id === classes[0].major_id);
                if (resolvedMajor) {
                    State.setMajor({ id: resolvedMajor.id, name: resolvedMajor.name });
                } else {
                    this.toast('无法确定班级所属专业', 'danger');
                    return;
                }
            } else {
                this.toast('无法确定班级所属专业', 'danger');
                return;
            }
        }

        State.setClass({ id, name });

        if (updateHash !== false) this.updateHash(`/class/${id}/${encodeURIComponent(name)}`);

        const req = this.createRequest(`class_${id}`);
        const notes = await this.api(`/api/classes/${id}/notes`);
        if (!this.isRequestValid(req)) return;
        if (!notes) return;

        const currentMajor = State.getMajor();
        const breadcrumb = document.getElementById('noteBreadcrumb');
        if (breadcrumb && currentMajor) {
            breadcrumb.innerHTML =
                `<a onclick="App.goHome()">首页</a><span class="sep">/</span>` +
                `<a onclick="App.openMajor(${currentMajor.id},${App.escapeJs(currentMajor.name)})">${App.escapeHtml(currentMajor.name)}</a>` +
                `<span class="sep">/</span><span class="current">${App.escapeHtml(name)}</span>`;
        }
        const classNameEl = document.getElementById('noteClassName');
        if (classNameEl) classNameEl.textContent = name;
        const subtitleEl = document.getElementById('noteSubtitle');
        if (subtitleEl) subtitleEl.textContent = `共 ${notes.length} 篇笔记`;

        this.renderNotes(notes);
        this.switchView('Notes');
    },

    /* ====== 渲染笔记列表 ====== */
    renderNotes(notes) {
        const box = document.getElementById('noteList');
        if (!box) return;
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
                ${n.firstImage ? `<img src="${App.escapeAttr(n.firstImage)}" class="note-thumb d-none d-sm-block" alt="">` : (n.hasImage ? '<div class="note-thumb-icon d-none d-sm-flex"><i class="bi bi-image"></i></div>' : '')}
                <div class="note-actions flex-shrink-0">
                    <button class="btn-icon" title="编辑" onclick="App.showEditor('edit',${n.id})"><i class="bi bi-pencil"></i></button>
                    <button class="btn-icon btn-icon-danger" title="删除" onclick="App.confirmDelete(${n.id})"><i class="bi bi-trash3"></i></button>
                </div>
            </div>`;
        }).join('');
    },

    /* ====== 打开笔记详情 ====== */
    async openNote(id, updateHash) {
        const req = this.createRequest(`note_${id}`);
        const note = await this.api(`/api/notes/${id}`);
        if (!this.isRequestValid(req)) return;
        if (!note) return;

        State.setNote(note);

        if (updateHash !== false) this.updateHash(`/note/${id}`);

        if (!State.getMajor()) State.setMajor({ id: note.major_id, name: note.major_name });
        if (!State.getClass()) State.setClass({ id: note.class_id, name: note.class_name });

        const currentMajor = State.getMajor();
        const currentClass = State.getClass();
        const breadcrumb = document.getElementById('detailBreadcrumb');
        if (breadcrumb && currentMajor && currentClass) {
            breadcrumb.innerHTML =
                `<a onclick="App.goHome()">首页</a><span class="sep">/</span>` +
                `<a onclick="App.openMajor(${currentMajor.id},${App.escapeJs(currentMajor.name)})">${App.escapeHtml(currentMajor.name)}</a>` +
                `<span class="sep">/</span>` +
                `<a onclick="App.openClass(${currentClass.id},${App.escapeJs(currentClass.name)})">${App.escapeHtml(currentClass.name)}</a>` +
                `<span class="sep">/</span><span class="current">${App.escapeHtml(note.title)}</span>`;
        }

        const titleEl = document.getElementById('detailTitle');
        if (titleEl) titleEl.textContent = note.title;
        const metaEl = document.getElementById('detailMeta');
        if (metaEl) {
            metaEl.innerHTML =
                `<i class="bi bi-clock me-1"></i>创建于 ${note.created_at}` +
                (note.created_at !== note.updated_at ? `&nbsp;&nbsp;<i class="bi bi-pencil-square me-1"></i>修于 ${note.updated_at}` : '');
        }
        const contentEl = document.getElementById('detailContent');
        if (contentEl) contentEl.innerHTML = note.content;
        this.switchView('Detail');
    },

    /* ====== 显示编辑器 ====== */
    showEditor(mode, noteId, updateHash) {
        State.setEditorMode(mode);

        if (mode === 'edit') {
            const targetId = noteId || (State.getNote() && State.getNote().id);
            if (targetId) {
                if (updateHash !== false) this.updateHash(`/editor/edit/${targetId}`);
                const currentNote = State.getNote();
                if (!currentNote || currentNote.id !== targetId) {
                    this.api(`/api/notes/${targetId}`).then(note => {
                        if (note) {
                            State.setNote(note);
                            this.fillEditor(note);
                        }
                    });
                    return;
                }
                this.fillEditor(currentNote);
            }
        } else {
            if (updateHash !== false) this.updateHash('/editor/add');
            State.setNote(null);
            const titleEl = document.getElementById('editorTitle');
            if (titleEl) titleEl.textContent = '落笔成文';
            const subtitleEl = document.getElementById('editorSubtitle');
            if (subtitleEl) subtitleEl.textContent = '书写笔记，可粘贴文字与图片';
            const submitTextEl = document.getElementById('submitText');
            if (submitTextEl) submitTextEl.textContent = '发布笔记';
            const inputEl = document.getElementById('inputTitle');
            if (inputEl) inputEl.value = '';
            if (quillEditor) {
                quillEditor.setContents([]);
            }
        }

        this.setEditorBreadcrumb(mode);
        this.switchView('Editor');
        setTimeout(() => {
            const inputEl = document.getElementById('inputTitle');
            if (inputEl) inputEl.focus();
        }, 120);
    },

    /* 填充编辑器（编辑模式） */
    fillEditor(note) {
        const titleEl = document.getElementById('editorTitle');
        if (titleEl) titleEl.textContent = '修润旧文';
        const subtitleEl = document.getElementById('editorSubtitle');
        if (subtitleEl) subtitleEl.textContent = '修改后点击发布即可更新';
        const submitTextEl = document.getElementById('submitText');
        if (submitTextEl) submitTextEl.textContent = '更新笔记';
        const inputEl = document.getElementById('inputTitle');
        if (inputEl) inputEl.value = note.title;
        if (quillEditor) {
            quillEditor.clipboard.dangerouslyPasteHTML(note.content);
            this.updateEditorStats();
        }
        this.setEditorBreadcrumb('edit');
        this.switchView('Editor');
        setTimeout(() => {
            const inputEl = document.getElementById('inputTitle');
            if (inputEl) inputEl.focus();
        }, 120);
    },

    /* 编辑器面包屑 */
    setEditorBreadcrumb(mode) {
        const currentMajor = State.getMajor();
        const currentClass = State.getClass();
        if (!currentMajor || !currentClass) return;
        const breadcrumb = document.getElementById('editorBreadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML =
                `<a onclick="App.goHome()">首页</a><span class="sep">/</span>` +
                `<a onclick="App.openMajor(${currentMajor.id},${App.escapeJs(currentMajor.name)})">${App.escapeHtml(currentMajor.name)}</a>` +
                `<span class="sep">/</span>` +
                `<a onclick="App.openClass(${currentClass.id},${App.escapeJs(currentClass.name)})">${App.escapeHtml(currentClass.name)}</a>` +
                `<span class="sep">/</span><span class="current">${mode === 'edit' ? '修润旧文' : '落笔成文'}</span>`;
        }
    },

    /* ====== 提交笔记（防重复提交 + 上下文验证） ====== */
    async submitNote() {
        if (State.isSubmittingFlag()) {
            this.toast('正在提交，请勿重复点击', 'warning');
            return;
        }

        const currentMajor = State.getMajor();
        const currentClass = State.getClass();

        if (!currentMajor || !currentClass) {
            this.toast('无法确定笔记所属班级，请从班级页面进入编辑', 'danger');
            return;
        }

        State.setSubmitting(true);
        const submitBtn = document.getElementById('submitText');
        if (submitBtn) submitBtn.textContent = '提交中...';

        try {
            const titleInput = document.getElementById('inputTitle');
            const title = titleInput ? titleInput.value.trim() : '';
            let content = '';
            if (quillEditor) {
                content = quillEditor.root.innerHTML.trim();
                if (quillEditor.getText().trim() === '') {
                    content = '';
                }
            }

            if (!title) {
                this.toast('请拟定笔记标题', 'danger');
                if (titleInput) titleInput.focus();
                return;
            }
            if (!content || content === '<p><br></p>') {
                this.toast('请书写笔记内容', 'danger');
                return;
            }

            let result;
            const editorMode = State.getEditorMode();
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
                const currentNote = State.getNote();
                if (!currentNote || !currentNote.id) {
                    this.toast('无法确定要编辑的笔记', 'danger');
                    return;
                }
                result = await this.api(`/api/notes/${currentNote.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ title, content })
                });
                if (result) this.toast('笔记已更新', 'success');
            }

            if (result) this.openClass(currentClass.id, currentClass.name);
        } finally {
            State.setSubmitting(false);
            const submitBtn2 = document.getElementById('submitText');
            if (submitBtn2) {
                submitBtn2.textContent = State.getEditorMode() === 'add' ? '发布笔记' : '更新笔记';
            }
        }
    },

    /* ====== 取消编辑 ====== */
    cancelEditor() {
        const currentClass = State.getClass();
        if (currentClass) this.openClass(currentClass.id, currentClass.name);
        else this.goHome();
    },

    /* ====== 删除确认 ====== */
    confirmDelete(noteId) {
        const pendingId = noteId || (State.getNote() ? State.getNote().id : null);
        State.setPendingDeleteId(pendingId);

        if (!deleteModal) {
            deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
        }

        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        const self = this;
        newConfirmBtn.onclick = async () => {
            const tid = State.getPendingDeleteId();
            if (!tid) {
                self.toast('无法确定要删除的笔记', 'danger');
                deleteModal.hide();
                return;
            }

            const result = await self.api(`/api/notes/${tid}`, { method: 'DELETE' });
            deleteModal.hide();

            if (result) {
                self.toast('笔记已删除', 'success');
                State.setPendingDeleteId(null);
                State.setNote(null);

                const currentClass = State.getClass();
                if (currentClass) {
                    self.openClass(currentClass.id, currentClass.name);
                } else {
                    self.goHome();
                }
            }
        };

        deleteModal.show();
    },

    /* ====== 图片上传 ====== */
    async uploadImage(file) {
        const currentMajor = State.getMajor();
        const currentClass = State.getClass();
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

    /* ====== Quill 图片上传处理器 ====== */
    initQuillImageHandler() {
        if (!quillEditor) return;

        const toolbar = quillEditor.getModule('toolbar');
        toolbar.addHandler('image', () => {
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
                const range = quillEditor.getSelection(true);
                const insertPos = range.index;
                quillEditor.insertEmbed(insertPos, 'image', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', Quill.sources.USER);
                quillEditor.setSelection(insertPos + 1, Quill.sources.SILENT);

                const url = await this.uploadImage(file);
                if (url) {
                    quillEditor.deleteText(insertPos, 1, Quill.sources.USER);
                    quillEditor.insertEmbed(insertPos, 'image', url, Quill.sources.USER);
                    quillEditor.setSelection(insertPos + 1, Quill.sources.SILENT);
                    this.toast('图片已插入', 'success');
                    this.updateEditorStats();
                } else {
                    quillEditor.deleteText(insertPos, 1, Quill.sources.USER);
                }
            };
            input.click();
        });
    },

    /* ====== Quill 粘贴图片支持 ====== */
    initQuillPasteImage() {
        if (!quillEditor) return;

        quillEditor.root.addEventListener('paste', async (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const file = items[i].getAsFile();
                    if (file.size > 5 * 1024 * 1024) {
                        this.toast('图片大小不能超过5MB', 'danger');
                        return;
                    }
                    const range = quillEditor.getSelection(true);
                    const insertPos = range.index;
                    quillEditor.insertEmbed(insertPos, 'image', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', Quill.sources.USER);
                    quillEditor.setSelection(insertPos + 1, Quill.sources.SILENT);

                    const url = await this.uploadImage(file);
                    if (url) {
                        quillEditor.deleteText(insertPos, 1, Quill.sources.USER);
                        quillEditor.insertEmbed(insertPos, 'image', url, Quill.sources.USER);
                        quillEditor.setSelection(insertPos + 1, Quill.sources.SILENT);
                        this.toast('图片已粘贴', 'success');
                        this.updateEditorStats();
                    } else {
                        quillEditor.deleteText(insertPos, 1, Quill.sources.USER);
                    }
                    return;
                }
            }
        });
    },

    /* ====== 编辑器字数统计 ====== */
    updateEditorStats() {
        if (!quillEditor) return;
        const text = quillEditor.getText();
        const charCount = text.replace(/\n/g, '').length;
        const html = quillEditor.root.innerHTML;
        const imgCount = (html.match(/<img/g) || []).length;

        const charEl = document.getElementById('charCount');
        const imgEl = document.getElementById('imgCount');
        if (charEl) charEl.textContent = charCount + ' 字';
        if (imgEl) imgEl.textContent = imgCount + ' 图';
    },

    /* ====== 搜索（优化防抖） ====== */
    searchAbortController: null,

    initSearch() {
        const input = document.getElementById('searchInput');
        if (!input) return;
        input.addEventListener('input', (e) => {
            if (this.searchAbortController) {
                this.searchAbortController.abort();
            }
            clearTimeout(this.searchTimer);
            const q = e.target.value.trim();
            if (!q) return;
            this.searchTimer = setTimeout(() => this.performSearch(q), 400);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this.searchAbortController) {
                    this.searchAbortController.abort();
                }
                clearTimeout(this.searchTimer);
                const q = input.value.trim();
                if (q) this.performSearch(q);
            }
        });
    },

    async performSearch(q) {
        this.searchAbortController = new AbortController();

        const results = await this.api(`/api/search?q=${encodeURIComponent(q)}`, { signal: this.searchAbortController.signal });
        if (results === null) return;

        const titleEl = document.getElementById('searchTitle');
        if (titleEl) titleEl.textContent = `搜索「${q}」`;
        const subtitleEl = document.getElementById('searchSubtitle');
        if (subtitleEl) subtitleEl.textContent = `找到 ${results.length} 条结果`;

        const box = document.getElementById('searchResults');
        if (!box) return;
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
                    <button class="btn-icon" title="编辑" onclick="App.showEditor('edit',${n.id})"><i class="bi bi-pencil"></i></button>
                    <button class="btn-icon btn-icon-danger" title="删除" onclick="App.confirmDelete(${n.id})"><i class="bi bi-trash3"></i></button>
                </div>
            </div>`).join('');
        }
        this.switchView('Search');
    },

    /* ====== Toast 通知 ====== */
    toastTimers: [],

    toast(msg, type) {
        const box = document.getElementById('toastContainer');
        if (!box) return;
        const icon = type === 'danger' ? 'bi-exclamation-circle' : (type === 'warning' ? 'bi-exclamation-triangle' : 'bi-check-circle');
        const cls = type === 'danger' ? 'toast-danger' : (type === 'warning' ? 'toast-warning' : '');
        const el = document.createElement('div');
        el.className = `custom-toast ${cls}`;
        el.innerHTML = `<i class="bi ${icon}"></i>${msg}`;
        box.appendChild(el);
        const timer = setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
            const idx = this.toastTimers.indexOf(timer);
            if (idx > -1) this.toastTimers.splice(idx, 1);
        }, 3200);
        this.toastTimers.push(timer);
    },

    /* ====== 工具 ====== */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    escapeAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    escapeJs(str) {
        return this.escapeAttr(JSON.stringify(String(str || '')));
    },

    formatNow() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    /* ====== 初始化 ====== */
    init() {
        this.initQuill();
        this.initSearch();
        window.addEventListener('hashchange', () => this.handleHashChange());
        this.handleHashChange();
    },

    /* ====== Quill 初始化 ====== */
    initQuill() {
        const editorEl = document.getElementById('quill-editor');
        if (!editorEl) return;

        quillEditor = new Quill('#quill-editor', {
            modules: {
                toolbar: {
                    container: '#quill-toolbar',
                    handlers: {}
                },
                clipboard: {
                    matchVisual: false
                }
            },
            theme: 'snow',
            placeholder: '在此书写笔记内容...'
        });

        quillEditor.on('text-change', () => {
            this.updateEditorStats();
        });

        this.initQuillImageHandler();
        this.initQuillPasteImage();
    }
};

/* 启动 */
document.addEventListener('DOMContentLoaded', () => App.init());
