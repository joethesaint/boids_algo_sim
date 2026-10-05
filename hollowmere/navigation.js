(() => {
    const panel = document.getElementById('controls');
    panel.hidden = true;
    const toggle = document.createElement('button');
    toggle.id = 'menu-toggle';
    toggle.setAttribute('aria-controls', 'controls');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open world controls');
    toggle.innerHTML = '<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="18" cy="18" r="4"/><ellipse cx="18" cy="18" rx="16" ry="7" transform="rotate(-35 18 18)"/><circle cx="29" cy="10" r="2" fill="#e9b872" stroke="none"/></svg>';
    document.body.append(toggle);
    let suppressClick = false;
    let menuPositioned = false;
    function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
    function placeToggle(x, y) {
        const rect = toggle.getBoundingClientRect();
        menuPositioned = true;
        toggle.style.left = `${clamp(x, 12, innerWidth - rect.width - 12)}px`;
        toggle.style.top = `${clamp(y, 12, innerHeight - rect.height - 12)}px`;
        toggle.style.right = 'auto'; toggle.style.bottom = 'auto';
        positionPanel();
    }
    function positionPanel() {
        if (panel.hidden) return;
        const button = toggle.getBoundingClientRect();
        const box = panel.getBoundingClientRect();
        const left = clamp(button.left, 12, innerWidth - box.width - 12);
        const below = button.bottom + 12;
        const top = below + box.height <= innerHeight - 12 ? below : clamp(button.top - box.height - 12, 12, innerHeight - box.height - 12);
        panel.style.left = `${left}px`; panel.style.top = `${top}px`; panel.style.right = 'auto'; panel.style.bottom = 'auto';
    }
    function openMenu(open, returnFocus = true) {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close world controls' : 'Open world controls');
        const c = controls();
        if (c) { c.keys.clear(); c.vel.set(0,0,0); }
        if (open) { positionPanel(); panel.querySelector('button').focus(); }
        else if (returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', event => {
        if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
        openMenu(panel.hidden);
    });
    toggle.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
        const step = 24, rect = toggle.getBoundingClientRect();
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        placeToggle(rect.left + dx, rect.top + dy); event.preventDefault();
    });
    let pointer = null;
    toggle.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const rect = toggle.getBoundingClientRect();
        if (!menuPositioned) placeToggle(rect.left, rect.top);
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: parseFloat(toggle.style.left), top: parseFloat(toggle.style.top), moved: false };
        toggle.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    toggle.addEventListener('pointermove', event => {
        if (!pointer || pointer.id !== event.pointerId) return;
        const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
        if (!pointer.moved && Math.hypot(dx, dy) < 8) return;
        pointer.moved = true; placeToggle(pointer.left + dx, pointer.top + dy); event.preventDefault();
    });
    toggle.addEventListener('pointerup', event => {
        if (!pointer || pointer.id !== event.pointerId) return;
        if (pointer.moved) { suppressClick = true; window.setTimeout(() => { suppressClick = false; }, 500); }
        pointer = null; toggle.releasePointerCapture?.(event.pointerId);
    });
    toggle.addEventListener('pointercancel', () => { pointer = null; });
    // Keep advanced flock controls available without covering the landscape.
    const details = document.createElement('details');
    details.innerHTML = '<summary>Shape the flock</summary>';
    panel.querySelectorAll('.control').forEach(control => details.append(control));
    panel.insertBefore(details, document.getElementById('stats'));
    const help = document.createElement('details');
    help.innerHTML = '<summary>How to explore</summary><p>Touch: drag on the left to move; drag on the right to look. Desktop: WASD to move, drag to look, Q/E to descend or rise. F switches fly/walk. T starts or stops the tour.</p>';
    panel.insertBefore(help, document.getElementById('stats'));
    const back = document.createElement('button');
    back.className = 'back-action';
    back.textContent = '←';
    back.setAttribute('aria-label', 'Back to simulation');
    back.title = 'Back to simulation';
    back.onclick = () => {
        const parentUrl = document.referrer ? new URL(document.referrer) : new URL('../index.html', location.href);
        if (window.parent !== window) window.parent.postMessage('leave-universe', parentUrl.origin);
        else location.href = parentUrl.href;
    };
    panel.append(back);
    const follow = document.createElement('button');
    follow.className = 'follow-action';
    follow.textContent = 'Follow a bird';
    follow.setAttribute('aria-pressed', 'false');
    follow.onclick = () => {
        const flock = boids(); if (!flock) return;
        const active = follow.getAttribute('aria-pressed') !== 'true';
        flock.setFollow(active); follow.setAttribute('aria-pressed', String(active));
        follow.textContent = active ? 'Release bird' : 'Follow a bird';
        if (active) openMenu(false);
    };
    panel.insertBefore(follow, back);
    const guide = document.getElementById('nav-guide');
    const touch = matchMedia('(pointer:coarse)').matches;
    guide.innerHTML = '<i class="gesture"></i>' + (touch ? 'Left side: move · Right side: look' : 'WASD: move · Drag: look · Q / E: rise or descend');
    function bindWorld() {
        const child = frame.contentWindow;
        if (!child || !child.document || child.document.__navigationBound) return;
        child.document.__navigationBound = true;
        child.addEventListener('pointerdown', () => { if (!panel.hidden) openMenu(false, false); });
        child.addEventListener('keydown', e => { if(e.code === 'Escape') openMenu(false); });
    }
    frame.addEventListener('load', bindWorld);
    bindWorld();
    document.addEventListener('keydown', e => { if(e.code === 'Escape') openMenu(false); });
    window.addEventListener('resize', positionPanel);
    setInterval(() => {
        const w = world();
        panel.querySelectorAll('[data-action],[data-style],[data-boid]').forEach(el => el.disabled = !w?.ready);
        if (!w?.ready) return;
        panel.querySelectorAll('[data-action="fly"],[data-action="walk"]').forEach(el => el.setAttribute('aria-pressed', String(w.camera().mode === el.dataset.action)));
    }, 500);
})();
