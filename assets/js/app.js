import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// ── Firebase Configuration ─────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyApZEcB7Al_TZ_KLFAdW-QrEBdjlKwQlIw",
  authDomain: "donation-tracker-6e56e.firebaseapp.com",
  projectId: "donation-tracker-6e56e",
  storageBucket: "donation-tracker-6e56e.firebasestorage.app",
  messagingSenderId: "75216591260",
  appId: "1:75216591260:web:d2e73d4b708ff49c60d059",
  measurementId: "G-8Y3ZT5S3NN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ── Icon & Keyword Helper ──────────────────────────────────
const ICON_MAP = [
  { keywords: ['puja', 'pooja', 'durga', 'kali', 'saraswati', 'lakshmi'], emoji: '🪔', label: 'Puja' },
  { keywords: ['temple', 'mandir', 'church', 'mosque', 'gurudwara'], emoji: '⛩️', label: 'Temple' },
  { keywords: ['eid', 'ramzan', 'ramadan'], emoji: '🌙', label: 'Eid' },
  { keywords: ['christmas', 'xmas'], emoji: '🎄', label: 'Christmas' },
  { keywords: ['diwali', 'deepawali'], emoji: '🎆', label: 'Diwali' },
  { keywords: ['holi'], emoji: '🎨', label: 'Holi' },
  { keywords: ['tagore', 'rabindra', 'rabindranath'], emoji: '🎵', label: 'Rabindra Jayanti' },
  { keywords: ['gandhi', 'netaji', 'ambedkar', 'vivekananda', 'jayanti'], emoji: '🕊️', label: 'Jayanti' },
  { keywords: ['birthday', 'bday'], emoji: '🎂', label: 'Birthday' },
  { keywords: ['wedding', 'marriage', 'vivah'], emoji: '💍', label: 'Wedding' },
  { keywords: ['school', 'college', 'education', 'study'], emoji: '📚', label: 'Education' },
  { keywords: ['flood', 'relief', 'help', 'charity'], emoji: '🤝', label: 'Relief' },
  { keywords: ['hospital', 'medical', 'health'], emoji: '🏥', label: 'Medical' },
  { keywords: ['sport', 'cricket', 'football'], emoji: '🏆', label: 'Sports' },
  { keywords: ['fund', 'donation', 'collection', 'chanda'], emoji: '💰', label: 'Fund' },
];

function getEventIcon(name = '') {
  const lower = name.toLowerCase();
  for (const item of ICON_MAP) {
    if (item.keywords.some(k => lower.includes(k))) return item;
  }
  return { emoji: '🎪', label: 'Event' };
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ── State ──────────────────────────────────────────────────
let events = [];
let records = {}; // { [eventId]: records[] }
let activeEventId = null;
let activeCategory = 'all';
let searchQuery = '';
let currentRecordMode = 'income'; // 'income' | 'expense'
let currentPaymentMode = 'offline'; // 'offline' | 'online'
let activeRecordTab = 'donations'; // 'donations' | 'expenses'
let qrCodeInstance = null;

// Categories list
const CATEGORIES = [
  { key: 'all', emoji: '📋', label: 'All' },
  { key: 'puja', emoji: '🪔', label: 'Puja' },
  { key: 'education', emoji: '📚', label: 'Education' },
  { key: 'relief', emoji: '🤝', label: 'Charity' },
  { key: 'medical', emoji: '🏥', label: 'Health' },
  { key: 'fund', emoji: '💰', label: 'Fund' },
  { key: 'sport', emoji: '🏆', label: 'Sports' },
];

// ── DOM Elements ───────────────────────────────────────────
const homeView = document.getElementById('home-view');
const detailView = document.getElementById('detail-view');
const eventsList = document.getElementById('events-list');
const searchInput = document.getElementById('search-input');
const categoriesContainer = document.getElementById('categories-container');

// Modals
const modalCreateEvent = document.getElementById('modal-create-event');
const modalAddEntry = document.getElementById('modal-add-entry');

// ── Realtime Firebase Sync ─────────────────────────────────
function initFirebaseSync() {
  const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
  eventsUnsubscribe = onSnapshot(q, (snapshot) => {
    events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
    }));
    
    // Clear old records unsubscribers before re-subscribing
    recordsUnsubscribers.forEach(u => u());
    recordsUnsubscribers = [];

    // Sync records for all events
    events.forEach(evt => {
      const recQuery = query(collection(db, 'events', evt.id, 'records'), orderBy('date', 'desc'));
      const unsub = onSnapshot(recQuery, (recSnap) => {
        records[evt.id] = recSnap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          date: d.data().date?.toDate?.()?.toISOString() || new Date().toISOString()
        }));
        render();
      }, (err) => {
        console.error("Error listening records for " + evt.id + ":", err);
      });
      recordsUnsubscribers.push(unsub);
    });

    render();
  }, (err) => {
    console.error("Error listening events:", err);
    eventsList.innerHTML = `
      <div class="empty-state">
        <div class="ei">⚠️</div>
        <p style="color:var(--danger); font-weight:600;">Firebase Connection Error</p>
        <p style="font-size:12px; color:var(--text-3); margin-top:4px;">${err.message || 'Permission denied or network issue'}</p>
      </div>`;
  });
}

