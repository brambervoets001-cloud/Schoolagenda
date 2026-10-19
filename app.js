// ---- State ----
let items = JSON.parse(localStorage.getItem('agenda_items') || '[]');
let currentTab = 'week';
let currentWeekOffset = 0;
let editId = null;

function saveItems() {
  localStorage.setItem('agenda_items', JSON.stringify(items));
}

// ---- Helpers ----
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDatum(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function isVandaag(dateStr) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function badgeLabel(type) {
  const labels = { toets: '📝 Toets', taak: '📚 Taak', studie: '🧠 Studie', persoonlijk: '🙋 Persoonlijk', smartschool: '🔗 Smartschool' };
  return labels[type] || type;
}

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// ---- Render ----
function render() {
  const content = document.getElementById('content');
  if (currentTab === 'week') renderWeek(content);
  else if (currentTab === 'lijst') renderLijst(content);
  else if (currentTab === 'smartschool') renderSmartschool(content);
}

function renderItemCard(item) {
  const div = document.createElement('div');
  div.className = `item-card ${item.type}`;
  div.innerHTML = `
    <div>
      <div class="item-title">${escapeHtml(item.titel)}</div>
      <div class="item-meta">
        ${item.tijd ? item.tijd + ' · ' : ''}${escapeHtml(item.vak || '')}
        ${item.notitie ? '<br><span style="font-size:0.8rem">' + escapeHtml(item.notitie) + '</span>' : ''}
      </div>
    </div>
    <div style="display:flex;gap:6px;align-items:flex-start">
      <span class="item-badge badge-${item.type}">${badgeLabel(item.type)}</span>
      ${item.type !== 'smartschool' ? `<button class="btn-delete" data-id="${item.id}" title="Verwijderen">🗑</button>` : ''}
    </div>
  `;
  if (item.type !== 'smartschool') {
    div.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete')) return;
      openEditModal(item);
    });
  }
  const del = div.querySelector('.btn-delete');
  if (del) del.addEventListener('click', () => deleteItem(item.id));
  return div;
}

function renderWeek(container) {
  const days = getWeekDates(currentWeekOffset);
  const start = formatDatumShort(days[0]);
  const end = formatDatumShort(days[6]);

  container.innerHTML = `
    <div class="week-nav">
      <button id="prev-week">◀</button>
      <span class="week-label">${start} – ${end}</span>
      <button id="next-week">▶</button>
    </div>
  `;

  document.getElementById('prev-week').addEventListener('click', () => { currentWeekOffset--; render(); });
  document.getElementById('next-week').addEventListener('click', () => { currentWeekOffset++; render(); });

  days.forEach(dateStr => {
    const dayItems = items.filter(i => i.datum === dateStr).sort((a, b) => (a.tijd || '').localeCompare(b.tijd || ''));
    if (dayItems.length === 0 && currentWeekOffset !== 0) return; // toon lege dagen alleen in huidige week bij offset 0... toch altijd tonen

    const groep = document.createElement('div');
    groep.className = 'dag-groep';
    const header = document.createElement('div');
    header.className = 'dag-header' + (isVandaag(dateStr) ? ' vandaag' : '');
    header.textContent = (isVandaag(dateStr) ? '★ Vandaag — ' : '') + formatDatum(dateStr);
    groep.appendChild(header);

    if (dayItems.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#94a3b8;font-size:0.85rem;padding:8px 0';
      empty.textContent = 'Niets gepland';
      groep.appendChild(empty);
    } else {
      dayItems.forEach(item => groep.appendChild(renderItemCard(item)));
    }
    container.appendChild(groep);
  });
}

function renderLijst(container) {
  container.innerHTML = '';

  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px';
  const types = ['alles', 'toets', 'taak', 'studie', 'persoonlijk', 'smartschool'];
  let activeFilter = 'alles';

  types.forEach(t => {
    const btn = document.createElement('button');
    btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    btn.className = t === 'alles' ? 'tab active' : 'tab';
    btn.style.cssText = 'flex:0 0 auto;padding:6px 12px';
    btn.addEventListener('click', () => {
      activeFilter = t;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderLijstItems(listContainer, activeFilter);
    });
    btn.classList.add('filter-btn');
    filterBar.appendChild(btn);
  });

  container.appendChild(filterBar);

  const listContainer = document.createElement('div');
  container.appendChild(listContainer);
  renderLijstItems(listContainer, 'alles');
}

function renderLijstItems(container, filter) {
  container.innerHTML = '';
  const now = new Date().toISOString().slice(0, 10);
  let filtered = items.filter(i => filter === 'alles' || i.type === filter);
  filtered = filtered.sort((a, b) => a.datum.localeCompare(b.datum));

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">Geen items gevonden 📭</div>';
    return;
  }

  // Groepeer per datum
  const perDag = {};
  filtered.forEach(item => {
    if (!perDag[item.datum]) perDag[item.datum] = [];
    perDag[item.datum].push(item);
  });

  Object.keys(perDag).sort().forEach(dateStr => {
    const groep = document.createElement('div');
    groep.className = 'dag-groep';
    const header = document.createElement('div');
    const isPast = dateStr < now;
    header.className = 'dag-header' + (isVandaag(dateStr) ? ' vandaag' : '');
    header.style.opacity = isPast ? '0.5' : '1';
    header.textContent = (isVandaag(dateStr) ? '★ Vandaag — ' : '') + formatDatum(dateStr);
    groep.appendChild(header);
    perDag[dateStr].forEach(item => {
      const card = renderItemCard(item);
      if (dateStr < now) card.style.opacity = '0.5';
      groep.appendChild(card);
    });
    container.appendChild(groep);
  });
}

