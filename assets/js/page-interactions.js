const keywordSelector = '.about-intro strong, .about-intro a, .about-intro .keyword, .news-text .news-highlight, .experience-advisor a, .homepage-content > ul strong';
document.querySelectorAll(keywordSelector).forEach(element => element.classList.add('keyword-highlight'));

const cursor = document.createElement('div');
cursor.className = 'cursor-dot';
cursor.setAttribute('aria-hidden', 'true');
document.body.append(cursor);
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
function hideCursor() {
  document.body.classList.remove('has-dot-cursor');
}
document.addEventListener('pointermove', event => {
  if (!finePointer.matches || event.pointerType === 'touch') return hideCursor();
  cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
  cursor.classList.toggle('is-interactive', !!event.target.closest('a, button, .keyword-highlight'));
  document.body.classList.add('has-dot-cursor');
}, { passive: true });
document.addEventListener('pointerdown', () => cursor.classList.add('is-pressed'), { passive: true });
document.addEventListener('pointerup', () => cursor.classList.remove('is-pressed'), { passive: true });
document.documentElement.addEventListener('pointerleave', hideCursor);
window.addEventListener('blur', hideCursor);
finePointer.addEventListener('change', hideCursor);
