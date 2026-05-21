/**
 * 笔耕书院 · 后端服务（sql.js 版，无需 node-gyp）
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ============================================================
   数据库初始化
   ============================================================ */
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

[DATA_DIR, UPLOAD_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const DB_PATH = path.join(DATA_DIR, 'notes.db');

let db; // 全局数据库实例

// 初始化 sql.js
initSqlJs().then(SQL => {
    // 如果数据库文件已存在，从文件加载；否则创建新的
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // 建表
    db.run(`
        CREATE TABLE IF NOT EXISTS majors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            icon TEXT NOT NULL DEFAULT 'bi-book',
            watermark TEXT NOT NULL DEFAULT '学',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            major_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (major_id) REFERENCES majors(id) ON DELETE CASCADE
        );
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            major_id INTEGER NOT NULL,
            class_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (major_id) REFERENCES majors(id) ON DELETE CASCADE,
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        );
    `);
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_notes_class ON notes(class_id);
    `);
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_classes_major ON classes(major_id);
    `);

    // 种子数据（仅首次）
    const majorCount = db.exec('SELECT COUNT(*) AS c FROM majors');
    const count = majorCount[0] && majorCount[0].values[0][0];
    if (count === 0) {
        seedData();
    }

    // 每次变更后持久化到文件
    global.saveDB = () => {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    };

    // 监听进程退出，保存数据库
    process.on('exit', () => global.saveDB());
    process.on('SIGINT', () => {
        global.saveDB();
        process.exit(0);
    });

    console.log('[数据库] sql.js 初始化完成');
    startServer();
}).catch(err => {
    console.error('[数据库] 初始化失败:', err);
    process.exit(1);
});

/* ============================================================
   种子数据
   ============================================================ */
