document.addEventListener('DOMContentLoaded', () => {
  const contentRoot = document.querySelector('.post-content');
  if (!contentRoot) return;

  const images = Array.from(contentRoot.querySelectorAll('img')).filter((img) => !img.closest('a'));
  if (!images.length) return;

  const viewer = document.createElement('div');
  viewer.className = 'post-image-viewer';
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-modal', 'true');
  viewer.setAttribute('aria-hidden', 'true');
  viewer.innerHTML = `
    <button class="post-image-viewer-close" type="button" aria-label="关闭图片预览">
      <i class="fas fa-xmark"></i>
    </button>
    <img alt="" />
  `;
  document.body.appendChild(viewer);

  const viewerImg = viewer.querySelector('img');
  const closeBtn = viewer.querySelector('.post-image-viewer-close');
  let activeTrigger = null;
  let previousOverflow = '';

  const closeViewer = () => {
    viewer.classList.remove('is-active');
    viewer.setAttribute('aria-hidden', 'true');
    viewerImg.removeAttribute('src');
    viewerImg.removeAttribute('srcset');
    viewer.style.removeProperty('--viewer-image-width');
    document.body.style.overflow = previousOverflow;

    if (activeTrigger) {
      activeTrigger.focus({ preventScroll: true });
    }
    activeTrigger = null;
  };

  const openViewer = (img) => {
    activeTrigger = img;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    viewerImg.src = img.currentSrc || img.src;
    if (img.srcset) viewerImg.srcset = img.srcset;
    viewerImg.alt = img.alt || '文章插图预览';

    const naturalWidth = img.naturalWidth || img.clientWidth || window.innerWidth;
    viewer.style.setProperty('--viewer-image-width', `${naturalWidth}px`);
    viewer.classList.add('is-active');
    viewer.setAttribute('aria-hidden', 'false');
    closeBtn.focus({ preventScroll: true });
  };

  images.forEach((img) => {
    img.classList.add('post-image-viewer-trigger');
    img.setAttribute('role', 'button');
    img.setAttribute('tabindex', '0');
    img.setAttribute('aria-label', img.alt ? `放大查看图片：${img.alt}` : '放大查看文章插图');

    img.addEventListener('click', () => openViewer(img));
    img.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openViewer(img);
    });
  });

  closeBtn.addEventListener('click', closeViewer);

  viewer.addEventListener('click', (event) => {
    if (event.target === viewer || event.target === viewerImg) {
      closeViewer();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && viewer.classList.contains('is-active')) {
      closeViewer();
    }
  });
});
