/**
 * Markdown 词库解析器
 * 解析 sample.md 格式，输出 [{id, word, definition, sentence}] 数组
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

    // 跳过标题行和空行
    if (trimmed.startsWith('# ') || trimmed === '') {
      continue;
    }

    // 匹配 ## word
    const headingMatch = trimmed.match(/^## (.+)/);
    if (headingMatch) {
      // 保存上一个词条
      if (currentWord && currentWord.word) {
        words.push(currentWord);
      }
      // 新建词条
      currentWord = {
        id: generateId(headingMatch[1].trim()),
        word: headingMatch[1].trim(),
        definition: '',
        sentence: ''
      };
      continue;
    }

    // 匹配 - 解析：xxx
    const defMatch = trimmed.match(/^- 解析[：:]\s*(.+)/);
    if (defMatch && currentWord) {
      currentWord.definition = defMatch[1].trim();
      continue;
    }

    // 匹配 - 句子：xxx
    const sentMatch = trimmed.match(/^- 句子[：:]\s*(.+)/);
    if (sentMatch && currentWord) {
      currentWord.sentence = sentMatch[1].trim();
      continue;
    }
  }

  // 保存最后一个词条
  if (currentWord && currentWord.word) {
    words.push(currentWord);
  }

  return words;
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
