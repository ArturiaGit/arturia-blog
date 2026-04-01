document.addEventListener('DOMContentLoaded', () => {
  const glossaryDataNode = document.getElementById('post-glossary-data');
  const contentRoot = document.querySelector('.post-content[data-glossary-enabled="1"]');
  if (!glossaryDataNode || !contentRoot) return;

  let glossaryRaw = {};
  try {
    glossaryRaw = JSON.parse(glossaryDataNode.textContent || '{}');
  } catch (_) {
    return;
  }

  const glossary = new Map();
  Object.keys(glossaryRaw || {}).forEach((term) => {
    const item = glossaryRaw[term];
    if (typeof item === 'string') {
      const brief = item.trim();
      if (brief) glossary.set(term, { title: term, brief });
      return;
    }

    if (item && typeof item === 'object') {
      const title = String(item.title || term).trim();
      const brief = String(item.brief || item.description || item.desc || '').trim();
      if (brief) glossary.set(term, { title, brief });
    }
  });

  if (glossary.size === 0) return;

  const isSkippableNode = (node) => {
    const tag = node.parentElement && node.parentElement.tagName;
    if (!tag) return true;
    return ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'A', 'KBD', 'SAMP', 'TEXTAREA'].includes(tag);
  };

  const markerRegex = /\[\[([^\[\]]+?)\]\]/g;
  const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue || node.nodeValue.indexOf('[[') === -1) continue;
    if (isSkippableNode(node)) continue;
    textNodes.push(node);
  }

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    markerRegex.lastIndex = 0;
    if (!markerRegex.test(text)) return;

    markerRegex.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    let match;

    while ((match = markerRegex.exec(text)) !== null) {
      const fullMatch = match[0];
      const rawTerm = (match[1] || '').trim();
      const start = match.index;

      if (start > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, start)));
      }

      if (glossary.has(rawTerm)) {
        const termNode = document.createElement('span');
        termNode.className = 'keyword-term';
        termNode.setAttribute('role', 'button');
        termNode.setAttribute('tabindex', '0');
        termNode.setAttribute('aria-haspopup', 'dialog');
        termNode.setAttribute('data-glossary-term', rawTerm);
        termNode.textContent = rawTerm;
        frag.appendChild(termNode);
      } else {
        frag.appendChild(document.createTextNode(fullMatch));
      }

      lastIdx = start + fullMatch.length;
    }

    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    textNode.parentNode.replaceChild(frag, textNode);
  });

  const termNodes = contentRoot.querySelectorAll('.keyword-term[data-glossary-term]');
  if (!termNodes.length) return;

  const card = document.createElement('div');
  card.className = 'keyword-hover-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML = '<div class="keyword-hover-title"></div><div class="keyword-hover-brief"></div>';
  document.body.appendChild(card);

  const cardTitle = card.querySelector('.keyword-hover-title');
  const cardBrief = card.querySelector('.keyword-hover-brief');

  let activeTrigger = null;
  let hideTimer = null;

  const clearHideTimer = () => {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = null;
  };

  const positionCard = (trigger) => {
    const rect = trigger.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const margin = 12;
    const offset = 10;

    let top = rect.bottom + offset;
    if (top + cardRect.height > window.innerHeight - margin) {
      top = rect.top - cardRect.height - offset;
    }

    let left = rect.left + rect.width / 2 - cardRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - cardRect.width - margin));

    card.style.top = `${Math.max(margin, top)}px`;
    card.style.left = `${left}px`;
  };

  const showCard = (trigger) => {
    const term = trigger.getAttribute('data-glossary-term');
    if (!term || !glossary.has(term)) return;

    const item = glossary.get(term);
    cardTitle.textContent = item.title;
    cardBrief.textContent = item.brief;

    activeTrigger = trigger;
    card.classList.add('is-visible');
    card.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');

    positionCard(trigger);
  };

  const hideCard = () => {
    if (activeTrigger) {
      activeTrigger.setAttribute('aria-expanded', 'false');
    }
    activeTrigger = null;
    card.classList.remove('is-visible');
    card.setAttribute('aria-hidden', 'true');
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      hideCard();
    }, 120);
  };

  termNodes.forEach((node) => {
    node.addEventListener('mouseenter', () => {
      if (!window.matchMedia('(hover: hover)').matches) return;
      clearHideTimer();
      showCard(node);
    });

    node.addEventListener('mouseleave', () => {
      if (!window.matchMedia('(hover: hover)').matches) return;
      scheduleHide();
    });

    node.addEventListener('focus', () => {
      clearHideTimer();
      showCard(node);
    });

    node.addEventListener('blur', () => {
      scheduleHide();
    });

    node.addEventListener('click', (e) => {
      e.preventDefault();
      clearHideTimer();
      if (activeTrigger === node && card.classList.contains('is-visible')) {
        hideCard();
        return;
      }
      showCard(node);
    });

    node.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (activeTrigger === node && card.classList.contains('is-visible')) {
        hideCard();
      } else {
        showCard(node);
      }
    });
  });

  card.addEventListener('mouseenter', clearHideTimer);
  card.addEventListener('mouseleave', scheduleHide);

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.keyword-hover-card')) return;
    if (target.closest('.keyword-term')) return;
    hideCard();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCard();
  });

  window.addEventListener('resize', () => {
    if (activeTrigger && card.classList.contains('is-visible')) {
      positionCard(activeTrigger);
    }
  });

  window.addEventListener('scroll', () => {
    if (activeTrigger && card.classList.contains('is-visible')) {
      positionCard(activeTrigger);
    }
  }, { passive: true });
});