function seedData() {
    const majors = [
        ['计算机科学与技术', 'bi-cpu', '算', 1],
        ['软件工程', 'bi-code-slash', '软', 2],
        ['网络工程', 'bi-diagram-3', '网', 3],
        ['数据科学与大数据技术', 'bi-bar-chart-line', '数', 4],
        ['人工智能', 'bi-robot', '智', 5],
        ['信息安全', 'bi-shield-lock', '密', 6]
    ];
    const classDefs = [
        ['计算机科学与技术', ['计科2301班', '计科2302班', '计科2303班', '计科2304班']],
        ['软件工程', ['软工2301班', '软工2302班', '软工2303班']],
        ['网络工程', ['网工2301班', '网工2302班', '网工2303班']],
        ['数据科学与大数据技术', ['数据2301班', '数据2302班']],
        ['人工智能', ['智科2301班', '智科2302班']],
        ['信息安全', ['信安2301班', '信安2302班']]
    ];

    const majorIds = {};
    majors.forEach(m => {
        db.run(
            'INSERT INTO majors (name, icon, watermark, sort_order) VALUES (?, ?, ?, ?)',
            m
        );
        const res = db.exec('SELECT last_insert_rowid() AS id');
        majorIds[m[0]] = res[0].values[0][0];
    });

    const classIds = {};
    classDefs.forEach(([majorName, classes]) => {
        const mid = majorIds[majorName];
        classes.forEach((cls, i) => {
            db.run(
                'INSERT INTO classes (major_id, name, sort_order) VALUES (?, ?, ?)',
                [mid, cls, i + 1]
            );
            const res = db.exec('SELECT last_insert_rowid() AS id');
            classIds[cls] = res[0].values[0][0];
        });
    });

    const notes = [
        {
            cls: '计科2301班',
            title: '数据结构第三章：树与二叉树核心知识点',
            content: '<p><strong>一、树的基本概念</strong></p><p>树是 n 个结点的有限集合。在任意一棵非空树中，有且仅有一个特定的称为根的结点；当 n>1 时，其余结点可分为 m 个互不相交的有限集。</p><p><strong>二、二叉树的性质</strong></p><p>1. 第 i 层上最多有 2<sup>i-1</sup> 个结点<br>2. 深度为 k 的二叉树最多有 2<sup>k</sup>-1 个结点<br>3. 叶子结点数 = 度为2的结点数 + 1</p><p><strong>三、遍历方式</strong></p><p>先序遍历：根 → 左 → 右<br>中序遍历：左 → 根 → 右<br>后序遍历：左 → 右 → 根</p>'
        },
        {
            cls: '计科2301班',
            title: '操作系统期末复习：进程管理重点总结',
            content: '<p><strong>进程的三种基本状态</strong></p><p><span style="color:#9B2C2C;font-weight:bold;">就绪态</span>：已获得除处理器外的所有资源<br><span style="color:#C4A35A;font-weight:bold;">运行态</span>：正在处理器上运行<br><span style="color:#B91C1C;font-weight:bold;">阻塞态</span>：等待某一事件发生</p><p><strong>进程调度算法</strong></p><p>1. 先来先服务（FCFS）<br>2. 短作业优先（SJF）<br>3. 时间片轮转（RR）<br>4. 优先级调度</p>'
        },
        {
            cls: '计科2301班',
            title: '计算机网络：TCP三次握手详解',
            content: '<p>TCP建立连接需要经过三次握手：</p><p><strong>第一次握手</strong>：客户端发送 SYN=1, seq=x<br><strong>第二次握手</strong>：服务器回复 SYN=1, ACK=1, seq=y, ack=x+1<br><strong>第三次握手</strong>：客户端发送 ACK=1, seq=x+1, ack=y+1</p><p>三次握手的主要目的是确保双方都有发送和接收数据的能力，并同步初始序列号。</p>'
        },
        {
            cls: '计科2301班',
            title: '离散数学：命题逻辑等值演算公式汇总',
            content: '<p><strong>基本等值式</strong></p><p>1. 双重否定律：¬¬A ⇔ A<br>2. 交换律：A∧B ⇔ B∧A<br>3. 结合律：(A∧B)∧C ⇔ A∧(B∧C)<br>4. 分配律：A∧(B∨C) ⇔ (A∧B)∨(A∧C)<br>5. 德摩根律：¬(A∧B) ⇔ ¬A∨¬B<br>6. 吸收律：A∧(A∨B) ⇔ A</p>'
        },
        {
            cls: '软工2301班',
            title: '软件需求工程：需求获取方法与技巧',
            content: '<p><strong>需求获取的常用方法</strong></p><p>1. <strong>访谈</strong>：与利益相关者一对一深入交流<br>2. <strong>问卷调查</strong>：大规模收集结构化数据<br>3. <strong>观察</strong>：在用户工作现场观察实际操作流程<br>4. <strong>文档分析</strong>：研究现有系统的文档和流程</p><p><em>多种方法结合使用效果更佳。</em></p>'
        },
        {
            cls: '软工2301班',
            title: '设计模式笔记：单例模式与工厂模式详解',
            content: '<p><strong>单例模式</strong></p><p>确保一个类只有一个实例，并提供全局访问点。</p><p><strong>工厂方法模式</strong></p><p>定义一个创建对象的接口，让子类决定实例化哪个类。</p>'
        },
        {
            cls: '智科2301班',
            title: '机器学习：线性回归从零推导',
            content: '<p><strong>损失函数</strong></p><p>J(θ) = 1/2m Σ(hθ(x<sup>(i)</sup>) - y<sup>(i)</sup>)<sup>2</sup></p><p><strong>梯度下降更新规则</strong></p><p>θ<sub>j</sub> := θ<sub>j</sub> - α ∂J/∂θ<sub>j</sub></p><p>其中 α 为学习率，需要合理选择：过大会发散，过小收敛慢。</p>'
        }
    ];

    notes.forEach(n => {
        const cid = classIds[n.cls];
        if (!cid) return;
        const midRes = db.exec('SELECT major_id FROM classes WHERE id = ?', [cid]);
        const mid = midRes[0] && midRes[0].values[0][0];
        db.run(
            'INSERT INTO notes (title, content, major_id, class_id) VALUES (?, ?, ?, ?)',
            [n.title, n.content, mid, cid]
        );
    });

    console.log('[种子数据] 已初始化专业、班级和示例笔记');
}

