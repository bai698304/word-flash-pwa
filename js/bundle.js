/**
 * Word Flash PWA - 合并核心脚本
 * 将所有模块合并为单文件，消除 ES Module 依赖链问题
 * 模块顺序：parser → sm2 → store → ui → stats → app
 */

/* ================================================================
 * 模块 1: parser.js — Markdown 词库解析器
 * ================================================================ */

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

    if (trimmed.startsWith('# ') || trimmed === '') {
      continue;
    }

    const headingMatch = trimmed.match(/^## (.+)/);
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

    const defMatch = trimmed.match(/^- 解析[：:]\s*(.+)/);
    if (defMatch && currentWord) {
      currentWord.definition = defMatch[1].trim();
      continue;
    }

    const sentMatch = trimmed.match(/^- 句子[：:]\s*(.+)/);
    if (sentMatch && currentWord) {
      currentWord.sentence = sentMatch[1].trim();
      continue;
    }
  }

  if (currentWord && currentWord.word) {
    words.push(currentWord);
  }

  return words;
}

/**
 * 根据单词生成唯一 ID
 */
function generateId(word) {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    const char = word.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + '_' + word.replace(/\s+/g, '_');
}

/* ================================================================
 * 模块 2: sm2.js — SM-2 间隔重复算法
 * ================================================================ */

/**
 * SM-2 核心算法
 * @param {Object} card - 当前卡片状态 {ef, interval, repetitions}
 * @param {number} quality - 用户评分 0-5
 * @returns {Object} 更新后的卡片参数 + 下次复习日期
 */
function sm2(card, quality) {
  const result = {
    ef: card.ef || 2.5,
    interval: card.interval || 1,
    repetitions: card.repetitions || 0
  };

  if (quality >= 3) {
    if (result.repetitions === 0) {
      result.interval = 1;
    } else if (result.repetitions === 1) {
      result.interval = 6;
    } else {
      result.interval = Math.round(result.interval * result.ef);
    }
    result.repetitions += 1;

    const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    result.ef = result.ef + delta;
    if (result.ef < 1.3) {
      result.ef = 1.3;
    }
  } else {
    result.interval = 1;
    result.repetitions = 0;
  }

  const now = new Date();
  const nextReview = new Date(now.getTime() + result.interval * 24 * 60 * 60 * 1000);

  return {
    ef: result.ef,
    interval: result.interval,
    repetitions: result.repetitions,
    nextReview: nextReview.toISOString()
  };
}

/* ================================================================
 * 模块 3: store.js — IndexedDB 存储层
 * ================================================================ */

const DB_NAME = 'WordFlashDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

function openDB() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function (event) {
      var db = event.target.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      var store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('nextReview', 'nextReview', { unique: false });
      store.createIndex('failCount', 'failCount', { unique: false });
      store.createIndex('repetitions', 'repetitions', { unique: false });
    };

    request.onsuccess = function (event) {
      resolve(event.target.result);
    };

    request.onerror = function (event) {
      reject(event.target.error);
    };
  });
}