// ── Calculations ───────────────────────────────────────────
function getSummary(eventId) {
  const recs = records[eventId] || [];
  const income = recs.filter(r => r.type === 'income').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const expense = recs.filter(r => r.type === 'expense').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return { income, expense, balance: income - expense };
}

// ── Rendering Functions ────────────────────────────────────
function renderCategories() {
  categoriesContainer.innerHTML = CATEGORIES.map(cat => `
    <div class="category-chip ${activeCategory === cat.key ? 'active' : ''}" data-cat="${cat.key}">
      <div class="chip-icon">${cat.emoji}</div>
      <div class="chip-text">${cat.label}</div>
    </div>
  `).join('');

  categoriesContainer.querySelectorAll('.category-chip').forEach(el => {
    el.addEventListener('click', () => {
      activeCategory = el.dataset.cat;
      renderCategories();
      renderHomeEvents();
    });
  });
}

function renderHomeEvents() {
  let filtered = events;
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(e => e.name.toLowerCase().includes(q));
  }
  if (activeCategory !== 'all') {
    filtered = filtered.filter(e => e.name.toLowerCase().includes(activeCategory));
  }

  if (filtered.length === 0) {
    eventsList.innerHTML = `
      <div class="empty-state">
        <div class="ei">🔍</div>
        <p>No events found</p>
      </div>`;
    return;
  }

  eventsList.innerHTML = filtered.map((e, idx) => {
    const icon = getEventIcon(e.name);
    const summary = getSummary(e.id);
    const balanceClass = summary.balance >= 0 ? 'positive' : 'negative';
    return `
      <div class="event-card" data-id="${e.id}" style="--i: ${idx}">
        <div class="event-icon">${icon.emoji}</div>
        <div class="event-info">
          <div class="event-name">${escapeHtml(e.name)}</div>
          <div class="event-meta">
            Balance: <span class="event-balance ${balanceClass}">${formatCurrency(summary.balance)}</span>
          </div>
        </div>
        <div style="font-size:18px; color:var(--text-3); margin-left:auto;">›</div>
      </div>
    `;
  }).join('');

  eventsList.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      openDetail(card.dataset.id);
    });
  });
}

