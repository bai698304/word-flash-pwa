/**
 * 卡片 UI 模块
 * 扇贝风格卡片渲染、翻转动画、评分交互
 */

import { sm2, qualityLabel } from './sm2.js';
import { updateWord } from './store.js';

/** 当前正在复习的单词队列 */
let reviewQueue = [];
/** 当前单词索引 */
let currentIndex = 0;
/** 本轮评分记录 */
let sessionStats = { forgot: 0, hard: 0, good: 0, easy: 0, total: 0 };
/** 是否正在复习中（防止重复触发） */
let isReviewing = false;

/** 导出复习状态查询 */
export function getIsReviewing() {
  return isReviewing;
}

/**
 * 开始一轮复习
 * @param {Array} words - 待复习单词数组
 * @param {Function} onComplete - 复习完成回调
 */
export function startReview(words, onComplete) {
  // 已有复习在进行中，忽略重复触发
  if (isReviewing) return;

  if (!words || words.length === 0) {
    onComplete({ total: 0, forgot: 0, hard: 0, good: 0, easy: 0 });
    return;
  }

  isReviewing = true;
  reviewQueue = words;
  currentIndex = 0;
  sessionStats = { forgot: 0, hard: 0, good: 0, easy: 0, total: 0 };

  // 显示卡片区域，隐藏完成提示
  document.getElementById('card-area').classList.remove('hidden');
  document.getElementById('review-complete').classList.add('hidden');

  // 渲染第一张卡片
  renderCard(reviewQueue[currentIndex], onComplete);
}

/**
 * 渲染单张卡片
 */
function renderCard(word, onComplete) {
  const area = document.getElementById('card-area');

  area.innerHTML = `
    <div class="card-scene" id="card-scene">
      <!-- 正面 -->
      <div class="card-face card-front" id="card-front">
        <div class="word-display">${escapeHtml(word.word)}</div>
        <div class="tap-hint">点击卡片查看释义</div>
      </div>
      <!-- 背面 -->
      <div class="card-face card-back" id="card-back">
        <div class="word-display">${escapeHtml(word.word)}</div>
        <div class="definition">${escapeHtml(word.definition || '暂无释义')}</div>
        ${word.sentence ? `<div class="sentence">${escapeHtml(word.sentence)}</div>` : ''}
      </div>
    </div>
    <div class="rating-buttons" id="rating-buttons" style="display:none;">
      <button class="rating-btn forgot" data-quality="0">不认识</button>
      <button class="rating-btn hard" data-quality="2">困难</button>
      <button class="rating-btn good" data-quality="4">认识</button>
      <button class="rating-btn easy" data-quality="5">简单</button>
    </div>
  `;

  const scene = document.getElementById('card-scene');
  const ratingBtns = document.getElementById('rating-buttons');
  let isFlipped = false;

  // 点击卡片翻转
  scene.addEventListener('click', () => {
    if (!isFlipped) {
      scene.classList.add('flipped');
      ratingBtns.style.display = 'grid';
      isFlipped = true;
    }
  });

  // 评分按钮事件
  ratingBtns.querySelectorAll('.rating-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const quality = parseInt(btn.dataset.quality);

      // 记录本轮统计
      sessionStats.total++;
      const labels = { 0: 'forgot', 2: 'hard', 4: 'good', 5: 'easy' };
      sessionStats[labels[quality]]++;

      // SM-2 计算并更新
      const result = sm2(word, quality);
      const updates = {
        ef: result.ef,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReview: result.nextReview,
        failCount: word.failCount + (quality < 3 ? 1 : 0) // 评分 < 3 增加不认识计数
      };

      await updateWord(word.id, updates);

      // 下一张或完成
      currentIndex++;
      if (currentIndex < reviewQueue.length) {
        renderCard(reviewQueue[currentIndex], onComplete);
      } else {
        // 全部完成
        isReviewing = false;
        document.getElementById('card-area').classList.add('hidden');
        document.getElementById('review-complete').classList.remove('hidden');

        const summary = `共复习 ${sessionStats.total} 个单词：认识 ${sessionStats.good + sessionStats.easy} 个，困难 ${sessionStats.hard} 个，不认识 ${sessionStats.forgot} 个`;
        document.getElementById('review-summary').textContent = summary;

        if (onComplete) onComplete(sessionStats);
      }
    });
  });
}

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
