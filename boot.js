const status = document.getElementById('status');
import('./app.js?v=0.9.1').catch(err => {
  console.error('Career Legacy startup failed', err);
  if (status) { status.classList.add('error'); status.textContent = 'Az alkalmazás nem indult el (V0.9.1): ' + (err?.message || String(err)); }
});
