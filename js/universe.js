// Keep the laboratory in memory while visiting the separate world runtime.
(() => {
    const entry = document.getElementById('enter-universe');
    const bliss = document.getElementById('enter-bliss');
    const cloudreach = document.getElementById('enter-cloudreach');
    let cover;
    let universeHistory = false;
    const worldUrl = new URL('hollowmere/prototype.html', location.href);
    bliss?.addEventListener('click', () => { location.href = new URL('bliss/', location.href).href; });
    cloudreach?.addEventListener('click', () => { location.href = new URL('cloudreach/', location.href).href; });
    const origin = worldUrl.origin;
    function leave() {
        if (!cover) return;
        cover.remove(); cover = null;
        const wasHistory = universeHistory; universeHistory = false;
        if (wasHistory && !arguments[0]) history.back();
        if (window.__sim) { window.__sim.universeOpen = false; window.__sim.clock.getDelta(); }
        entry.focus();
    }
    entry.addEventListener('click', () => {
        if (cover) return;
        cover = document.createElement('div');
        cover.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#09110f';
        const frame = document.createElement('iframe');
        frame.title = 'Hollowmere Universe';
        frame.src = worldUrl.href;
        frame.style.cssText = 'width:100%;height:100%;border:0';
        const back = document.createElement('button');
        back.textContent = '←';
        back.setAttribute('aria-label', 'Back to simulation');
        back.title = 'Back to simulation';
        back.style.cssText = 'position:absolute;top:max(16px,env(safe-area-inset-top));left:16px;width:44px;height:44px;padding:0;background:#10231fee;color:#d8e3d8;border:1px solid #aac8b9;border-radius:50%;font:20px system-ui;cursor:pointer;-webkit-tap-highlight-color:transparent';
        back.onclick = leave;
        cover.append(frame, back); document.body.append(cover);
        history.pushState({ universe: true }, '', '#universe'); universeHistory = true;
        if (window.__sim) window.__sim.universeOpen = true;
        back.focus();
    });
    window.addEventListener('message', event => {
        if (cover && event.origin === origin && event.source === cover.querySelector('iframe').contentWindow && event.data === 'leave-universe') leave();
    });
    window.addEventListener('popstate', () => { if (cover) leave(true); });
})();
