(function() {
  var btn = document.getElementById('nav-search-btn');
  var overlay = document.getElementById('search-overlay');
  var panel = document.getElementById('search-panel');
  var closeBtn = document.getElementById('search-close');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var resultsView = document.getElementById('search-results-view');
  var defaultView = document.getElementById('search-default-view');
  var statusLabel = document.getElementById('search-status-label');
  var statusText = document.getElementById('search-status-text');
  var metaEl = document.getElementById('search-post-meta');
  var searchPath = panel ? (panel.getAttribute('data-search-path') || '/search.json') : '/search.json';
  var htmlDecoder = document.createElement('textarea');
  var dataCache = null;
  var fetchPromise = null;
  var activeIndex = -1;
  var activeResults = [];
  var lastFocusedElement = null;
  var postMeta = {};

  if (!btn || !overlay || !panel || !closeBtn || !input || !results || !resultsView || !defaultView || !statusLabel || !statusText) {
    return;
  }

  if (metaEl) {
    try {
      postMeta = JSON.parse(metaEl.textContent || '{}');
    } catch (err) {
      postMeta = {};
    }
  }

  function decodeHtml(text) {
    htmlDecoder.innerHTML = String(text || '');
    return htmlDecoder.value;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeContent(text) {
    return decodeHtml(String(text || ''))
      .replace(/<[^>]*>/g, ' ')
      .replace(/\[\[|\]\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function truncate(text, length) {
    var normalized = String(text || '').trim();
    if (normalized.length <= length) {
      return normalized;
    }
    return normalized.slice(0, length).trim() + '…';
  }

  function getTerms(keyword) {
    var normalized = String(keyword || '').trim().toLowerCase();
    var terms;

    if (!normalized) {
      return [];
    }

    terms = normalized.split(/\s+/).filter(Boolean);
    if (terms.indexOf(normalized) === -1) {
      terms.unshift(normalized);
    }

    return terms.filter(function(term, index) {
      return terms.indexOf(term) === index;
    });
  }

  function setStatus(label, text) {
    statusLabel.textContent = label;
    statusText.textContent = text;
  }

  function isPanelOpen() {
    return panel.classList.contains('is-active');
  }

  function clearActiveResults() {
    activeResults = [];
    activeIndex = -1;
  }

  function showDefaultView() {
    defaultView.hidden = false;
    resultsView.hidden = true;
    results.innerHTML = '';
    clearActiveResults();

    if (dataCache) {
      setStatus('索引就绪', '可搜索 ' + dataCache.length + ' 篇文章，支持标题、标签、分类与正文片段。');
    } else if (fetchPromise) {
      setStatus('同步索引中', '正在接入全站检索数据，请稍候。');
    } else {
      setStatus('检索舱待命', '按下 Ctrl/⌘ + K 或直接输入关键词开始搜索。');
    }
  }

  function showResultsView() {
    defaultView.hidden = true;
    resultsView.hidden = false;
  }

  function renderStateCard(type, title, description) {
    var iconMap = {
      loading: 'fa-spinner fa-spin',
      error: 'fa-triangle-exclamation',
      empty: 'fa-satellite'
    };

    showResultsView();
    clearActiveResults();
    results.innerHTML =
      '<li class="search-state-card is-' + type + '">' +
        '<span class="search-state-icon"><i class="fas ' + (iconMap[type] || iconMap.empty) + '"></i></span>' +
        '<strong class="search-state-title">' + escapeHtml(title) + '</strong>' +
        '<span class="search-state-description">' + escapeHtml(description) + '</span>' +
      '</li>';
  }

  function highlightText(text, terms) {
    var safe = escapeHtml(text);
    var orderedTerms;
    var pattern;

    if (!terms.length) {
      return safe;
    }

    orderedTerms = terms.slice().sort(function(a, b) {
      return b.length - a.length;
    });
    pattern = new RegExp('(' + orderedTerms.map(escapeRegExp).join('|') + ')', 'ig');

    return safe.replace(pattern, '<span class="hl">$1</span>');
  }

  function createSnippet(item, terms) {
    var source = item.content || item.excerpt || '';
    var lowered = source.toLowerCase();
    var firstIndex = -1;
    var matchedTermLength = 0;
    var snippetStart;
    var snippetEnd;
    var snippet;

    terms.forEach(function(term) {
      var index = lowered.indexOf(term);
      if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
        firstIndex = index;
        matchedTermLength = term.length;
      }
    });

    if (!source) {
      return '没有可用的正文片段。';
    }

    if (firstIndex === -1) {
      return truncate(source, 120);
    }

    snippetStart = Math.max(0, firstIndex - 26);
    snippetEnd = Math.min(source.length, firstIndex + matchedTermLength + 82);
    snippet = source.slice(snippetStart, snippetEnd).trim();

    if (snippetStart > 0) {
      snippet = '…' + snippet;
    }
    if (snippetEnd < source.length) {
      snippet += '…';
    }

    return snippet;
  }

  function scoreField(text, terms, weights) {
    var score = 0;
    var firstIndex = -1;
    var hits = 0;

    if (!text) {
      return {
        score: 0,
        hits: 0,
        firstIndex: -1
      };
    }

    terms.forEach(function(term) {
      var index = text.indexOf(term);
      if (index !== -1) {
        hits += 1;
        score += weights.hit;
        if (index === 0) {
          score += weights.starts || 0;
        }
        if (text === term) {
          score += weights.exact || 0;
        }
        if (firstIndex === -1 || index < firstIndex) {
          firstIndex = index;
        }
      }
    });

    if (terms.length > 1 && hits === terms.length) {
      score += weights.full || 0;
    }

    return {
      score: score,
      hits: hits,
      firstIndex: firstIndex
    };
  }

  function analyzeItem(item, terms) {
    var title = String(item.title || '').toLowerCase();
    var tags = (item.tags || []).join(' ').toLowerCase();
    var categories = (item.categories || []).join(' ').toLowerCase();
    var content = String(item.content || '').toLowerCase();
    var everyTermMatched = terms.every(function(term) {
      return title.indexOf(term) !== -1 ||
        tags.indexOf(term) !== -1 ||
        categories.indexOf(term) !== -1 ||
        content.indexOf(term) !== -1;
    });
    var titleStats;
    var tagStats;
    var categoryStats;
    var contentStats;
    var score;
    var matchType = '正文命中';
    var bestScore;

    if (!everyTermMatched) {
      return null;
    }

    titleStats = scoreField(title, terms, { hit: 30, starts: 10, exact: 18, full: 12 });
    tagStats = scoreField(tags, terms, { hit: 18, exact: 10, full: 8 });
    categoryStats = scoreField(categories, terms, { hit: 16, exact: 8, full: 6 });
    contentStats = scoreField(content, terms, { hit: 6, full: 4 });

    score = titleStats.score + tagStats.score + categoryStats.score + contentStats.score;

    if (title.indexOf(terms[0]) !== -1) {
      score += 8;
    }
    if ((item.tags || []).length) {
      score += 2;
    }
    if ((item.categories || []).length) {
      score += 1;
    }

    bestScore = titleStats.score;
    if (tagStats.score > bestScore) {
      bestScore = tagStats.score;
      matchType = '标签命中';
    }
    if (categoryStats.score > bestScore) {
      bestScore = categoryStats.score;
      matchType = '分类命中';
    }
    if (contentStats.score > bestScore) {
      matchType = '正文命中';
    } else if (titleStats.score === bestScore) {
      matchType = '标题命中';
    }

    return {
      item: item,
      score: score,
      matchType: matchType,
      snippet: createSnippet(item, terms)
    };
  }

  function syncActiveResult(scrollIntoView) {
    activeResults.forEach(function(link, index) {
      var isActive = index === activeIndex;
      link.classList.toggle('is-active', isActive);
      link.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (isActive && scrollIntoView) {
        link.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  function setActiveResult(nextIndex, scrollIntoView) {
    if (!activeResults.length) {
      return;
    }

    if (nextIndex < 0) {
      activeIndex = activeResults.length - 1;
    } else if (nextIndex >= activeResults.length) {
      activeIndex = 0;
    } else {
      activeIndex = nextIndex;
    }

    syncActiveResult(scrollIntoView);
  }

  function renderResults(items, keyword) {
    var terms = getTerms(keyword);
    var markup;

    if (!keyword) {
      showDefaultView();
      return;
    }

    if (!items.length) {
      setStatus('未检索到匹配项', '试试更短的关键词，或从标题、标签名切入。');
      renderStateCard('empty', '没有找到匹配内容', '你可以尝试换个关键词，或者直接点击下方的热门标签重新搜索。');
      return;
    }

    markup = items.map(function(entry, index) {
      var item = entry.item;
      var coverMarkup = item.cover
        ? '<span class="search-result-cover"><img src="' + escapeHtml(item.cover) + '" alt=""></span>'
        : '<span class="search-result-cover is-fallback"><i class="fas fa-stars"></i></span>';
      var metaChips = [];

      if (item.date) {
        metaChips.push(
          '<span class="search-result-chip">' +
            '<i class="far fa-calendar-alt"></i>' +
            '<span>' + escapeHtml(item.date) + '</span>' +
          '</span>'
        );
      }

      if (item.categories && item.categories.length) {
        metaChips.push(
          '<span class="search-result-chip">' +
            '<i class="fas fa-folder-open"></i>' +
            '<span>' + highlightText(item.categories.slice(0, 2).join(' / '), terms) + '</span>' +
          '</span>'
        );
      }

      if (item.tags && item.tags.length) {
        metaChips.push(
          '<span class="search-result-chip">' +
            '<i class="fas fa-tags"></i>' +
            '<span>' + highlightText(item.tags.slice(0, 3).join(' · '), terms) + '</span>' +
          '</span>'
        );
      }

      return (
        '<li class="search-result-item">' +
          '<a class="search-result-link" href="' + escapeHtml(item.url) + '" role="option" data-result-index="' + index + '" aria-selected="false">' +
            coverMarkup +
            '<span class="search-result-main">' +
              '<span class="search-result-topline">' +
                '<span class="search-result-type">' + escapeHtml(entry.matchType) + '</span>' +
              '</span>' +
              '<span class="search-result-title-row">' +
                '<span class="search-result-title">' + highlightText(item.title, terms) + '</span>' +
                '<span class="search-result-arrow"><i class="fas fa-arrow-up-right-from-square"></i></span>' +
              '</span>' +
              '<span class="search-result-snippet">' + highlightText(entry.snippet, terms) + '</span>' +
              '<span class="search-result-meta">' + metaChips.join('') + '</span>' +
            '</span>' +
          '</a>' +
        '</li>'
      );
    }).join('');

    showResultsView();
    results.innerHTML = markup;
    activeResults = Array.prototype.slice.call(results.querySelectorAll('.search-result-link'));
    activeIndex = activeResults.length ? 0 : -1;
    syncActiveResult(false);
    setStatus('检索完成', '找到 ' + items.length + ' 个结果，已按标题和标签权重重新排序。');
  }

  function transformData(list) {
    return (list || []).map(function(item) {
      var meta = postMeta[item.url] || {};
      var normalizedContent = normalizeContent(item.content || '');
      return {
        title: item.title || '未命名文章',
        url: item.url || '#',
        content: normalizedContent,
        excerpt: meta.excerpt || truncate(normalizedContent, 120),
        tags: Array.isArray(item.tags) ? item.tags : [],
        categories: Array.isArray(item.categories) ? item.categories : [],
        date: meta.date || '',
        cover: meta.cover || ''
      };
    }).filter(function(item) {
      return item.url && item.url !== '#';
    });
  }

  function fetchData() {
    if (dataCache) {
      return Promise.resolve(dataCache);
    }

    if (fetchPromise) {
      return fetchPromise;
    }

    setStatus('同步索引中', '正在接入全站检索数据，请稍候。');

    fetchPromise = fetch(searchPath)
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Search index request failed');
        }
        return response.json();
      })
      .then(function(payload) {
        dataCache = transformData(payload);
        fetchPromise = null;

        if (!input.value.trim()) {
          showDefaultView();
        } else {
          handleInput();
        }

        return dataCache;
      })
      .catch(function() {
        fetchPromise = null;
        dataCache = [];
        setStatus('索引加载失败', '暂时无法读取 search.json，请稍后刷新页面重试。');

        if (input.value.trim()) {
          renderStateCard('error', '索引加载失败', 'search.json 当前无法读取，暂时不能执行全站搜索。');
        }

        return dataCache;
      });

    return fetchPromise;
  }

  function handleInput() {
    var keyword = input.value.trim();
    var terms = getTerms(keyword);
    var analyzed;

    if (!keyword) {
      showDefaultView();
      return;
    }

    if (!dataCache) {
      renderStateCard('loading', '正在同步索引', '检索数据加载完成后，会立刻刷新当前搜索结果。');
      fetchData().then(function() {
        if (isPanelOpen()) {
          handleInput();
        }
      });
      return;
    }

    analyzed = dataCache
      .map(function(item) {
        return analyzeItem(item, terms);
      })
      .filter(Boolean)
      .sort(function(a, b) {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.item.title.length !== a.item.title.length) {
          return b.item.title.length - a.item.title.length;
        }
        return String(b.item.date || '').localeCompare(String(a.item.date || ''));
      })
      .slice(0, 12);

    renderResults(analyzed, keyword);
  }

  function openPanel() {
    if (isPanelOpen()) {
      input.focus();
      return;
    }

    lastFocusedElement = document.activeElement;
    overlay.classList.add('is-active');
    panel.classList.add('is-active');
    panel.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('search-open');

    window.setTimeout(function() {
      input.focus();
      input.select();
    }, 60);

    if (!input.value.trim()) {
      showDefaultView();
    }

    fetchData();
  }

  function closePanel() {
    if (!isPanelOpen()) {
      return;
    }

    overlay.classList.remove('is-active');
    panel.classList.remove('is-active');
    panel.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('search-open');
    input.value = '';
    showDefaultView();

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function' && !panel.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    } else {
      btn.focus();
    }
  }

  function togglePanel() {
    if (isPanelOpen()) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function isTypingContext(node) {
    if (!node) {
      return false;
    }

    if (node.isContentEditable) {
      return true;
    }

    return /^(INPUT|TEXTAREA|SELECT)$/i.test(node.tagName);
  }

  btn.addEventListener('click', function(event) {
    event.preventDefault();
    togglePanel();
  });

  closeBtn.addEventListener('click', function() {
    closePanel();
  });

  overlay.addEventListener('click', function() {
    closePanel();
  });

  input.addEventListener('input', handleInput);

  panel.addEventListener('click', function(event) {
    var quickTrigger = event.target.closest('[data-search-term]');
    if (quickTrigger) {
      event.preventDefault();
      input.value = quickTrigger.getAttribute('data-search-term') || '';
      input.focus();
      handleInput();
      return;
    }

    if (event.target.closest('.search-result-link')) {
      closePanel();
    }
  });

  results.addEventListener('mousemove', function(event) {
    var link = event.target.closest('.search-result-link');
    var nextIndex;

    if (!link) {
      return;
    }

    nextIndex = Number(link.getAttribute('data-result-index'));
    if (!isNaN(nextIndex) && nextIndex !== activeIndex) {
      setActiveResult(nextIndex, false);
    }
  });

  results.addEventListener('focusin', function(event) {
    var link = event.target.closest('.search-result-link');
    var nextIndex;

    if (!link) {
      return;
    }

    nextIndex = Number(link.getAttribute('data-result-index'));
    if (!isNaN(nextIndex)) {
      setActiveResult(nextIndex, false);
    }
  });

  document.addEventListener('keydown', function(event) {
    var typingContext = isTypingContext(event.target);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openPanel();
      return;
    }

    if (!typingContext && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === '/') {
      event.preventDefault();
      openPanel();
      return;
    }

    if (!isPanelOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveResult(activeIndex + 1, true);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveResult(activeIndex - 1, true);
      return;
    }

    if (event.key === 'Enter' && activeResults.length && document.activeElement === input) {
      event.preventDefault();
      window.location.href = activeResults[activeIndex >= 0 ? activeIndex : 0].getAttribute('href');
    }
  });

  document.addEventListener('click', function(event) {
    if (!isPanelOpen()) {
      return;
    }

    if (panel.contains(event.target) || btn.contains(event.target)) {
      return;
    }

    closePanel();
  });

  showDefaultView();
})();