function renderDetail() {
  const currentEvent = events.find(e => e.id === activeEventId);
  if (!currentEvent) {
    navigateHome();
    return;
  }

  const icon = getEventIcon(currentEvent.name);
  const summary = getSummary(activeEventId);
  const recs = records[activeEventId] || [];

  document.getElementById('detail-event-name').textContent = currentEvent.name;
  document.getElementById('detail-event-meta').textContent = `Tap to rename · ${icon.label}`;
  document.getElementById('detail-event-emoji').textContent = icon.emoji;

  document.getElementById('summary-collected').textContent = formatCurrency(summary.income);
  document.getElementById('summary-expenses').textContent = formatCurrency(summary.expense);
  document.getElementById('summary-balance').textContent = formatCurrency(summary.balance);

  const donations = recs.filter(r => r.type === 'income').sort((a,b) => new Date(b.date) - new Date(a.date));
  const expenses = recs.filter(r => r.type === 'expense').sort((a,b) => new Date(b.date) - new Date(a.date));

  document.getElementById('records-count-text').textContent = `${recs.length} record${recs.length !== 1 ? 's' : ''}`;
  document.getElementById('count-donations').textContent = donations.length;
  document.getElementById('count-expenses').textContent = expenses.length;
  document.getElementById('badge-donations-count').textContent = donations.length;
  document.getElementById('badge-expenses-count').textContent = expenses.length;

  // Render Donations List
  const donationsEl = document.getElementById('donations-list');
  if (donations.length === 0) {
    donationsEl.innerHTML = `<div class="empty-state"><div class="ei">📭</div><p>No donations yet</p></div>`;
  } else {
    donationsEl.innerHTML = donations.map(r => `
      <div class="record-item">
        <div class="record-dot income"></div>
        <div style="flex:1; min-width:0;">
          <div class="record-name">${escapeHtml(r.name)}</div>
          <div class="record-date">
            ${formatDate(r.date)}
            ${r.paymentMode === 'online' ? '<span class="badge online" style="margin-left:6px;">online</span>' : ''}
          </div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div class="record-amount income">+${formatCurrency(r.amount)}</div>
          <button class="icon-btn danger btn-del-rec" data-rid="${r.id}" style="width:26px; height:26px; font-size:12px; margin-top:4px;">✕</button>
        </div>
      </div>
    `).join('');
  }

  // Render Expenses List
  const expensesEl = document.getElementById('expenses-list');
  if (expenses.length === 0) {
    expensesEl.innerHTML = `<div class="empty-state"><div class="ei">📭</div><p>No expenses yet</p></div>`;
  } else {
    expensesEl.innerHTML = expenses.map(r => `
      <div class="record-item">
        <div class="record-dot expense"></div>
        <div style="flex:1; min-width:0;">
          <div class="record-name">${escapeHtml(r.name)}</div>
          <div class="record-date">${formatDate(r.date)}</div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div class="record-amount expense">−${formatCurrency(r.amount)}</div>
          <button class="icon-btn danger btn-del-rec" data-rid="${r.id}" style="width:26px; height:26px; font-size:12px; margin-top:4px;">✕</button>
        </div>
      </div>
    `).join('');
  }

  // Attach Delete Handlers
  document.querySelectorAll('.btn-del-rec').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (confirm('Delete this record?')) {
        await deleteDoc(doc(db, 'events', activeEventId, 'records', btn.dataset.rid));
      }
    });
  });
}

function render() {
  if (activeEventId) {
    renderDetail();
  } else {
    renderHomeEvents();
  }
}

// ── Navigation ─────────────────────────────────────────────
function openDetail(eventId) {
  activeEventId = eventId;
  homeView.style.display = 'none';
  detailView.style.display = 'block';
  window.scrollTo(0, 0);
  renderDetail();
}

function navigateHome() {
  activeEventId = null;
  detailView.style.display = 'none';
  homeView.style.display = 'block';
  window.scrollTo(0, 0);
  renderHomeEvents();
}

// ── Search & Filter ────────────────────────────────────────
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderHomeEvents();
});

// ── Event Creation Modal ───────────────────────────────────
document.getElementById('btn-open-create-modal').addEventListener('click', () => {
  document.getElementById('new-event-name').value = '';
  document.getElementById('new-event-upi').value = '';
  document.getElementById('create-icon-preview').textContent = '🎪';
  modalCreateEvent.style.display = 'flex';
});

document.getElementById('btn-cancel-create').addEventListener('click', () => {
  modalCreateEvent.style.display = 'none';
});

document.getElementById('new-event-name').addEventListener('input', (e) => {
  const icon = getEventIcon(e.target.value);
  document.getElementById('create-icon-preview').textContent = icon.emoji;
});

document.getElementById('form-create-event').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('new-event-name').value.trim();
  const upiId = document.getElementById('new-event-upi').value.trim();
  if (!name) return;

  const docRef = await addDoc(collection(db, 'events'), {
    name,
    upiId,
    createdAt: serverTimestamp()
  });

  modalCreateEvent.style.display = 'none';
  openDetail(docRef.id);
});

// ── Rename Event ───────────────────────────────────────────
const titleDisplay = document.getElementById('event-title-display');
const titleEdit = document.getElementById('event-title-edit');
const renameInput = document.getElementById('detail-rename-input');

