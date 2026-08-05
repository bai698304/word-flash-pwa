/**
 * 主入口模块
 * 初始化应用、路由控制、Tab 切换
 */

import { parseMarkdown } from './parser.js';
import { importWords, getTodayReviewWords, getTopFailWords, exportAllData, importAllData, getSyncVersion, setSyncVersion, updateWord } from './store.js';
import { renderCard, showComplete, setReviewing, getIsReviewing } from './ui.js';
import { sm2 } from './sm2.js';
import { getStats, renderStats } from './stats.js';

/** 示例词库路径 */
const SAMPLE_PATH = '/words/sample.md';

/**
 * 应用初始化
 */
async function init() {
  // 注册 Service Worker
  registerSW();

  // 加载示例词库并导入
  await loadAndImportSample();

  // 自动同步进度（合并后的 progress.json）
  await autoSyncProgress();

  // 自动扫描新词库文件
  await autoSyncWords();

  // 设置 Tab 导航
  setupTabs();

  // 默认加载复习 Tab
  await loadReviewTab();

  // 导出/导入按钮事件
  setupDataActions();
}

/**
 * 自动检测 words/progress.json 是否需要导入
 * 如果文件版本比本地记录的更新，自动合并进度
 */
async function autoSyncProgress() {
  try {
    const resp = await fetch('words/progress.json', { cache: 'no-cache' });
    if (!resp.ok) {
      console.log('[AutoSync] progress.json 不存在，跳过');
      return;
    }
    const json = await resp.json();
    const fileVersion = json.version;
    const localVersion = getSyncVersion();

    if (fileVersion === localVersion) {
      console.log('[AutoSync] 版本一致，无需同步');
      return;
    }

    if (!json.words || !Array.isArray(json.words) || json.words.length === 0) {
      console.warn('[AutoSync] progress.json 无有效词条');
      return;
    }

    console.log(`[AutoSync] 检测到新版本 (本地: ${localVersion}, 文件: ${fileVersion})，开始导入...`);
    const result = await importAllData(json.words);
    setSyncVersion(fileVersion);
    console.log(`[AutoSync] 完成，恢复 ${result.restored} 个词条`);
  } catch (err) {
    console.warn('[AutoSync] 同步失败', err);
    // 静默失败，不影响正常使用
  }
}

/**
 * 自动扫描 words/manifest.json，导入新词库文件
 * 用 localStorage 记录已导入的文件名，每次只处理新增的
 */
async function autoSyncWords() {
  try {
    const resp = await fetch('words/manifest.json', { cache: 'no-cache' });
    if (!resp.ok) {
      console.log('[AutoSync] manifest.json 不存在，跳过');
      return;
    }
    const manifest = await resp.json();
    const allFiles = manifest.files || [];
    if (allFiles.length === 0) return;

    // 读取已导入记录
    const imported = JSON.parse(localStorage.getItem('wordFlashImportedFiles') || '[]');
    const newFiles = allFiles.filter(f => !imported.includes(f));

    if (newFiles.length === 0) {
      console.log('[AutoSync] 没有新词库文件');
      return;
    }

    console.log(`[AutoSync] 发现 ${newFiles.length} 个新词库: ${newFiles.join(', ')}`);

    for (const file of newFiles) {
      try {
        const mdResp = await fetch(`words/${encodeURIComponent(file)}`, { cache: 'no-cache' });
        if (!mdResp.ok) continue;
        const mdText = await mdResp.text();
        const words = parseMarkdown(mdText);
        if (words.length > 0) {
          const result = await importWords(words);
          console.log(`[AutoSync] ${file}: 新增 ${result.added} 词, 跳过 ${result.skipped} 词`);
        }
      } catch (e) {
        console.warn(`[AutoSync] ${file} 处理失败`, e);
      }
    }

    // 更新已导入记录
    const newList = [...new Set([...imported, ...newFiles])];
    localStorage.setItem('wordFlashImportedFiles', JSON.stringify(newList));
  } catch (err) {
    console.warn('[AutoSync] 词库同步失败', err);
  }
}