/* ============================================================
   HTML 安全清洗
   ============================================================ */
function sanitizeHTML(html) {
    const allowedTags = new Set([
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'blockquote', 'pre', 'code',
        'a', 'img', 'picture', 'source',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'span', 'div', 'sub', 'sup', 'hr', 'mark'
    ]);
    const allowedAttrs = {
        'a': ['href', 'title', 'target'],
        'img': ['src', 'alt', 'width', 'height', 'loading'],
        'span': ['style'],
        'p': ['style'],
        'div': ['style'],
        'td': ['style', 'colspan', 'rowspan'],
        'th': ['style', 'colspan', 'rowspan'],
        'blockquote': ['cite'],
        '*': ['class']
    };
    const safeStyleProps = [
        'color', 'font-weight', 'font-style', 'text-decoration', 'text-align',
        'font-size', 'background-color', 'margin', 'padding', 'border',
        'border-color', 'border-radius', 'display', 'width', 'height'
    ];

    return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?\s*\/?>/g, (match, tag, attrs) => {
        const lowerTag = tag.toLowerCase();
        if (!allowedTags.has(lowerTag)) return '';

        const isClosing = match.startsWith('</');
        const isSelfClosing = match.endsWith('/>') || ['br', 'hr', 'img', 'source'].includes(lowerTag);
        if (isClosing) return `</${lowerTag}>`;
        if (!attrs) return isSelfClosing ? `<${lowerTag}>` : `<${lowerTag}>`;

        const tagAttrs = allowedAttrs[lowerTag] || [];
        const globalAttrs = allowedAttrs['*'] || [];
        const allAllowed = [...tagAttrs, ...globalAttrs];

        let result = '';
        const attrRegex = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
        let m;
        while ((m = attrRegex.exec(attrs)) !== null) {
            const attrName = m[1].toLowerCase();
            let attrValue = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);

            if (attrName === 'style') {
                const safeStyle = attrValue.split(';')
                    .map(s => s.trim())
                    .filter(s => {
                        const prop = s.split(':')[0]?.trim().toLowerCase();
                        return prop && safeStyleProps.some(sp => prop === sp);
                    })
                    .join('; ');
                if (safeStyle) result += ` style="${safeStyle}"`;
            } else if (allAllowed.includes(attrName)) {
                if (attrName === 'href' || attrName === 'src') {
                    const val = attrValue.trim().toLowerCase();
                    if (val.startsWith('javascript:') || val.startsWith('data:text/html') || val.startsWith('vbscript:')) continue;
                }
                result += ` ${attrName}="${attrValue}"`;
            }
        }

        return isSelfClosing ? `<${lowerTag}${result}>` : `<${lowerTag}${result}>`;
    }).replace(/<!--[\s\S]*?-->/g, '');
}

/* ============================================================
   图片上传配置
   ============================================================ */
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const majorName = (req.body.majorName || '未分类').replace(/[\/\\:*?"<>|]/g, '_');
        const className = (req.body.className || '未分类').replace(/[\/\\:*?"<>|]/g, '_');
        const date = new Date().toISOString().split('T')[0];
        const dir = path.join(UPLOAD_DIR, majorName, className, date);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const name = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext;
        cb(null, name);
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMES.includes(file.mimetype) && ALLOWED_EXTS.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('仅允许上传图片文件（jpg/png/gif/webp）'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE }
});

/* ============================================================
   中间件
   ============================================================ */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

/* ============================================================
   API 路由
   ============================================================ */

// ------ 专业 ------
app.get('/api/majors', (req, res) => {
    try {
        const result = db.exec(`
            SELECT m.*,
                COUNT(DISTINCT c.id) AS class_count,
                COUNT(DISTINCT n.id) AS note_count
            FROM majors m
            LEFT JOIN classes c ON c.major_id = m.id
            LEFT JOIN notes n ON n.major_id = m.id
            GROUP BY m.id
            ORDER BY m.sort_order, m.id
        `);
        const majors = result[0] ? result[0].values.map(row => ({
            id: row[0],
            name: row[1],
            icon: row[2],
            watermark: row[3],
            sort_order: row[4],
            created_at: row[5],
            class_count: row[6],
            note_count: row[7]
        })) : [];
        res.json({ success: true, data: majors });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '获取专业列表失败' });
    }
});

