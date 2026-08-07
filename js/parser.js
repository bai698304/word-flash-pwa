/**
 * Markdown 词库解析器
 * 兼容两种格式：
 *   旧格式：## word / - 解析：xxx / - 句子：xxx
 *   新格式：### N. word / - **划线/标注释义**：意为**xxx** / - **文中片段**："xxx"
 * 输出 [{id, word, definition, sentence}] 数组
 */

/**
 * 解析 Markdown 词库文本
 * @param {string} markdown - Markdown 格式的词库内容
 * @returns {Array<{id: string, word: string, definition: string, sentence: string}>}
 */
export function parseMarkdown(markdown) {
  const lines = markdown.split('\n');
  const words = [];
  let currentWord = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过一级标题和空行
    if (trimmed.startsWith('# ') || trimmed === '') {
      continue;
    }

    // 匹配词条标题：旧格式 ## word，新格式 ### N. word（去掉编号和中文注释）
    let headingMatch = trimmed.match(/^## (.+)/);
    if (!headingMatch) {
      headingMatch = trimmed.match(/^### \d+\.\s*([^(（]+)/);
    }
    if (headingMatch) {
      if (currentWord && currentWord.word) {
        words.push(currentWord);
      }
      currentWord = {
        id: generateId(headingMatch[1].trim()),
        word: headingMatch[1].trim(),
        definition: '',
        sentence: ''
      };
      continue;
    }

    // 匹配释义：旧格式 - 解析：xxx
    let defMatch = trimmed.match(/^- 解析[：:]\s*(.+)/);
    if (defMatch && currentWord && !currentWord.definition) {
      currentWord.definition = defMatch[1].trim();
      continue;
    }

    // 匹配释义：新格式 - **划线/标注释义**：......意为**xxx**...
    defMatch = trimmed.match(/^- \*\*划线.标注释义\*\*[：:]?\s*(.+)/);
    if (defMatch && currentWord && !currentWord.definition) {
      let def = defMatch[1].trim();
      const meaningMatch = def.match(/意为\*{0,2}(.+?)\*{0,2}[。.]?$/);
      if (meaningMatch) {
        def = meaningMatch[1].trim();
      }
      currentWord.definition = def;
      continue;
    }

    // 匹配例句：旧格式 - 句子：xxx
    let sentMatch = trimmed.match(/^- 句子[：:]\s*(.+)/);
    if (sentMatch && currentWord && !currentWord.sentence) {
      currentWord.sentence = sentMatch[1].trim();
      continue;
    }

    // 匹配例句：新格式 - **文中片段**："xxx"
    sentMatch = trimmed.match(/^- \*\*文中片段\*\*[：:]?\s*(.+)/);
    if (sentMatch && currentWord && !currentWord.sentence) {
      currentWord.sentence = sentMatch[1].trim().replace(/^["\u201C\u201D]|["\u201C\u201D]$/g, '');
      continue;
    }
  }

  // 保存最后一个词条
  if (currentWord && currentWord.word) {
    words.push(currentWord);
  }

  // 过滤无释义的条目（如 ## Turn 1、## 第一部分 等章节标题）
  return words.filter(function (w) { return w.definition; });
}

/**
 * 根据单词生成唯一 ID
 * @param {string} word
 * @returns {string}
 */
function generateId(word) {
  // 对单词做简单哈希 + 时间戳，保证唯一性
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    const char = word.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转为32位整数
  }
  return `${Math.abs(hash).toString(36)}_${word.replace(/\s+/g, '_')}`;
}
