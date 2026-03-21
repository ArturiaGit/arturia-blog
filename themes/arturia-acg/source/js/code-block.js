/* ==========================================================================
   代码块 DOM 逻辑终极稳定版 (Arturia 主题深度融合版)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('figure.highlight').forEach(block => {
    if (block.querySelector('.code-console-header')) return;

    const lang = Array.from(block.classList).find(c => c !== 'highlight') || 'CODE';

    const header = document.createElement('div');
    header.className = 'code-console-header';
    header.innerHTML = `
      <div class="code-console-left">
        <span class="code-console-dots">
          <div></div><div></div><div></div>
        </span>
        <span class="code-language-tag">${lang}</span>
      </div>
      <button class="code-copy-btn" type="button">复制代码</button>
    `;

    block.insertBefore(header, block.firstChild);

    const copyBtn = header.querySelector('.code-copy-btn');
    copyBtn.addEventListener('click', () => {
      const codePre = block.querySelector('.code pre');
      if (!codePre) return;

      navigator.clipboard.writeText(codePre.innerText).then(() => {
        copyBtn.innerText = '已复制!';
        setTimeout(() => {
          copyBtn.innerText = '复制代码';
        }, 2000);
      });
    });
  });
});
