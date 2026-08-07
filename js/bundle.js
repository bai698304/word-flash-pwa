/**
 * Word Flash PWA - 合并核心脚本
 * 将所有模块合并为单文件，消除 ES Module 依赖链问题
 * 模块顺序：parser → sm2 → store → ui → stats → app
 */

/* ================================================================
 * 模块 1: parser.js — 已合并
 * ================================================================ */

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
function parseMarkdown(markdown) {
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


/* ================================================================
 * 模块 2: sm2.js — 已合并
 * ================================================================ */

/**
 * SM-2 间隔重复算法
 * 用于计算下次复习时间和更新记忆参数
 */

/**
 * 用户评分映射
 * 0 = 不认识（完全忘记）
 * 2 = 困难（回忆有困难）
 * 3 = 一般（想起但有犹豫）
 * 4 = 认识（正常想起）
 * 5 = 简单（非常轻松）
 */

/**
 * SM-2 核心算法
 * @param {Object} card - 当前卡片状态 {ef, interval, repetitions}
 * @param {number} quality - 用户评分 0-5
 * @returns {Object} 更新后的卡片参数 + 下次复习日期
 */
function sm2(card, quality) {
  // 深拷贝，避免修改原对象
  const result = {
    ef: card.ef || 2.5,
    interval: card.interval || 1,
    repetitions: card.repetitions || 0
  };

  // 评分 >= 3：答对，更新间隔
  if (quality >= 3) {
    if (result.repetitions === 0) {
      // 第一次答对：间隔设为 1 天
      result.interval = 1;
    } else if (result.repetitions === 1) {
      // 第二次答对：间隔设为 6 天
      result.interval = 6;
    } else {
      // 之后：间隔 × EF
      result.interval = Math.round(result.interval * result.ef);
    }

    result.repetitions += 1;

    // 更新 EF（易度因子）
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    result.ef = result.ef + delta;

    // EF 不低于 1.3
    if (result.ef < 1.3) {
      result.ef = 1.3;
    }
  } else {
    // 评分 < 3：答错，重置间隔
    result.interval = 1;
    result.repetitions = 0;
    // EF 不变
  }

  // 计算下次复习日期
  const now = new Date();
  const nextReview = new Date(now.getTime() + result.interval * 24 * 60 * 60 * 1000);

  return {
    ef: result.ef,
    interval: result.interval,
    repetitions: result.repetitions,
    nextReview: nextReview.toISOString()
  };
}

/**
 * 获取评分对应的标签
 * @param {number} quality
 * @returns {string}
 */
function qualityLabel(quality) {
  const labels = { 0: '不认识', 2: '困难', 3: '一般', 4: '认识', 5: '简单' };
  return labels[quality] || '未知';
}


/* ================================================================
 * 模块 3: store.js — 已合并
 * ================================================================ */

/**
 * IndexedDB 存储层
 * 数据库: WordFlashDB，表: words
 * 使用原生 IndexedDB API，零外部依赖
 */

const DB_NAME = 'WordFlashDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

/**
 * 打开数据库连接
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // 首次创建或版本升级时建表
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 如果表已存在则删除重建
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }

      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

      // 创建索引，方便查询
      store.createIndex('nextReview', 'nextReview', { unique: false });
      store.createIndex('failCount', 'failCount', { unique: false });
      store.createIndex('repetitions', 'repetitions', { unique: false });
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * 批量导入词条（跳过已存在的 id）
 * @param {Array} words - 词条数组 [{id, word, definition, sentence}]
 * @returns {Promise<{added: number, skipped: number}>}
 */
async function importWords(words) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  let added = 0;
  let skipped = 0;

  for (const word of words) {
    // 检查是否已存在
    const existing = await new Promise((resolve) => {
      const req = store.get(word.id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (existing) {
      skipped++;
      continue;
    }

    // 插入新词条，初始化 SM-2 字段
    await new Promise((resolve, reject) => {
      const req = store.add({
        id: word.id,
        word: word.word,
        definition: word.definition || '',
        sentence: word.sentence || '',
        ef: 2.5,              // 初始易度因子
        interval: 1,           // 初始间隔 1 天
        repetitions: 0,        // 连续正确次数
        nextReview: new Date().toISOString(), // 立即可复习
        failCount: 0,          // 不认识点击次数
        lastReviewed: null     // 上次复习时间
      });
      req.onsuccess = () => { added++; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve({ added, skipped });
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取今日待复习的单词（上限 120 个，优先推送已学单词）
 * @param {number} maxWords - 每日上限，默认 120
 * @returns {Promise<Array>}
 */
async function getTodayReviewWords(maxWords = 120) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('nextReview');

  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.upperBound(endOfToday);
    const request = index.openCursor(range);

    const results = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        // 排序：已学过的词优先（保持复习链条），再按到期时间升序
        results.sort((a, b) => {
          // repetitions > 0 的排前面
          if (a.repetitions > 0 && b.repetitions === 0) return -1;
          if (a.repetitions === 0 && b.repetitions > 0) return 1;
          // 同类型按到期时间升序（越早到期越优先）
          return new Date(a.nextReview) - new Date(b.nextReview);
        });
        // 截取每日上限
        resolve(results.slice(0, maxWords));
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 导出全部词库数据（含 SM-2 进度），用于备份
 * @returns {Promise<Array>}
 */
async function exportAllData() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 导入备份数据，恢复词库与进度
 * @param {Array} data - exportAllData() 导出的数据
 * @returns {Promise<{restored: number}>}
 */
async function importAllData(data) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  let restored = 0;
  for (const item of data) {
    await new Promise((resolve, reject) => {
      // 覆盖已有数据
      const req = store.put(item);
      req.onsuccess = () => { restored++; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve({ restored });
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 更新单词的 SM-2 数据
 * @param {string} id - 单词 id
 * @param {Object} updates - 要更新的字段
 */
async function updateWord(id, updates) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const word = getReq.result;
      if (!word) { resolve(null); return; }

      // 合并更新
      Object.assign(word, updates);
      word.lastReviewed = new Date().toISOString();

      const putReq = store.put(word);
      putReq.onsuccess = () => resolve(word);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * 按不认识次数降序获取单词
 * @param {number} limit - 返回数量上限
 * @returns {Promise<Array>}
 */
async function getTopFailWords(limit = 10) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('failCount');

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, 'prev'); // 降序
    const results = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        // 只取 failCount > 0 的
        if (cursor.value.failCount > 0) {
          results.push(cursor.value);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取已掌握的单词数量（failCount=0 且 repetitions>=3）
 * @returns {Promise<number>}
 */
async function getMasteredCount() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result;
      const mastered = all.filter(w => w.failCount === 0 && w.repetitions >= 3);
      resolve(mastered.length);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取总词数
 * @returns {Promise<number>}
 */
async function getTotalCount() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取已同步的进度版本号
 * @returns {string|null}
 */
function getSyncVersion() {
  return localStorage.getItem('wordFlashSyncVersion');
}

/**
 * 设置已同步的进度版本号
 * @param {string} version
 */
function setSyncVersion(version) {
  localStorage.setItem('wordFlashSyncVersion', version);
}


/* ================================================================
 * 模块 4: ui.js — 已合并
 * ================================================================ */

/**
 * 卡片 UI 模块
 * 支持两种模式：normal（四档评分）和 relearning（认识/不认识双按钮）
 */


/** 是否正在复习中（防止重复触发） */
let isReviewing = false;

function getIsReviewing() {
  return isReviewing;
}

/**
 * 渲染一张卡片，返回用户选择的回调
 * @param {Object} word - 单词对象
 * @param {string} mode - 'normal' | 'relearning'
 * @param {number} confirmCount - relearning 模式下的确认次数（0 或 1）
 * @param {Function} onResult - 回调 (quality: number)，normal=0/2/4/5, relearning=0/4
 */
function renderCard(word, mode, confirmCount, onResult) {
  const area = document.getElementById('card-area');

  const modeLabel = mode === 'relearning'
    ? `不认识·巩固中（第 ${confirmCount + 1}/2 次确认）`
    : '';

  const buttonsHTML = mode === 'normal' ? `
    <button class="rating-btn forgot" data-quality="0">不认识</button>
    <button class="rating-btn hard" data-quality="2">困难</button>
    <button class="rating-btn good" data-quality="4">认识</button>
    <button class="rating-btn easy" data-quality="5">简单</button>
  ` : `
    <button class="rating-btn forgot" data-quality="0">不认识</button>
    <button class="rating-btn easy" data-quality="4">认识</button>
  `;

  area.innerHTML = `
    ${modeLabel ? `<div class="relearning-badge">${escapeHtml(modeLabel)}</div>` : ''}
    <div class="card-scene" id="card-scene">
      <div class="card-face card-front" id="card-front">
        <div class="word-display">${escapeHtml(word.word)}</div>
        <div class="tap-hint">点击卡片查看释义</div>
      </div>
      <div class="card-face card-back" id="card-back">
        <div class="word-display">${escapeHtml(word.word)}</div>
        <div class="definition">${escapeHtml(word.definition || '暂无释义')}</div>
        ${word.sentence ? `<div class="sentence">${escapeHtml(word.sentence)}</div>` : ''}
      </div>
    </div>
    <div class="rating-buttons" id="rating-buttons" style="display:none;">
      ${buttonsHTML}
    </div>
  `;

  const scene = document.getElementById('card-scene');
  const ratingBtns = document.getElementById('rating-buttons');
  let isFlipped = false;

  scene.addEventListener('click', () => {
    if (!isFlipped) {
      scene.classList.add('flipped');
      ratingBtns.style.display = 'grid';
      isFlipped = true;
    }
  });

  ratingBtns.querySelectorAll('.rating-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const quality = parseInt(btn.dataset.quality);
      onResult(quality);
    });
  });
}

/**
 * 显示复习完成界面
 */
function showComplete(stats) {
  isReviewing = false;
  document.getElementById('card-area').classList.add('hidden');
  document.getElementById('review-complete').classList.remove('hidden');

  const summary = `共复习 ${stats.total} 个单词：认识 ${stats.good + stats.easy} 个，困难 ${stats.hard} 个，不认识 ${stats.forgot} 个`;
  document.getElementById('review-summary').textContent = summary;
}

/**
 * 设置复习中状态
 */
function setReviewing(val) {
  isReviewing = val;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


/* ================================================================
 * 模块 5: stats.js — 已合并
 * ================================================================ */

/**
 * 统计模块
 * 提供学习数据统计查询
 */

  getTopFailWords,
  getTodayReviewWords,
  getMasteredCount,
  getTotalCount
} from './store.js';

/**
 * 获取完整统计数据
 * @returns {Promise<{total, mastered, todayReview, topFail}>}
 */
async function getStats() {
  const [total, mastered, todayReview, topFail] = await Promise.all([
    getTotalCount(),
    getMasteredCount(),
    getTodayReviewWords(),
    getTopFailWords(10)
  ]);

  return {
    total,
    mastered,
    todayReviewCount: todayReview.length,
    todayReviewWords: todayReview,
    topFail
  };
}

/**
 * 渲染统计面板到 DOM
 * @param {Object} stats - 统计数据
 */
function renderStats(stats) {
  // 更新统计卡片
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-mastered').textContent = stats.mastered;
  document.getElementById('stat-today').textContent = stats.todayReviewCount;

  // 渲染 TOP 10 不认识单词
  const listEl = document.getElementById('top-fail-list');

  if (stats.topFail.length === 0) {
    listEl.innerHTML = '<p class="placeholder-text">暂无易错词，继续加油！</p>';
    return;
  }

  listEl.innerHTML = stats.topFail
    .map((w, i) => `
      <div class="top-word-row">
        <span class="rank">${i + 1}.</span>
        <span class="word">${w.word}</span>
        <span class="count">不认识 ${w.failCount} 次</span>
      </div>
    `)
    .join('');
}


/* ================================================================
 * 模块 6: app.js — 已合并
 * ================================================================ */

/**
 * 主入口模块
 * 初始化应用、路由控制、Tab 切换
 */


/** 示例词库路径（相对路径，兼容 GitHub Pages 子目录） */
const SAMPLE_PATH = 'words/sample.md';

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
  try {
    const stats = await getStats();
    renderStats(stats);
  } catch (err) {
    console.error('[App] 加载统计失败:', err);
    document.getElementById('stat-total').textContent = '错误';
    document.getElementById('stat-mastered').textContent = '错误';
    document.getElementById('stat-today').textContent = '错误';
  }
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
init().catch(err => {
  console.error('[App] 初始化失败:', err);
  const cardArea = document.getElementById('card-area');
  if (cardArea) {
    cardArea.innerHTML = `<p style="color: red; padding: 20px; text-align: center;">初始化失败：${err.message || '未知错误'}</p>`;
  }
});

