---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 2214ff8ea460a4d6db6d084730ef43b7_a0f6e8e990d611f18e22525400f8a581
    ReservedCode1: nd4G7yTexApixNqb0BGE8WQtrPAOQY33f8rvORAmv0Ku1KHOrMUCrsKPmo01vBDFdTFqC8pDCw6DKuVlUZ5z3yrL4OJhp+b4IgyNkHfcSUYtBQQ0RQEDFlYz5mb2O0Tb0CqiIi9jvB1rscy/v1K8NyJqCMJJehlNwLfCtE+TwODiXxhrKOu+f8z8ldY=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 2214ff8ea460a4d6db6d084730ef43b7_a0f6e8e990d611f18e22525400f8a581
    ReservedCode2: nd4G7yTexApixNqb0BGE8WQtrPAOQY33f8rvORAmv0Ku1KHOrMUCrsKPmo01vBDFdTFqC8pDCw6DKuVlUZ5z3yrL4OJhp+b4IgyNkHfcSUYtBQQ0RQEDFlYz5mb2O0Tb0CqiIi9jvB1rscy/v1K8NyJqCMJJehlNwLfCtE+TwODiXxhrKOu+f8z8ldY=
---

# 考研词汇闪卡 (Word Flash PWA)

最小可用的 PWA 刷词工具，手机端像扇贝单词一样刷考研词汇。

## 核心功能

- **SM-2 间隔重复**：根据记忆曲线自动调度复习时间
- **每日上限 120 词**：防止词量过大，优先推送已学词汇
- **专项练习**：不认识次数 TOP20，重点攻克易错词
- **学习统计**：总词数 / 已掌握 / 今日待复习 / 不认识的 TOP10
- **PWA 离线缓存**：添加到手机主屏幕，无网络也能刷
- **备份导出**：统计 Tab 内可导出/恢复全部学习进度

## 技术栈

纯原生 JS + CSS + HTML，零外部依赖，浏览器直接运行。

| 模块 | 文件 | 功能 |
|------|------|------|
| 入口 | `index.html` | SPA 单页 |
| 算法 | `js/sm2.js` | SM-2 间隔重复，EF 动态调整 |
| 存储 | `js/store.js` | IndexedDB 原生 API |
| 卡片 | `js/ui.js` | 3D 翻转 + 四档评分 |
| 解析 | `js/parser.js` | Markdown → 词条数组 |
| 统计 | `js/stats.js` | 学习数据面板 |
| PWA | `sw.js` / `manifest.json` | 离线缓存、推送 |

## 本地运行

```bash
python -m http.server 3333
# 或
npx serve . -l 3333
```

浏览器打开 `http://localhost:3333`

## 部署到 GitHub Pages

1. Fork 或 push 本仓库到你的 GitHub
2. Settings → Pages → Source 选 main 分支 → Save
3. 等待部署完成后，手机浏览器打开 `https://你的用户名.github.io/word-flash-pwa`
4. Chrome 弹出"添加到主屏幕"→ 点击后变成独立 App

## 导入词库

### 格式

在 `words/` 目录下创建 `.md` 文件，格式如下：

```markdown
# 词汇表

## disable
- 解析：使残废、使失去能力/使失效
- 句子：There will be television chat shows hosted by robots...

## thrive
- 解析：繁荣、茁壮成长
- 句子：But one insidious form continues to thrive: alphabetism
```

- `## 单词` 为词条标题
- `- 解析：xxx` 为释义（必填）
- `- 句子：xxx` 为例句（可选）

### 导入

在 `js/app.js` 的 `loadAndImportSample()` 函数中添加新文件路径即可。

## 每日工作流

1. 电脑端：把真题不会的词写成 Markdown → push 到 GitHub
2. 手机端：打开 GitHub Pages 链接 → 自动加载新词 → 开始刷词
3. 统计 Tab → 导出备份 → 微信发给电脑存档
*（内容由AI生成，仅供参考）*
