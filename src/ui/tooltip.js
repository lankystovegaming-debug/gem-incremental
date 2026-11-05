// One portaled tooltip per shell icon control; the control retains its label.
let sequence = 0;
export function mountTooltip(control, label) {
  let tip;
  const previous = control.getAttribute('aria-describedby');
  function hide() {
    tip?.remove(); tip = null;
    if (previous) control.setAttribute('aria-describedby', previous);
    else control.removeAttribute('aria-describedby');
  }
  function show() {
    if (tip || !matchMedia('(hover: hover)').matches) return;
    tip = document.createElement('div');
    tip.className = 'control-tooltip'; tip.id = `controlTooltip${++sequence}`;
    tip.setAttribute('role', 'tooltip'); tip.textContent = label;
    document.body.append(tip);
    const rect = control.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.min(rect.bottom + 8, innerHeight - tip.offsetHeight - 8)}px`;
    control.setAttribute('aria-describedby', [previous, tip.id].filter(Boolean).join(' '));
  }
  control.addEventListener('mouseenter', show);
  control.addEventListener('focus', show);
  control.addEventListener('mouseleave', hide);
  control.addEventListener('blur', hide);
  control.addEventListener('click', hide);
  control.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}