titleDisplay.addEventListener('click', () => {
  const ev = events.find(e => e.id === activeEventId);
  if (!ev) return;
  renameInput.value = ev.name;
  titleDisplay.style.display = 'none';
  titleEdit.style.display = 'flex';
  renameInput.focus();
});

document.getElementById('btn-save-rename').addEventListener('click', saveRename);
renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveRename();
  if (e.key === 'Escape') {
    titleEdit.style.display = 'none';
    titleDisplay.style.display = 'block';
  }
});

async function saveRename() {
  const newName = renameInput.value.trim();
  if (newName && activeEventId) {
    await updateDoc(doc(db, 'events', activeEventId), { name: newName });
  }
  titleEdit.style.display = 'none';
  titleDisplay.style.display = 'block';
}

// ── Delete Entire Event ────────────────────────────────────
document.getElementById('nav-btn-delete-event').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete this event and all its records?')) return;
  const evId = activeEventId;
  navigateHome();

  // Delete records
  const recSnap = await getDocs(collection(db, 'events', evId, 'records'));
  await Promise.all(recSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'events', evId));
});

// ── Add Record Modal ───────────────────────────────────────
function openAddEntryModal() {
  const ev = events.find(e => e.id === activeEventId);
  if (!ev) return;

  const icon = getEventIcon(ev.name);
  document.getElementById('entry-event-icon').textContent = icon.emoji;
  document.getElementById('entry-modal-event-name').textContent = ev.name;
  document.getElementById('entry-name-input').value = '';
  document.getElementById('entry-amount-input').value = '';
  
  // Set default mode
  setRecordMode('income');
  setPaymentMode('offline');

  modalAddEntry.style.display = 'flex';
}

const fabAdd = document.getElementById('fab-add-entry');
if (fabAdd) fabAdd.addEventListener('click', openAddEntryModal);

const btnHeaderAdd = document.getElementById('btn-header-add-entry');
if (btnHeaderAdd) btnHeaderAdd.addEventListener('click', openAddEntryModal);

document.getElementById('btn-close-entry-modal').addEventListener('click', () => {
  modalAddEntry.style.display = 'none';
});
document.getElementById('btn-cancel-entry').addEventListener('click', () => {
  modalAddEntry.style.display = 'none';
});

// Mode switch (Income / Expense)
const segIncome = document.getElementById('seg-income');
const segExpense = document.getElementById('seg-expense');
const paymentChips = document.getElementById('income-payment-chips');

segIncome.addEventListener('click', () => setRecordMode('income'));
segExpense.addEventListener('click', () => setRecordMode('expense'));

function setRecordMode(mode) {
  currentRecordMode = mode;
  if (mode === 'income') {
    segIncome.className = 'seg-btn active success';
    segExpense.className = 'seg-btn';
    paymentChips.style.display = 'flex';
    document.getElementById('lbl-entry-name').textContent = 'Donor Name';
  } else {
    segExpense.className = 'seg-btn active danger';
    segIncome.className = 'seg-btn';
    paymentChips.style.display = 'none';
    document.getElementById('lbl-entry-name').textContent = 'Expense Description';
    setPaymentMode('offline');
  }
}

// Payment Mode switch (Cash / Online)
const chipOffline = document.getElementById('chip-offline');
const chipOnline = document.getElementById('chip-online');
const formAddEntry = document.getElementById('form-add-entry');
const sectionUpiQr = document.getElementById('section-upi-qr');

chipOffline.addEventListener('click', () => setPaymentMode('offline'));
chipOnline.addEventListener('click', () => setPaymentMode('online'));

function setPaymentMode(pm) {
  currentPaymentMode = pm;
  if (pm === 'offline') {
    chipOffline.className = 'payment-chip active';
    chipOnline.className = 'payment-chip';
    formAddEntry.style.display = 'block';
    sectionUpiQr.style.display = 'none';
  } else {
    chipOnline.className = 'payment-chip active';
    chipOffline.className = 'payment-chip';
    formAddEntry.style.display = 'none';
    sectionUpiQr.style.display = 'block';
    setupUPIFlow();
  }
}

// Preset Amount Chips
document.querySelectorAll('.amount-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('entry-amount-input').value = chip.dataset.amount;
  });
});