/**
 * 注册 Service Worker（自动适配根路径和子目录路径）
 */
function registerSW() {
  if ('serviceWorker' in navigator) {
    // 兼容 GitHub Pages 子目录（如 /repo-name/）和根路径
    const swPath = new URL('./sw.js', import.meta.url).pathname;
    navigator.serviceWorker.register(swPath)
      .then(reg => console.log('[App] SW 注册成功', reg.scope))
      .catch(err => console.warn('[App] SW 注册失败（本地 HTTP 环境正常）', err));
  }
}

/**
 * 加载 sample.md 并导入 IndexedDB
 */
async function loadAndImportSample() {
  try {
    const response = await fetch(SAMPLE_PATH);
    if (!response.ok) {
      console.warn('[App] 示例词库加载失败:', response.status);
      return;
    }

    const markdown = await response.text();
    const words = parseMarkdown(markdown);

    if (words.length === 0) {
      console.warn('[App] 词库解析结果为空');
      return;
    }

    const result = await importWords(words);
    console.log(`[App] 词库导入完成: 新增 ${result.added} 个，跳过 ${result.skipped} 个`);
  } catch (err) {
    console.error('[App] 词库加载异常:', err);
  }
}

/**
 * 设置底部 Tab 导航
 */
function setupTabs() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabs = {
    review: document.getElementById('tab-review'),
    practice: document.getElementById('tab-practice'),
    stats: document.getElementById('tab-stats')
  };

  navBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const tabName = btn.dataset.tab;

      // 更新导航按钮状态
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 切换 Tab 内容
      Object.values(tabs).forEach(t => t.classList.remove('active'));
      tabs[tabName].classList.add('active');

      // 加载对应内容
      if (tabName === 'review') {
        await loadReviewTab();
      } else if (tabName === 'practice') {
        await loadPracticeTab();
      } else if (tabName === 'stats') {
        await loadStatsTab();
      }
    });
  });
}

/**
 * 加载复习 Tab（每日上限 120 词，含扇贝式 relearning 机制）
 */
let reviewQueue = [];    // [{ word, mode: 'normal'|'relearning', confirmCount: 0|1 }]
let sessionStats = { forgot: 0, hard: 0, good: 0, easy: 0, total: 0 };

async function loadReviewTab() {
  if (getIsReviewing()) return;

  const words = await getTodayReviewWords(120);

  document.getElementById('card-area').classList.remove('hidden');
  document.getElementById('review-complete').classList.add('hidden');

  if (words.length === 0) {
    document.getElementById('card-area').classList.add('hidden');
    document.getElementById('review-complete').classList.remove('hidden');
    document.getElementById('review-summary').textContent = '所有单词都在按计划复习中，继续保持！';
    return;
  }

  const dueAll = await getTodayReviewWords(9999);
  const remaining = dueAll.length - words.length;
  const hint = remaining > 0 ? `（今日到期共 ${dueAll.length} 词，本组 ${words.length} 词，剩余 ${remaining} 词待后续推送）` : '';
  document.getElementById('review-summary').textContent = hint;

  reviewQueue = words.map(w => ({ word: w, mode: 'normal', confirmCount: 0 }));
  sessionStats = { forgot: 0, hard: 0, good: 0, easy: 0, total: 0 };
  setReviewing(true);

  processNextCard();
}

/** 展示下一张卡片 */
function processNextCard() {
  if (reviewQueue.length === 0) {
    setReviewing(false);
    showComplete(sessionStats);
    return;
  }

  const entry = reviewQueue.shift();
  renderCard(entry.word, entry.mode, entry.confirmCount, async (quality) => {
    await handleResult(entry, quality);
    processNextCard();
  });
}

