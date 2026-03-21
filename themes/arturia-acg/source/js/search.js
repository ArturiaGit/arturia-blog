(function() {
  var btn = document.getElementById('nav-search-btn');
  var overlay = document.getElementById('search-overlay');
  var panel = document.getElementById('search-panel');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var dataCache = null;

  if (!btn || !overlay || !panel || !input || !results) {
    return;
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function openPanel() {
    overlay.classList.add('is-active');
    panel.classList.add('is-active');
    panel.setAttribute('aria-hidden', 'false');
    input.focus();
    fetchData();
  }

  function closePanel() {
    overlay.classList.remove('is-active');
    panel.classList.remove('is-active');
    panel.setAttribute('aria-hidden', 'true');
    input.value = '';
    results.innerHTML = '';
  }

  function togglePanel() {
    if (panel.classList.contains('is-active')) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function fetchData() {
    if (dataCache) return;
    fetch('/search.json')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        dataCache = data || [];
      })
      .catch(function() {
        dataCache = [];
      });
  }

  function renderResults(list, keyword) {
    if (!keyword) {
      results.innerHTML = '';
      return;
    }

    if (!list.length) {
      results.innerHTML = '<li><a href="javascript:void(0);"><span class="title">无匹配结果</span></a></li>';
      return;
    }

    var reg = new RegExp(escapeRegExp(keyword), 'ig');
    results.innerHTML = list.map(function(item) {
      var title = item.title || '';
      var content = item.content || '';
      var snippet = content.replace(/<[^>]+>/g, '').slice(0, 120);
      var hlTitle = title.replace(reg, '<span class="hl">$&</span>');
      var hlSnippet = snippet.replace(reg, '<span class="hl">$&</span>');
      return '<li><a href="' + item.url + '">' +
        '<span class="title">' + hlTitle + '</span>' +
        '<span class="snippet">' + hlSnippet + '</span>' +
      '</a></li>';
    }).join('');
  }

  function handleInput() {
    var keyword = input.value.trim();
    if (!keyword) {
      renderResults([], '');
      return;
    }

    if (!dataCache) {
      renderResults([], keyword);
      return;
    }

    var reg = new RegExp(escapeRegExp(keyword), 'i');
    var filtered = dataCache.filter(function(item) {
      var title = item.title || '';
      var tags = (item.tags || []).join(' ');
      var cats = (item.categories || []).join(' ');
      var content = item.content || '';
      return reg.test(title) || reg.test(tags) || reg.test(cats) || reg.test(content);
    }).slice(0, 20);

    renderResults(filtered, keyword);
  }

  btn.addEventListener('click', function(e) {
    e.preventDefault();
    togglePanel();
  });

  overlay.addEventListener('click', closePanel);

  input.addEventListener('input', handleInput);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closePanel();
    }
  });

  document.addEventListener('click', function(e) {
    if (!panel.classList.contains('is-active')) return;
    if (panel.contains(e.target)) return;
    if (btn.contains(e.target)) return;
    closePanel();
  });
})();