// Submit Regular Form Entry
formAddEntry.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('entry-name-input').value.trim();
  const amount = parseFloat(document.getElementById('entry-amount-input').value);
  if (!name || isNaN(amount) || amount <= 0) return;

  await addDoc(collection(db, 'events', activeEventId, 'records'), {
    name,
    amount,
    type: currentRecordMode,
    paymentMode: currentRecordMode === 'income' ? currentPaymentMode : 'offline',
    date: serverTimestamp()
  });

  modalAddEntry.style.display = 'none';
});

// ── UPI QR Flow ────────────────────────────────────────────
function setupUPIFlow() {
  const currentEvent = events.find(e => e.id === activeEventId);
  if (!currentEvent.upiId) {
    document.getElementById('upi-setup-step').style.display = 'block';
    document.getElementById('upi-qr-step').style.display = 'none';
  } else {
    document.getElementById('upi-setup-step').style.display = 'none';
    document.getElementById('upi-qr-step').style.display = 'block';
    renderQR();
  }
}

document.getElementById('btn-save-upi-proceed').addEventListener('click', async () => {
  const upi = document.getElementById('qr-setup-upi-id').value.trim();
  if (!upi) return;
  await updateDoc(doc(db, 'events', activeEventId), { upiId: upi });
  const ev = events.find(e => e.id === activeEventId);
  if (ev) ev.upiId = upi;
  setupUPIFlow();
});

document.getElementById('qr-amount-input').addEventListener('input', () => {
  renderQR();
});

