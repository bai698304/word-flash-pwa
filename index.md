<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1a73e8">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>考研词汇闪卡</title>
  <link rel="manifest" href="./manifest.json">
  <link rel="stylesheet" href="./css/style.css">
</head>
<body>
  <!-- 主页面 -->
  <div id="app">
    <!-- 顶部标题栏 -->
    <header class="header">
      <h1>考研词汇闪卡</h1>
    </header>

    <!-- 主内容区 -->
    <main id="main-content">
      <!-- 复习 Tab -->
      <section id="tab-review" class="tab-content active">
        <div id="review-container">
          <div id="card-deck">
            <!-- 卡片区域，由 ui.js 动态渲染 -->
            <div id="card-area">
              <p class="placeholder-text">正在加载词库...</p>
            </div>
          </div>
          <div id="review-complete" class="hidden">
            <div class="complete-icon">✅</div>
            <h2>今日已全部复习完毕</h2>
            <p id="review-summary"></p>
          </div>
        </div>
      </section>

      <!-- 专项练习 Tab -->
      <section id="tab-practice" class="tab-content">
        <div id="practice-container">
          <h2>易错词专项练习</h2>
          <p class="subtitle">不认识次数最多的单词，重点攻克</p>
          <div id="practice-list">
            <p class="placeholder-text">正在加载...</p>
          </div>
          <div id="practice-empty" class="hidden">
            <p>暂无易错词，继续保持！</p>
          </div>
        </div>
      </section>

      <!-- 统计 Tab -->
      <section id="tab-stats" class="tab-content">
        <div id="stats-container">
          <h2>学习统计</h2>
          <div class="stats-grid" id="stats-grid">
            <div class="stat-card">
              <div class="stat-number" id="stat-total">--</div>
              <div class="stat-label">总词数</div>
            </div>
            <div class="stat-card">
              <div class="stat-number" id="stat-mastered">--</div>
              <div class="stat-label">已掌握</div>
            </div>
            <div class="stat-card">
              <div class="stat-number" id="stat-today">--</div>
              <div class="stat-label">今日待复习</div>
            </div>
          </div>
          <div class="top-words">
            <h3>不认识 TOP 10</h3>
            <div id="top-fail-list">
              <p class="placeholder-text">加载中...</p>
            </div>
          </div>
          <div class="data-actions">
            <button id="btn-export" class="action-btn">导出备份</button>
            <button id="btn-import" class="action-btn">恢复备份</button>
            <input type="file" id="import-file" accept=".json" style="display:none">
          </div>
        </div>
      </section>
    </main>

    <!-- 底部导航 -->
    <nav class="bottom-nav">
      <button class="nav-btn active" data-tab="review">
        <span class="nav-icon">📖</span>
        <span class="nav-label">复习</span>
      </button>
      <button class="nav-btn" data-tab="practice">
        <span class="nav-icon">🎯</span>
        <span class="nav-label">专项练习</span>
      </button>
      <button class="nav-btn" data-tab="stats">
        <span class="nav-icon">📊</span>
        <span class="nav-label">统计</span>
      </button>
    </nav>
  </div>

  <!-- 加载 ES Module 入口 -->
  <script type="module" src="./js/app.js"></script>
</body>
</html>
