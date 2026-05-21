# 笔耕书院 · 班级笔记共享平台

一个简洁优雅的班级笔记共享平台，支持按专业、班级分类管理笔记，支持富文本编辑和图片上传。

## 技术栈

- **后端**: Node.js + Express
- **数据库**: sql.js (纯 JavaScript 实现的 SQLite，无需 node-gyp 编译)
- **前端**: 原生 JavaScript + Bootstrap 5
- **文件上传**: multer

## 功能特性

- 按专业、班级层级组织笔记
- 富文本编辑器，支持文字格式化
- 图片上传功能，支持本地图片插入
- 笔记搜索功能
- 笔记创建、编辑、删除
- 响应式设计，支持移动端

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

服务默认运行在 `http://localhost:3000`

## 项目结构

```
project/
├── data/              # 数据库文件目录
│   └── notes.db       # SQLite 数据库
├── public/            # 前端静态文件
│   ├── index.html     # 主页面
│   ├── app.js         # 前端逻辑
│   └── style.css      # 样式文件
├── uploads/           # 上传文件目录
├── server.js          # 后端服务
├── package.json       # 项目配置
└── README.md          # 项目说明
```

## API 接口

### 专业管理

- `GET /api/majors` - 获取专业列表

### 班级管理

- `GET /api/majors/:majorId/classes` - 获取专业下的班级列表

### 笔记管理

- `GET /api/classes/:classId/notes` - 获取班级笔记列表
- `GET /api/notes/:id` - 获取笔记详情
- `POST /api/notes` - 创建笔记
- `PUT /api/notes/:id` - 更新笔记
- `DELETE /api/notes/:id` - 删除笔记

### 搜索功能

- `GET /api/search?q=关键词` - 搜索笔记

### 文件上传

- `POST /api/upload` - 上传图片

## 默认数据

首次启动会自动创建示例数据：

- 6个专业：计算机科学与技术、软件工程、网络工程、数据科学与大数据技术、人工智能、信息安全
- 各专业下的示例班级
- 多篇示例笔记

## 开发说明

- 数据库自动持久化到 `data/notes.db`
- 上传的图片按专业/班级/日期组织在 `uploads/` 目录
- 修改代码后 `npm run dev` 会自动重启服务

## License

MIT
