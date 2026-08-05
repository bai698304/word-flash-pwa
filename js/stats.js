/**
 * 统计模块
 * 提供学习数据统计查询
 */

import {
  getTopFailWords,
  getTodayReviewWords,
  getMasteredCount,
  getTotalCount
} from './store.js';

/**
 * 获取完整统计数据
 * @returns {Promise<{total, mastered, todayReview, topFail}>}
 */
export async function getStats() {
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
export function renderStats(stats) {
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
