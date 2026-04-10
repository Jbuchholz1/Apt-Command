let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  getContainer().appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