// ------ 班级 ------
app.get('/api/majors/:majorId/classes', (req, res) => {
    try {
        const result = db.exec(`
            SELECT c.*,
                COUNT(n.id) AS note_count
            FROM classes c
            LEFT JOIN notes n ON n.class_id = c.id
            WHERE c.major_id = ?
            GROUP BY c.id
            ORDER BY c.sort_order, c.id
        `, [req.params.majorId]);
        const classes = result[0] ? result[0].values.map(row => ({
            id: row[0],
            major_id: row[1],
            name: row[2],
            sort_order: row[3],
            created_at: row[4],
            note_count: row[5]
        })) : [];
        res.json({ success: true, data: classes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '获取班级列表失败' });
    }
});

// ------ 笔记 ------
app.get('/api/classes/:classId/notes', (req, res) => {
    try {
        const result = db.exec(`
            SELECT id, title, content,
                CASE WHEN content LIKE '%<img%' THEN 1 ELSE 0 END AS has_image,
                created_at, updated_at
            FROM notes
            WHERE class_id = ?
            ORDER BY updated_at DESC
        `, [req.params.classId]);
        const notes = result[0] ? result[0].values.map(row => {
            const plainText = row[2]
                .replace(/<[^>]+>/g, '')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&nbsp;/g, ' ')
                .substring(0, 100);
            const imgMatch = row[2].match(/<img[^>]+src=["']([^"']+)["']/);
            return {
                id: row[0],
                title: row[1],
                preview: plainText,
                hasImage: !!row[3],
                firstImage: imgMatch ? imgMatch[1] : null,
                created_at: row[4],
                updated_at: row[5]
            };
        }) : [];
        res.json({ success: true, data: notes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '获取笔记列表失败' });
    }
});

app.get('/api/notes/:id', (req, res) => {
    try {
        const result = db.exec(`
            SELECT n.*, m.name AS major_name, c.name AS class_name
            FROM notes n
            JOIN majors m ON m.id = n.major_id
            JOIN classes c ON c.id = n.class_id
            WHERE n.id = ?
        `, [req.params.id]);
        if (!result[0] || !result[0].values.length) {
            return res.status(404).json({ success: false, message: '笔记不存在' });
        }
        const row = result[0].values[0];
        const note = {
            id: row[0],
            title: row[1],
            content: row[2],
            major_id: row[3],
            class_id: row[4],
            created_at: row[5],
            updated_at: row[6],
            major_name: row[7],
            class_name: row[8]
        };
        res.json({ success: true, data: note });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '获取笔记失败' });
    }
});

app.post('/api/notes', (req, res) => {
    try {
        const { title, content, major_id, class_id } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ success: false, message: '请输入标题' });
        if (!content || !content.trim()) return res.status(400).json({ success: false, message: '请输入内容' });
        if (!major_id || !class_id) return res.status(400).json({ success: false, message: '缺少专业或班级参数' });

        const safeContent = sanitizeHTML(content);
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.run(
            'INSERT INTO notes (title, content, major_id, class_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [title.trim(), safeContent, major_id, class_id, now, now]
        );
        const idRes = db.exec('SELECT last_insert_rowid() AS id');
        const id = idRes[0].values[0][0];
        global.saveDB();
        res.json({ success: true, data: { id, title: title.trim(), content: safeContent, major_id, class_id, created_at: now, updated_at: now } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '创建笔记失败' });
    }
});