function renderSmartschool(container) {
  container.innerHTML = `
    <div style="text-align:center;padding:32px 16px">
      <div style="font-size:3rem;margin-bottom:12px">🔗</div>
      <h2 style="margin-bottom:8px">Smartschool koppelen</h2>
      <p style="color:#64748b;margin-bottom:24px;font-size:0.95rem">Importeer je Smartschool agenda via een .ics export bestand.</p>
      <button id="btn-open-ss" class="btn-primary">Importeer .ics bestand</button>
      <div style="margin-top:24px">
        <strong>${items.filter(i => i.type === 'smartschool').length}</strong> Smartschool items geladen
      </div>
    </div>
  `;
  document.getElementById('btn-open-ss').addEventListener('click', () => {
    document.getElementById('ss-modal').classList.remove('hidden');
  });
}

function formatDatumShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"');
}

// ---- Modal ----
function openAddModal() {
  editId = null;
  document.getElementById('modal-title').textContent = 'Nieuw item toevoegen';
  document.getElementById('item-form').reset();
  // Zet datum op vandaag
  document.querySelector('[name=datum]').value = new Date().toISOString().slice(0, 10);
  document.getElementById('modal').classList.remove('hidden');
}

function openEditModal(item) {
  editId = item.id;
  document.getElementById('modal-title').textContent = 'Item bewerken';
  const form = document.getElementById('item-form');
  form.querySelector('[name=type]').value = item.type;
  form.querySelector('[name=titel]').value = item.titel;
  form.querySelector('[name=datum]').value = item.datum;
  form.querySelector('[name=tijd]').value = item.tijd || '';
  form.querySelector('[name=vak]').value = item.vak || '';
  form.querySelector('[name=notitie]').value = item.notitie || '';
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  editId = null;
}

function deleteItem(id) {
  if (!confirm('Item verwijderen?')) return;
  items = items.filter(i => i.id !== id);
  saveItems();
  render();
}

// ---- Form submit ----
document.getElementById('item-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const data = {
    id: editId || genId(),
    type: form.type.value,
    titel: form.titel.value.trim(),
    datum: form.datum.value,
    tijd: form.tijd.value,
    vak: form.vak.value.trim(),
    notitie: form.notitie.value.trim(),
  };
  if (editId) {
    items = items.map(i => i.id === editId ? data : i);
  } else {
    items.push(data);
  }
  saveItems();
  closeModal();
  render();
});

// ---- Tabs ----
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (!tab) return;
    document.querySelectorAll('.tab[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = tab;
    render();
  });
});

// ---- Knoppen ----
document.getElementById('btn-add').addEventListener('click', openAddModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('btn-ss-cancel').addEventListener('click', () => {
  document.getElementById('ss-modal').classList.add('hidden');
});
document.getElementById('btn-ss-clear').addEventListener('click', () => {
  if (!confirm('Alle Smartschool items verwijderen?')) return;
  items = items.filter(i => i.type !== 'smartschool');
  saveItems();
  document.getElementById('ss-status').textContent = 'Smartschool items verwijderd.';
  render();
});

// Sluit modal bij klik buiten modal-box
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal')) closeModal();
});

// ---- ICS import ----
document.getElementById('ics-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const parsed = parseICS(ev.target.result);
    // Verwijder oude smartschool items en voeg nieuwe toe
    items = items.filter(i => i.type !== 'smartschool');
    items = items.concat(parsed);
    saveItems();
    document.getElementById('ss-status').textContent = `✅ ${parsed.length} items geïmporteerd van Smartschool!`;
    render();
  };
  reader.readAsText(file);
});

function parseICS(text) {
  const events = [];
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;
  while ((match = veventRegex.exec(text)) !== null) {
    const block = match[1];
    const get = (key) => {
      const m = block.match(new RegExp(key + '[^:]*:(.+)'));
      return m ? m[1].replace(/\r/g, '').trim() : '';
    };
    const dtstart = get('DTSTART');
    const datum = parseDateFromICS(dtstart);
    const tijd = parseTimeFromICS(dtstart);
    const titel = get('SUMMARY').replace(/\\n/g, ' ').replace(/\\,/g, ',') || 'Smartschool item';
    const notitie = get('DESCRIPTION').replace(/\\n/g, '\n').replace(/\\,/g, ',');
    if (datum) {
      events.push({ id: genId(), type: 'smartschool', titel, datum, tijd, vak: '', notitie });
    }
  }
  return events;
}

function parseDateFromICS(dtstr) {
  if (!dtstr) return null;
  const clean = dtstr.replace(/[TZ]/g, '').slice(0, 8);
  if (clean.length < 8) return null;
  return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`;
}

function parseTimeFromICS(dtstr) {
  if (!dtstr || !dtstr.includes('T')) return '';
  const t = dtstr.replace(/Z$/, '').split('T')[1];
  if (!t || t.length < 4) return '';
  return `${t.slice(0,2)}:${t.slice(2,4)}`;
}

// ---- Service Worker registratie ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Init
render();
