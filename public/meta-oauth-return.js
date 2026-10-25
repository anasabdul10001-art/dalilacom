const link = document.querySelector('a[data-auto-redirect="true"]');
if (link instanceof HTMLAnchorElement) {
  window.setTimeout(() => window.location.replace(link.href), 1200);
}
