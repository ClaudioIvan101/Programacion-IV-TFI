export function publicFormLink(location, formId) {
  const url = new URL(location);
  url.search = '';
  url.hash = '/formulario/' + encodeURIComponent(formId);
  const host = url.hostname.toLowerCase();
  const localOnly = host === 'localhost' || host === '[::1]' || /^127\.(?:\d+\.){2}\d+$/.test(host);
  return { href: url.href, localOnly };
}
