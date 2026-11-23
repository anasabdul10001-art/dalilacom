(() => {
  const $ = (s, r = document) => r.querySelector(s);
  // الوضع الليلي
  const themeBtn = $('#theme');
  themeBtn?.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  });
  // العودة للأعلى + شريط تقدم القراءة
  const top = $('#top'), bar = $('#progress'), art = $('.article .prose');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      top?.classList.toggle('show', scrollY > 700);
      if (art && bar) {
        const r = art.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (r.height + innerHeight * .5)));
        bar.style.transform = `scaleX(${p})`;
      }
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  top?.addEventListener('click', () => scrollTo({ top: 0 }));
  // مشاركة
  const share = $('.share');
  if (share) {
    const { url, title } = share.dataset;
    $('[data-copy]', share)?.addEventListener('click', async (e) => {
      if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (err) { if (err.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(url); e.currentTarget.title = 'تم النسخ'; e.currentTarget.textContent = '✓'; } catch (err) { prompt('انسخ الرابط', url); }
    });
  }
  // الإعلانات: تُجلب بعد التحميل ليبقى كاش الصفحات فعّالاً
  document.querySelectorAll('[data-ad]').forEach(async (el) => {
    try {
      const { ad } = await (await fetch(`/api/v1/ads?placement=${el.dataset.ad}`)).json();
      if (!ad) { el.classList.add('ad-house'); el.innerHTML = '<a href="/page/contact"><b>أعلن هنا</b><span>مساحة إعلانية للبيع — تواصل معنا</span></a>'; return; }
      const inner = ad.kind === 'html' ? ad.html : `<img src="${ad.imageUrl}" alt="${ad.name.replace(/"/g, '')}" loading="lazy" style="max-width:100%;height:auto">`;
      el.innerHTML = '<small>إعلان</small>' + (ad.linkUrl && ad.kind !== 'html' ? `<a href="${ad.linkUrl}" target="_blank" rel="sponsored noopener">${inner}</a>` : inner);
    } catch (e) { /* ignore */ }
  });
})();