function renderQR() {
  const currentEvent = events.find(e => e.id === activeEventId);
  if (!currentEvent || !currentEvent.upiId) return;

  const amt = document.getElementById('qr-amount-input').value.trim();
  const params = new URLSearchParams({
    pa: currentEvent.upiId,
    pn: currentEvent.name,
    cu: 'INR',
    ...(amt ? { am: parseFloat(amt).toFixed(2) } : {})
  });
  const upiUrl = `upi://pay?${params.toString()}`;

  const qrBox = document.getElementById('qrcode-box');
  qrBox.innerHTML = '';
  new QRCode(qrBox, {
    text: upiUrl,
    width: 180,
    height: 180,
    colorDark: "#5B21B6",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
  document.getElementById('qr-upi-label').textContent = currentEvent.upiId;
}

document.getElementById('btn-confirm-qr-payment').addEventListener('click', async () => {
  const name = document.getElementById('qr-donor-name').value.trim() || 'Online Donor';
  const amount = parseFloat(document.getElementById('qr-paid-amount').value);
  if (isNaN(amount) || amount <= 0) {
    alert('Please enter confirmed amount');
    return;
  }

  await addDoc(collection(db, 'events', activeEventId, 'records'), {
    name,
    amount,
    type: 'income',
    paymentMode: 'online',
    date: serverTimestamp()
  });

  modalAddEntry.style.display = 'none';
});

// ── Mobile Tabs ────────────────────────────────────────────
const tabDonations = document.getElementById('tab-donations');
const tabExpenses = document.getElementById('tab-expenses');
const colIncome = document.querySelector('.col-income');
const colExpense = document.querySelector('.col-expense');

tabDonations.addEventListener('click', () => {
  activeRecordTab = 'donations';
  tabDonations.classList.add('active');
  tabExpenses.classList.remove('active');
  updateMobileCols();
});

tabExpenses.addEventListener('click', () => {
  activeRecordTab = 'expenses';
  tabExpenses.classList.add('active');
  tabDonations.classList.remove('active');
  updateMobileCols();
});

function updateMobileCols() {
  if (window.innerWidth <= 520) {
    colIncome.style.display = activeRecordTab === 'donations' ? 'block' : 'none';
    colExpense.style.display = activeRecordTab === 'expenses' ? 'block' : 'none';
  } else {
    colIncome.style.display = 'block';
    colExpense.style.display = 'block';
  }
}
window.addEventListener('resize', updateMobileCols);

// ── Navigation Buttons ─────────────────────────────────────
document.getElementById('btn-back-home').addEventListener('click', navigateHome);
document.getElementById('nav-btn-home').addEventListener('click', navigateHome);

// ── Export Utilities ───────────────────────────────────────
document.getElementById('btn-export-pdf').addEventListener('click', () => {
  const ev = events.find(e => e.id === activeEventId);
  const recs = records[activeEventId] || [];
  if (!ev || recs.length === 0) return alert('No records to export');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const summary = getSummary(activeEventId);

  doc.setFontSize(20).setFont('helvetica', 'bold').text(ev.name, 14, 18);
  doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(100);
  doc.text(`Exported: ${new Date().toLocaleString('en-IN')}`, 14, 25);
  doc.setTextColor(0).setFontSize(11);
  doc.text(`Total Collected: ${formatCurrency(summary.income)} | Total Expenses: ${formatCurrency(summary.expense)} | Balance: ${formatCurrency(summary.balance)}`, 14, 33);

  const income = recs.filter(r => r.type === 'income');
  const expense = recs.filter(r => r.type === 'expense');

  doc.autoTable({
    startY: 40,
    head: [['#', 'Donation / Donor Name', 'Mode', 'Amount (₹)', 'Date']],
    body: income.map((r, i) => [i + 1, r.name, r.paymentMode === 'online' ? 'Online' : 'Offline', Number(r.amount).toFixed(2), formatDate(r.date)]),
    headStyles: { fillColor: [22, 163, 74] }
  });

  const nextY = doc.lastAutoTable.finalY + 10;
  doc.autoTable({
    startY: nextY,
    head: [['#', 'Expense Item', 'Amount (₹)', 'Date']],
    body: expense.map((r, i) => [i + 1, r.name, Number(r.amount).toFixed(2), formatDate(r.date)]),
    headStyles: { fillColor: [220, 38, 38] }
  });

  doc.save(`${ev.name.replace(/\s+/g, '_')}_records.pdf`);
});

document.getElementById('btn-export-excel').addEventListener('click', () => {
  const ev = events.find(e => e.id === activeEventId);
  const recs = records[activeEventId] || [];
  if (!ev || recs.length === 0) return alert('No records to export');

  const summary = getSummary(activeEventId);
  const income = recs.filter(r => r.type === 'income');
  const expense = recs.filter(r => r.type === 'expense');

  const wb = XLSX.utils.book_new();

  const donRows = income.map((r, i) => ({ '#': i + 1, Name: r.name, Mode: r.paymentMode, 'Amount (₹)': Number(r.amount).toFixed(2), Date: formatDate(r.date) }));
  donRows.push({}, { '#': 'TOTAL', 'Amount (₹)': Number(summary.income).toFixed(2) });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(donRows), 'Donations');

  const expRows = expense.map((r, i) => ({ '#': i + 1, Item: r.name, 'Amount (₹)': Number(r.amount).toFixed(2), Date: formatDate(r.date) }));
  expRows.push({}, { '#': 'TOTAL', 'Amount (₹)': Number(summary.expense).toFixed(2) });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Expenses');

  XLSX.writeFile(wb, `${ev.name.replace(/\s+/g, '_')}_records.xlsx`);
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ── Startup ────────────────────────────────────────────────
renderCategories();
updateMobileCols();

// ── Authentication Management (Lock down records until signed in) ──
const authOverlay = document.getElementById('auth-overlay');
const appWrapper = document.getElementById('app');
const authWrapper = document.getElementById('authWrapper');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');
const mobileRegisterBtn = document.getElementById('mobileRegisterBtn');
const mobileLoginBtn = document.getElementById('mobileLoginBtn');

const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const loginError = document.getElementById('login-error');
const regError = document.getElementById('reg-error');
const regSuccess = document.getElementById('reg-success');
const userDisplayEmail = document.getElementById('user-display-email');
const btnLogout = document.getElementById('btn-logout');

// Panel sliding events
if (registerBtn) registerBtn.addEventListener('click', () => authWrapper.classList.add('panel-active'));
if (loginBtn) loginBtn.addEventListener('click', () => authWrapper.classList.remove('panel-active'));
if (mobileRegisterBtn) mobileRegisterBtn.addEventListener('click', () => authWrapper.classList.add('panel-active'));
if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', () => authWrapper.classList.remove('panel-active'));

let eventsUnsubscribe = null;
let recordsUnsubscribers = [];

function cleanFirestoreListeners() {
  if (eventsUnsubscribe) {
    eventsUnsubscribe();
    eventsUnsubscribe = null;
  }
  recordsUnsubscribers.forEach(unsub => unsub());
  recordsUnsubscribers = [];
  events = [];
  records = {};
}

// Auth State Monitor
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Authenticated! Show app and load records
    authOverlay.style.display = 'none';
    appWrapper.style.display = 'block';
    userDisplayEmail.textContent = user.displayName || user.email || 'Dev Roy';
    cleanFirestoreListeners();
    initFirebaseSync();
  } else {
    // Not Authenticated! Block records
    cleanFirestoreListeners();
    appWrapper.style.display = 'none';
    authOverlay.style.display = 'flex';
  }
});

