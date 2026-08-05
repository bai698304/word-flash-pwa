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
export async function importWords(words) {
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
export async function getTodayReviewWords(maxWords = 120) {
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
export async function exportAllData() {
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
export async function importAllData(data) {
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
export async function updateWord(id, updates) {
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
export async function getTopFailWords(limit = 10) {
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
export async function getMasteredCount() {
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
export async function getTotalCount() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