function importWords(words) {
  return openDB().then(function (db) {
    var tx = db.transaction(STORE_NAME, 'readwrite');
    var store = tx.objectStore(STORE_NAME);
    var added = 0;
    var skipped = 0;

    var chain = Promise.resolve();
    words.forEach(function (word) {
      chain = chain.then(function () {
        return new Promise(function (resolve) {
          var req = store.get(word.id);
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(null); };
        }).then(function (existing) {
          if (existing) {
            skipped++;
            return;
          }
          return new Promise(function (resolve, reject) {
            var req = store.add({
              id: word.id,
              word: word.word,
              definition: word.definition || '',
              sentence: word.sentence || '',
              ef: 2.5,
              interval: 1,
              repetitions: 0,
              nextReview: new Date().toISOString(),
              failCount: 0,
              lastReviewed: null
            });
            req.onsuccess = function () { added++; resolve(); };
            req.onerror = function () { reject(req.error); };
          });
        });
      });
    });

    return chain.then(function () {
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve({ added: added, skipped: skipped }); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  });
}

function getTodayReviewWords(maxWords) {
  if (maxWords === undefined) maxWords = 120;
  return openDB().then(function (db) {
    var tx = db.transaction(STORE_NAME, 'readonly');
    var store = tx.objectStore(STORE_NAME);
    var index = store.index('nextReview');

    var now = new Date();
    var endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    return new Promise(function (resolve, reject) {
      var range = IDBKeyRange.upperBound(endOfToday);
      var request = index.openCursor(range);
      var results = [];

      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          results.sort(function (a, b) {
            if (a.repetitions > 0 && b.repetitions === 0) return -1;
            if (a.repetitions === 0 && b.repetitions > 0) return 1;
            return new Date(a.nextReview) - new Date(b.nextReview);
          });
          resolve(results.slice(0, maxWords));
        }
      };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function exportAllData() {
  return openDB().then(function (db) {
    var tx = db.transaction(STORE_NAME, 'readonly');
    var store = tx.objectStore(STORE_NAME);
    return new Promise(function (resolve, reject) {
      var request = store.getAll();
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function importAllData(data) {
  return openDB().then(function (db) {
    var tx = db.transaction(STORE_NAME, 'readwrite');
    var store = tx.objectStore(STORE_NAME);
    var restored = 0;

    var chain = Promise.resolve();
    data.forEach(function (item) {
      chain = chain.then(function () {
        return new Promise(function (resolve, reject) {
          var req = store.put(item);
          req.onsuccess = function () { restored++; resolve(); };
          req.onerror = function () { reject(req.error); };
        });
      });
    });

    return chain.then(function () {
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve({ restored: restored }); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  });
}

function updateWord(id, updates) {
  return openDB().then(function (db) {
    var tx = db.transaction(STORE_NAME, 'readwrite');
    var store = tx.objectStore(STORE_NAME);

    return new Promise(function (resolve, reject) {
      var getReq = store.get(id);
      getReq.onsuccess = function () {
        var word = getReq.result;
        if (!word) { resolve(null); return; }
        Object.assign(word, updates);
        word.lastReviewed = new Date().toISOString();
        var putReq = store.put(word);
        putReq.onsuccess = function () { resolve(word); };
        putReq.onerror = function () { reject(putReq.error); };
      };
      getReq.onerror = function () { reject(getReq.error); };
    });
  });
}

function getTopFailWords(limit) {
  if (limit === undefined) limit = 10;
  return openDB().then(function (db) {
    var tx = db.transaction(STORE_NAME, 'readonly');
    var store = tx.objectStore(STORE_NAME);
    var index = store.index('failCount');

    return new Promise(function (resolve, reject) {
      var request = index.openCursor(null, 'prev');
      var results = [];
      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor && results.length < limit) {
          if (cursor.value.failCount > 0) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function getMasteredCount() {
  return openDB().then(function (db) {
    var tx = db.transaction(STORE_NAME, 'readonly');
    var store = tx.objectStore(STORE_NAME);
    return new Promise(function (resolve, reject) {
      var request = store.getAll();
      request.onsuccess = function () {
        var all = request.result;
        var mastered = all.filter(function (w) { return w.failCount === 0 && w.repetitions >= 3; });
        resolve(mastered.length);
      };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function getTotalCount() {
  return openDB().then(function (db) {
    var tx = db.transaction(STORE_NAME, 'readonly');
    var store = tx.objectStore(STORE_NAME);
    return new Promise(function (resolve, reject) {
      var request = store.count();
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function getSyncVersion() {
  return localStorage.getItem('wordFlashSyncVersion');
}

function setSyncVersion(version) {
  localStorage.setItem('wordFlashSyncVersion', version);
}

/* ================================================================
 * 模块 4: ui.js — 卡片 UI 模块
 * ================================================================ */

var _isReviewing = false;

function getIsReviewing() {
  return _isReviewing;
}

function renderCard(word, mode, confirmCount, onResult) {
  var area = document.getElementById('card-area');

  var modeLabel = mode === 'relearning'
    ? '不认识·巩固中（第 ' + (confirmCount + 1) + '/2 次确认）'
    : '';

  var buttonsHTML = mode === 'normal'
    ? '<button class="rating-btn forgot" data-quality="0">不认识</button>' +
      '<button class="rating-btn hard" data-quality="2">困难</button>' +
      '<button class="rating-btn good" data-quality="4">认识</button>' +
      '<button class="rating-btn easy" data-quality="5">简单</button>'
    : '<button class="rating-btn forgot" data-quality="0">不认识</button>' +
      '<button class="rating-btn easy" data-quality="4">认识</button>';

  area.innerHTML =
    (modeLabel ? '<div class="relearning-badge">' + _escapeHtml(modeLabel) + '</div>' : '') +
    '<div class="card-scene" id="card-scene">' +
      '<div class="card-face card-front" id="card-front">' +
        '<div class="word-display">' + _escapeHtml(word.word) + '</div>' +
        '<div class="tap-hint">点击卡片查看释义</div>' +
      '</div>' +
      '<div class="card-face card-back" id="card-back">' +
        '<div class="word-display">' + _escapeHtml(word.word) + '</div>' +
        '<div class="definition">' + _escapeHtml(word.definition || '暂无释义') + '</div>' +
        (word.sentence ? '<div class="sentence">' + _escapeHtml(word.sentence) + '</div>' : '') +
      '</div>' +
    '</div>' +
    '<div class="rating-buttons" id="rating-buttons" style="display:none;">' +
      buttonsHTML +
    '</div>';

  var scene = document.getElementById('card-scene');
  var ratingBtns = document.getElementById('rating-buttons');
  var isFlipped = false;

  scene.addEventListener('click', function () {
    if (!isFlipped) {
      scene.classList.add('flipped');
      ratingBtns.style.display = 'grid';
      isFlipped = true;
    }
  });

  var btns = ratingBtns.querySelectorAll('.rating-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', (function (btn) {
      return function (e) {
        e.stopPropagation();
        var quality = parseInt(btn.dataset.quality);
        onResult(quality);
      };
    })(btns[i]));
  }
}

function showComplete(stats) {
  _isReviewing = false;
  document.getElementById('card-area').classList.add('hidden');
  document.getElementById('review-complete').classList.remove('hidden');
  var summary = '共复习 ' + stats.total + ' 个单词：认识 ' + (stats.good + stats.easy) + ' 个，困难 ' + stats.hard + ' 个，不认识 ' + stats.forgot + ' 个';
  document.getElementById('review-summary').textContent = summary;
}

function setReviewing(val) {
  _isReviewing = val;
}

function _escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ================================================================
 * 模块 5: stats.js — 统计模块
 * ================================================================ */

function getStats() {
  return Promise.all([
    getTotalCount(),
    getMasteredCount(),
    getTodayReviewWords(),
    getTopFailWords(10)
  ]).then(function (results) {
    return {
      total: results[0],
      mastered: results[1],
      todayReviewCount: results[2].length,
      todayReviewWords: results[2],
      topFail: results[3]
    };
  });
}

function renderStats(stats) {
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-mastered').textContent = stats.mastered;
  document.getElementById('stat-today').textContent = stats.todayReviewCount;

  var listEl = document.getElementById('top-fail-list');

  if (stats.topFail.length === 0) {
    listEl.innerHTML = '<p class="placeholder-text">暂无易错词，继续加油！</p>';
    return;
  }

  var html = '';
  for (var i = 0; i < stats.topFail.length; i++) {
    var w = stats.topFail[i];
    html += '<div class="top-word-row">' +
      '<span class="rank">' + (i + 1) + '.</span>' +
      '<span class="word">' + _escapeHtml(w.word) + '</span>' +
      '<span class="count">不认识 ' + w.failCount + ' 次</span>' +
      '</div>';
  }
  listEl.innerHTML = html;
}

/* ================================================================
 * 模块 6: app.js — 主入口（初始化、路由、复习流程）
 * ================================================================ */

var SAMPLE_PATH = 'words/sample.md';
var reviewQueue = [];
var sessionStats = { forgot: 0, hard: 0, good: 0, easy: 0, total: 0 };

function init() {
  registerSW();
  loadAndImportSample().then(function () {
    return autoSyncProgress();
  }).then(function () {
    return autoSyncWords();
  }).then(function () {
    setupTabs();
    return loadReviewTab();
  }).then(function () {
    setupDataActions();
  }).catch(function (err) {
    console.error('[App] 初始化失败:', err);
    var cardArea = document.getElementById('card-area');
    if (cardArea) {
      cardArea.innerHTML = '<p style="color: red; padding: 20px; text-align: center;">初始化失败：' + (err.message || '未知错误') + '</p>';
    }
  });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function (reg) { console.log('[App] SW 注册成功', reg.scope); })
      .catch(function (err) { console.warn('[App] SW 注册失败（本地 HTTP 环境正常）', err); });
  }
}

function loadAndImportSample() {
  return fetch(SAMPLE_PATH).then(function (response) {
    if (!response.ok) {
      console.warn('[App] 示例词库加载失败:', response.status);
      return;
    }
    return response.text().then(function (markdown) {
      var words = parseMarkdown(markdown);
      if (words.length === 0) {
        console.warn('[App] 词库解析结果为空');
        return;
      }
      return importWords(words).then(function (result) {
        console.log('[App] 词库导入完成: 新增 ' + result.added + ' 个，跳过 ' + result.skipped + ' 个');
      });
    });
  }).catch(function (err) {
    console.error('[App] 词库加载异常:', err);
  });
}

function autoSyncProgress() {
  return fetch('words/progress.json', { cache: 'no-cache' }).then(function (resp) {
    if (!resp.ok) {
      console.log('[AutoSync] progress.json 不存在，跳过');
      return;
    }
    return resp.json().then(function (json) {
      var fileVersion = json.version;
      var localVersion = getSyncVersion();
      if (fileVersion === localVersion) {
        console.log('[AutoSync] 版本一致，无需同步');
        return;
      }
      if (!json.words || !Array.isArray(json.words) || json.words.length === 0) {
        console.warn('[AutoSync] progress.json 无有效词条');
        return;
      }
      console.log('[AutoSync] 检测到新版本 (本地: ' + localVersion + ', 文件: ' + fileVersion + ')，开始导入...');
      return importAllData(json.words).then(function (result) {
        setSyncVersion(fileVersion);
        console.log('[AutoSync] 完成，恢复 ' + result.restored + ' 个词条');
      });
    });
  }).catch(function (err) {
    console.warn('[AutoSync] 同步失败', err);
  });
}

function autoSyncWords() {
  return fetch('words/manifest.json', { cache: 'no-cache' }).then(function (resp) {
    if (!resp.ok) {
      console.log('[AutoSync] manifest.json 不存在，跳过');
      return;
    }
    return resp.json().then(function (manifest) {
      var allFiles = manifest.files || [];
      if (allFiles.length === 0) return;

      var imported = JSON.parse(localStorage.getItem('wordFlashImportedFiles') || '[]');
      var newFiles = allFiles.filter(function (f) { return imported.indexOf(f) === -1; });

      if (newFiles.length === 0) {
        console.log('[AutoSync] 没有新词库文件');
        return;
      }

      console.log('[AutoSync] 发现 ' + newFiles.length + ' 个新词库: ' + newFiles.join(', '));

      var chain = Promise.resolve();
      newFiles.forEach(function (file) {
        chain = chain.then(function () {
          return fetch('words/' + encodeURIComponent(file), { cache: 'no-cache' }).then(function (mdResp) {
            if (!mdResp.ok) return;
            return mdResp.text().then(function (mdText) {
              var words = parseMarkdown(mdText);
              if (words.length > 0) {
                return importWords(words).then(function (result) {
                  console.log('[AutoSync] ' + file + ': 新增 ' + result.added + ' 词, 跳过 ' + result.skipped + ' 词');
                });
              }
            });
          }).catch(function (e) {
            console.warn('[AutoSync] ' + file + ' 处理失败', e);
          });
        });
      });

      return chain.then(function () {
        var newList = imported.concat(newFiles);
        // 去重
        var unique = [];
        for (var i = 0; i < newList.length; i++) {
          if (unique.indexOf(newList[i]) === -1) unique.push(newList[i]);
        }
        localStorage.setItem('wordFlashImportedFiles', JSON.stringify(unique));
      });
    });
  }).catch(function (err) {
    console.warn('[AutoSync] 词库同步失败', err);
  });
}

function setupTabs() {
  var navBtns = document.querySelectorAll('.nav-btn');
  var tabs = {
    review: document.getElementById('tab-review'),
    practice: document.getElementById('tab-practice'),
    stats: document.getElementById('tab-stats')
  };

  for (var i = 0; i < navBtns.length; i++) {
    navBtns[i].addEventListener('click', (function (btn) {
      return function () {
        var tabName = btn.dataset.tab;

        for (var j = 0; j < navBtns.length; j++) {
          navBtns[j].classList.remove('active');
        }
        btn.classList.add('active');

        var tabKeys = Object.keys(tabs);
        for (var k = 0; k < tabKeys.length; k++) {
          tabs[tabKeys[k]].classList.remove('active');
        }
        tabs[tabName].classList.add('active');

        if (tabName === 'review') {
          loadReviewTab();
        } else if (tabName === 'practice') {
          loadPracticeTab();
        } else if (tabName === 'stats') {
          loadStatsTab();
        }
      };
    })(navBtns[i]));
  }
}

function loadReviewTab() {
  if (getIsReviewing()) return;

  return getTodayReviewWords(120).then(function (words) {
    document.getElementById('card-area').classList.remove('hidden');
    document.getElementById('review-complete').classList.add('hidden');

    if (words.length === 0) {
      document.getElementById('card-area').classList.add('hidden');
      document.getElementById('review-complete').classList.remove('hidden');
      document.getElementById('review-summary').textContent = '所有单词都在按计划复习中，继续保持！';
      return;
    }

    return getTodayReviewWords(9999).then(function (dueAll) {
      var remaining = dueAll.length - words.length;
      var hint = remaining > 0
        ? '（今日到期共 ' + dueAll.length + ' 词，本组 ' + words.length + ' 词，剩余 ' + remaining + ' 词待后续推送）'
        : '';
      document.getElementById('review-summary').textContent = hint;

      reviewQueue = words.map(function (w) { return { word: w, mode: 'normal', confirmCount: 0 }; });
      sessionStats = { forgot: 0, hard: 0, good: 0, easy: 0, total: 0 };
      setReviewing(true);

      processNextCard();
    });
  });
}

function processNextCard() {
  if (reviewQueue.length === 0) {
    setReviewing(false);
    showComplete(sessionStats);
    return;
  }

  var entry = reviewQueue.shift();
  renderCard(entry.word, entry.mode, entry.confirmCount, function (quality) {
    handleResult(entry, quality).then(function () {
      processNextCard();
    });
  });
}

function handleResult(entry, quality) {
  sessionStats.total++;
  var word = entry.word;

  if (entry.mode === 'normal') {
    if (quality === 0) {
      sessionStats.forgot++;
      insertRelearning(word, 0);
      return Promise.resolve();
    } else {
      var labels = { 2: 'hard', 4: 'good', 5: 'easy' };
      sessionStats[labels[quality]]++;

      var result = sm2(word, quality);
      return updateWord(word.id, {
        ef: result.ef,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReview: result.nextReview,
        failCount: word.failCount || 0
      });
    }
  } else {
    if (quality === 0) {
      sessionStats.forgot++;
      insertRelearning(word, 0);
      return Promise.resolve();
    } else {
      if (entry.confirmCount === 0) {
        insertRelearning(word, 1);
        return Promise.resolve();
      } else {
        sessionStats.good++;

        var result2 = sm2({ ef: word.ef, interval: word.interval, repetitions: 0 }, 4);
        return updateWord(word.id, {
          ef: result2.ef,
          interval: result2.interval,
          repetitions: result2.repetitions,
          nextReview: result2.nextReview,
          failCount: (word.failCount || 0) + 1,
          lastReviewed: new Date().toISOString()
        });
      }
    }
  }
}

function insertRelearning(word, confirmCount) {
  var offset = confirmCount === 0 ? 6 : 0;
  var pos = Math.min(offset, reviewQueue.length);
  reviewQueue.splice(pos, 0, { word: word, mode: 'relearning', confirmCount: confirmCount });
}

function loadPracticeTab() {
  var listEl = document.getElementById('practice-list');
  var emptyEl = document.getElementById('practice-empty');

  return getTopFailWords(20).then(function (topFail) {
    if (topFail.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    var html = '';
    for (var i = 0; i < topFail.length; i++) {
      var w = topFail[i];
      html += '<div class="practice-word-item" data-id="' + _escapeHtml(w.id) + '">' +
        '<span class="word">' + _escapeHtmlStatic(w.word) + '</span>' +
        '<span class="fail-badge">不认识 ' + w.failCount + ' 次</span>' +
        '</div>';
    }
    listEl.innerHTML = html;

    listEl.querySelectorAll('.practice-word-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var wordId = item.dataset.id;
        var word = null;
        for (var j = 0; j < topFail.length; j++) {
          if (topFail[j].id === wordId) { word = topFail[j]; break; }
        }
        if (word) {
          document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
          document.querySelector('[data-tab="review"]').classList.add('active');
          var tabContents = document.querySelectorAll('.tab-content');
          for (var k = 0; k < tabContents.length; k++) {
            tabContents[k].classList.remove('active');
          }
          document.getElementById('tab-review').classList.add('active');

          startReview([word], function () {
            loadReviewTab();
          });
        }
      });
    });
  });
}

function loadStatsTab() {
  return getStats().then(function (stats) {
    renderStats(stats);
  }).catch(function (err) {
    console.error('[App] 加载统计失败:', err);
    document.getElementById('stat-total').textContent = '错误';
    document.getElementById('stat-mastered').textContent = '错误';
    document.getElementById('stat-today').textContent = '错误';
  });
}

function _escapeHtmlStatic(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setupDataActions() {
  document.getElementById('btn-export').addEventListener('click', function () {
    exportAllData().then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var now = new Date();
      var dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      a.href = url;
      a.download = 'word-flash-backup-' + dateStr + '.json';
      a.click();
      URL.revokeObjectURL(url);
      alert('已导出 ' + data.length + ' 个词条的学习进度');
    }).catch(function (err) {
      alert('导出失败: ' + err.message);
    });
  });

  var fileInput = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', function () {
    fileInput.click();
  });
  fileInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('备份文件格式错误');
        importAllData(data).then(function (result) {
          alert('已恢复 ' + result.restored + ' 个词条，刷新页面生效');
          location.reload();
        });
      } catch (err) {
        alert('恢复失败: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

// 启动应用
init();