// Handle Login
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-submit-login');
  
  try {
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    await signInWithEmailAndPassword(auth, email, password);
    formLogin.reset();
  } catch (err) {
    console.error("Login error:", err);
    let msg = 'Invalid Email or Password';
    if (err.code === 'auth/user-not-found') msg = 'No account found with this email';
    if (err.code === 'auth/wrong-password') msg = 'Incorrect password';
    if (err.code === 'auth/invalid-credential') msg = 'Invalid credentials or user does not exist';
    if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later';
    loginError.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

// Handle Register
formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  regError.textContent = '';
  regSuccess.textContent = '';
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const btn = document.getElementById('btn-submit-register');

  try {
    btn.disabled = true;
    btn.textContent = 'Creating account…';
    await createUserWithEmailAndPassword(auth, email, password);
    regSuccess.textContent = 'Account created successfully!';
    formRegister.reset();
  } catch (err) {
    console.error("Register error:", err);
    let msg = err.message;
    if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered. Please Sign In.';
    if (err.code === 'auth/weak-password') msg = 'Password should be at least 6 characters.';
    if (err.code === 'auth/invalid-email') msg = 'Invalid email address format.';
    regError.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign Up';
  }
});

// Handle Logout
btnLogout.addEventListener('click', async () => {
  if (confirm('Are you sure you want to log out?')) {
    await signOut(auth);
  }
});



// ── Register PWA Service Worker ────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('ServiceWorker registered:', reg.scope))
      .catch((err) => console.log('ServiceWorker registration failed:', err));
  });
}


// ── PWA Download / Install Popup Logic ─────────────────────
let deferredPrompt = null;
const installBanner = document.getElementById('pwa-install-banner');
const btnInstall = document.getElementById('pwa-btn-install');
const btnDismiss = document.getElementById('pwa-btn-dismiss');

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Show banner if not dismissed in this session
  if (!sessionStorage.getItem('pwa-prompt-dismissed')) {
    setTimeout(() => {
      if (installBanner) installBanner.style.display = 'block';
    }, 1500);
  }
});

if (btnInstall) {
  btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('User response to install prompt:', outcome);
      deferredPrompt = null;
      if (installBanner) installBanner.style.display = 'none';
    } else {
      // Fallback instruction for iOS / standalone browsers
      alert('To install: Tap the Share / Menu button (⋮) in your browser and select "Add to Home Screen" / "Install App".');
      if (installBanner) installBanner.style.display = 'none';
    }
  });
}

if (btnDismiss) {
  btnDismiss.addEventListener('click', () => {
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
    if (installBanner) installBanner.style.display = 'none';
  });
}

window.addEventListener('appinstalled', () => {
  console.log('DhaanTrack was successfully installed as an App!');
  if (installBanner) installBanner.style.display = 'none';
});


// ── Header Download Button Click Handler ──────────────────
const btnHeaderDownload = document.getElementById('btn-header-download');
if (btnHeaderDownload) {
  btnHeaderDownload.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('User response to header download:', outcome);
      deferredPrompt = null;
    } else {
      alert('To download/install:\n1. On PC: Look for the Install icon (⊕) on the right side of your browser URL bar.\n2. On Mobile: Tap the 3-dot menu (⋮) and select "Add to Home Screen" or "Install App".');
    }
  });
}


// ── Fixed Top Corner Download Button Click ─────────────────
const cornerDownloadBtn = document.getElementById('corner-download-btn');
if (cornerDownloadBtn) {
  cornerDownloadBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('User response to corner install:', outcome);
      deferredPrompt = null;
    } else {
      alert('To install DhaanTrack:\n1. On PC: Look for the Install icon (⊕) on the right side of the address bar.\n2. On Mobile: Tap the 3 dots (⋮) and tap "Install app" or "Add to Home screen".');
    }
  });
}
