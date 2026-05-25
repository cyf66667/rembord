# Rembord

Rembord 是一个蓝橙色清爽风格的背单词应用，围绕“每日任务 + 艾宾浩斯复习 + 搜索查词 + 萌宠花园”构建。应用支持本地词库、自定义词库、学习记录、听写默写、词根/词缀分析、花房收藏和学习数据统计。

## 功能概览

- **账号系统**：手机号 + 密码注册登录，支持头像上传和账户信息查看。
- **多词库学习**：内置四级、六级、雅思、考研词库，也支持导入自定义 JSON/CSV/TXT 词库。
- **词库管理**：左侧栏可切换词库、添加词库、修改词库设置、删除词库进度。
- **每日任务**：根据用户选择的开始日期和目标完成日自动计算每日任务数量。
- **学习进度记忆**：登录后恢复当前词库、任务、游标、已学单词、生词本、花园和复习计划。
- **艾宾浩斯复习**：不熟悉单词按 1/2/4/7/15/30 天复习；认识/熟悉单词 5 天后复现。
- **复习标记**：复习词卡片会标注首次学习日期。
- **继续背一组**：背词列表底部可继续追加下一组单词。
- **默写与听写**：支持看英文写中文、看中文写英文、听音写词。
- **搜索查词**：右上角支持中文查英文，也支持英文联网查词。
- **我的家族**：查看词根/词缀含义、同根词、同义词和反义词。
- **生词本**：不熟悉的单词按日期归档。
- **学习日历**：查看哪天背了单词以及当天单词列表。
- **学习数据**：左侧栏查看最近 7/14/30 天柱状图，包括学习词数、复习词数、任务完成情况和学习时长。
- **能量花园**：背单词获取水滴，自选花种播种、浇水，成熟后收获到花房。
- **花房收藏**：左侧栏查看已收获花朵。
- **专注模式**：悬浮球进入无干扰背词模式。
- **UI 风格**：以鲜亮蓝橙为主色调，加入简约线条小狗和萌宠元素。

## 运行方式

推荐使用后端服务运行，避免浏览器对 `file://` 下 JSON、API 和联网请求的限制。

```bash
python server.py
```

然后访问：

```text
http://localhost:5000
```

如果只想查看纯前端页面，也可以启动静态服务：

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080/
```

不建议直接双击 `index.html`。项目已避免 ES Module 的 CORS 报错，但部分浏览器仍可能限制本地 JSON 读取和联网请求。

## 后端配置

后端使用 Flask + MySQL。默认数据库配置在 `server.py`：

```python
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '123456',
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}
```

首次启动会自动创建：

- `rembord` 数据库
- `users` 用户表
- `study_records` 学习记录表

如本机 MySQL 密码不同，请先修改 `server.py` 中的 `DB_CONFIG`。

## 自定义词库格式

在词库下拉框选择 `＋ 添加自定义词库` 即可导入。

JSON 示例：

```json
[
  {
    "word": "robot",
    "phonetic": "ˈroʊbɑːt",
    "translation": "n. 机器人"
  }
]
```

CSV/TXT 示例：

```text
robot,n. 机器人
tradition,n. 传统
```

兼容字段：

- 英文：`word`、`en`、`english`
- 中文：`translation`、`cn`、`chinese`、`meaning`
- 音标：`phonetic`

## 词根/词缀与联网查询

`我的家族` 会展示：

- 词根/词缀分析和含义
- 同根词
- 同义词
- 反义词

数据来源：

- 本地 ECDICT 词根数据：`data/word_family.json`
- 联网英文词典：Free Dictionary API
- 联网相关词：Datamuse API

查不到时显示 `暂无`，避免编造结果。

## 项目结构

```text
.
├── index.html              # 主页面
├── main.js                 # 前端主逻辑
├── style.css               # 全局样式
├── server.py               # Flask 后端
├── data/
│   ├── cet4.json
│   ├── cet6.json
│   ├── ielts.json
│   ├── kaoyan.json
│   └── word_family.json
├── dictionary/             # ECDICT 原始词典数据
├── modules/                # 早期模块化学习组件
└── uploads/avatars/        # 用户头像上传目录
```

## 技术栈

- HTML5
- CSS3
- 原生 JavaScript
- Web Speech API
- localStorage
- Flask
- MySQL
- PyMySQL

## 注意事项

- 完整登录、头像、数据库学习记录功能需要通过 `python server.py` 启动后端。
- 语音播放依赖浏览器 Web Speech API，推荐 Chrome 或 Edge。
- 英文联网查询需要网络可用。
- 自定义词库保存在浏览器本地存储中，清理浏览器数据会丢失。

## License

MIT
