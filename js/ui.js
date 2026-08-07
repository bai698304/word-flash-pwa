/**
 * 卡片 UI 模块
 * 支持两种模式：normal（四档评分）和 relearning（认识/不认识双按钮）
 */

import { updateWord } from './store.js';

/** 是否正在复习中（防止重复触发） */
let isReviewing = false;

export function getIsReviewing() {
  return isReviewing;
}

/**
 * 渲染一张卡片，返回用户选择的回调
 * @param {Object} word - 单词对象
 * @param {string} mode - 'normal' | 'relearning'
 * @param {number} confirmCount - relearning 模式下的确认次数（0 或 1）
 * @param {Function} onResult - 回调 (quality: number)，normal=0/2/4/5, relearning=0/4
 */
export function renderCard(word, mode, confirmCount, onResult) {
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
export function showComplete(stats) {
  isReviewing = false;
  document.getElementById('card-area').classList.add('hidden');
  document.getElementById('review-complete').classList.remove('hidden');

  const summary = `共复习 ${stats.total} 个单词：认识 ${stats.good + stats.easy} 个，困难 ${stats.hard} 个，不认识 ${stats.forgot} 个`;
  document.getElementById('review-summary').textContent = summary;
}

/**
 * 设置复习中状态
 */
export function setReviewing(val) {
  isReviewing = val;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
