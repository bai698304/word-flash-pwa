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
export function sm2(card, quality) {
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
export function qualityLabel(quality) {
  const labels = { 0: '不认识', 2: '困难', 3: '一般', 4: '认识', 5: '简单' };
  return labels[quality] || '未知';
}