/** 处理用户评分结果 */
async function handleResult(entry, quality) {
  sessionStats.total++;
  const word = entry.word;

  if (entry.mode === 'normal') {
    if (quality === 0) {
      // 不认识 → 进 relearning 队列，7 张后重出
      sessionStats.forgot++;
      insertRelearning(word, 0);
      // 不更新 IndexedDB，等 graduated 时再写入
    } else {
      // 认识/困难/简单 → SM-2 正常调度
      const labels = { 2: 'hard', 4: 'good', 5: 'easy' };
      sessionStats[labels[quality]]++;

      const result = sm2(word, quality);
      await updateWord(word.id, {
        ef: result.ef,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReview: result.nextReview,
        failCount: word.failCount || 0
      });
    }
  } else {
    // Relearning 模式
    if (quality === 0) {
      // 巩固中又点不认识 → 回到 relearning 起点，7 张后重出
      sessionStats.forgot++;
      insertRelearning(word, 0);
    } else {
      // 点认识
      if (entry.confirmCount === 0) {
        // 第一次确认 → 1 张后再次确认
        insertRelearning(word, 1);
      } else {
        // 第二次确认 → graduated，SM-2 正常调度
        sessionStats.good++;

        const result = sm2({ ...word, repetitions: 0 }, 4); // quality=4，interval 从 1 天开始
        await updateWord(word.id, {
          ef: result.ef,
          interval: result.interval,
          repetitions: result.repetitions,
          nextReview: result.nextReview,
          failCount: (word.failCount || 0) + 1,
          lastReviewed: new Date().toISOString()
        });
      }
    }
  }
}

/**
 * 将单词插入 relearning 队列
 * @param {Object} word
 * @param {number} confirmCount - 0=初次确认, 1=二次确认
 */
function insertRelearning(word, confirmCount) {
  const offset = confirmCount === 0 ? 6 : 0; // 0→7张后（跳过6张），1→紧接着（1张后）
  const pos = Math.min(offset, reviewQueue.length);
  reviewQueue.splice(pos, 0, { word, mode: 'relearning', confirmCount });
}

/**
 * 加载专项练习 Tab
 */
async function loadPracticeTab() {
  const listEl = document.getElementById('practice-list');
  const emptyEl = document.getElementById('practice-empty');

  const topFail = await getTopFailWords(20);

  if (topFail.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.innerHTML = topFail.map(w => `
    <div class="practice-word-item" data-id="${w.id}">
      <span class="word">${escapeHtmlStatic(w.word)}</span>
      <span class="fail-badge">不认识 ${w.failCount} 次</span>
    </div>
  `).join('');

  // 点击进入刷词模式（复用复习卡片）
  listEl.querySelectorAll('.practice-word-item').forEach(item => {
    item.addEventListener('click', () => {
      const wordId = item.dataset.id;
      const word = topFail.find(w => w.id === wordId);
      if (word) {
        // 切换到复习 Tab 并以该单词开始
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-tab="review"]').classList.add('active');
        Object.values(document.querySelectorAll('.tab-content')).forEach(t => t.classList.remove('active'));
        document.getElementById('tab-review').classList.add('active');

        startReview([word], (stats) => {
          loadReviewTab(); // 完成后回到正常复习流
        });
      }
    });
  });
}

/**
 * 加载统计 Tab
 */
async function loadStatsTab() {
  const stats = await getStats();
  renderStats(stats);
}

/**
 * 静态 HTML 转义
 */
function escapeHtmlStatic(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 导出/导入按钮事件
 */
function setupDataActions() {
  // 导出备份
  document.getElementById('btn-export').addEventListener('click', async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      a.href = url;
      a.download = `word-flash-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert(`已导出 ${data.length} 个词条的学习进度`);
    } catch (err) {
      alert('导出失败: ' + err.message);
    }
  });

  // 恢复备份
  const fileInput = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => {
    fileInput.click();
  });
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('备份文件格式错误');
      const result = await importAllData(data);
      alert(`已恢复 ${result.restored} 个词条，刷新页面生效`);
      location.reload();
    } catch (err) {
      alert('恢复失败: ' + err.message);
    }
  });
}

// 启动应用
init().catch(err => console.error('[App] 初始化失败:', err));