app.put('/api/notes/:id', (req, res) => {
    try {
        const { title, content } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ success: false, message: '请输入标题' });
        if (!content || !content.trim()) return res.status(400).json({ success: false, message: '请输入内容' });

        const existing = db.exec('SELECT * FROM notes WHERE id = ?', [req.params.id]);
        if (!existing[0] || !existing[0].values.length) {
            return res.status(404).json({ success: false, message: '笔记不存在' });
        }

        const safeContent = sanitizeHTML(content);
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.run(
            'UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?',
            [title.trim(), safeContent, now, req.params.id]
        );
        global.saveDB();
        const row = existing[0].values[0];
        res.json({ success: true, data: { id: row[0], title: title.trim(), content: safeContent, major_id: row[3], class_id: row[4], created_at: row[5], updated_at: now } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '更新笔记失败' });
    }
});

app.delete('/api/notes/:id', (req, res) => {
    try {
        const existing = db.exec('SELECT * FROM notes WHERE id = ?', [req.params.id]);
        if (!existing[0] || !existing[0].values.length) {
            return res.status(404).json({ success: false, message: '笔记不存在' });
        }

        const content = existing[0].values[0][2] || '';
        const imgRegex = /\/uploads\/[^"'\s>]+/g;
        const imgPaths = content.match(imgRegex) || [];

        db.run('DELETE FROM notes WHERE id = ?', [req.params.id]);
        global.saveDB();

        imgPaths.forEach(imgUrl => {
            try {
                const filePath = path.join(__dirname, imgUrl);
                if (fs.existsSync(filePath) && filePath.startsWith(UPLOAD_DIR)) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {}
        });

        res.json({ success: true, message: '已删除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '删除笔记失败' });
    }
});

// ------ 搜索笔记 ------
app.get('/api/search', (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.json({ success: true, data: [] });
        const like = `%${q}%`;
        const result = db.exec(`
            SELECT n.id, n.title,
                SUBSTR(n.content, 1, 200) AS preview,
                CASE WHEN n.content LIKE '%<img%' THEN 1 ELSE 0 END AS has_image,
                n.created_at, n.updated_at,
                c.name AS class_name, m.name AS major_name,
                c.id AS class_id, m.id AS major_id
            FROM notes n
            JOIN classes c ON c.id = n.class_id
            JOIN majors m ON m.id = n.major_id
            WHERE n.title LIKE ? OR n.content LIKE ?
            ORDER BY n.updated_at DESC
            LIMIT 50
        `, [like, like]);
        const notes = result[0] ? result[0].values.map(row => {
            const plainText = row[2].replace(/<[^>]+>/g, '').substring(0, 100);
            return {
                id: row[0],
                title: row[1],
                preview: plainText,
                hasImage: !!row[3],
                created_at: row[4],
                updated_at: row[5],
                class_name: row[6],
                major_name: row[7],
                class_id: row[8],
                major_id: row[9]
            };
        }) : [];
        res.json({ success: true, data: notes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '搜索失败' });
    }
});

// ------ 图片上传 ------
app.post('/api/upload', (req, res) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: '图片大小不能超过5MB' });
            }
            return res.status(400).json({ success: false, message: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: '请选择图片' });
        }
        const relativePath = path.relative(UPLOAD_DIR, req.file.path).replace(/\\/g, '/');
        const url = '/uploads/' + relativePath;
        res.json({ success: true, data: { url } });
    });
});

/* ============================================================
   SPA 兜底
   ============================================================ */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ============================================================
   启动服务
   ============================================================ */
function startServer() {
    app.listen(PORT, () => {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log('');
        console.log('  ═══════════════════════════════════════');
        console.log('  笔耕书院 · 班级笔记共享平台');
        console.log(`  服务已启动 → http://localhost:${PORT}`);
        console.log(`  当前内存占用 → ${Math.round(used)}MB`);
        console.log('  ═══════════════════════════════════════');
        console.log('');
    });
}
