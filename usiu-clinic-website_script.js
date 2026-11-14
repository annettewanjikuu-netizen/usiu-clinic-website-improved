// Navigation & Page Switching
const pageNames = new Set([
  'home',
  'login',
  'register',
  'patient',
  'book',
  'appointments',
  'doctor',
  'admin'
]);

const mobileNav = document.getElementById('mobile-nav');
const menuButton = document.getElementById('menu-button');

function showPage(name) {
  if (!pageNames.has(name)) name = 'home';

  document.querySelectorAll('.page').forEach(page => {
    page.classList.toggle('active', page.id === 'page-' + name);
  });

  document.querySelectorAll('.nav button, .mobile-nav button').forEach(button => {
    if (button.dataset.go === name) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  mobileNav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-go]').forEach(control => {
  control.addEventListener('click', event => {
    event.preventDefault();
    showPage(control.dataset.go);
  });
});

menuButton.addEventListener('click', () => {
  const open = mobileNav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});

// Initialize Lucide Icons
if (window.lucide) {
  lucide.createIcons();
}

// LocalStorage Persistence Adapter (Replaces Canva SDK for standalone GitHub Pages hosting)
const STORAGE_KEY = 'usiu_clinic_appointments_v1';

const localDataStore = {
  getRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      // Seed initial sample data so the public schedule isn't empty on first load
      const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
      const sample = [
        {
          __backendId: 'sample-1',
          department: 'General care',
          preferred_date: tomorrow,
          preferred_time: '09:30',
          status: 'Requested'
        },
        {
          __backendId: 'sample-2',
          department: 'Wellness',
          preferred_date: tomorrow,
          preferred_time: '14:00',
          status: 'Requested'
        }
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
      return sample;
    } catch (_) {
      return [];
    }
  },
  saveRecord(record) {
    const records = this.getRecords();
    const newRecord = {
      ...record,
      __backendId: 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
    };
    records.push(newRecord);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return records;
  }
};

// Schedule & Metrics Rendering
let backendRecords = [];
let scheduleReady = false;
let loadTimer;

const scheduleList = document.getElementById('schedule-list');
const scheduleMessage = document.getElementById('schedule-message');
const retryButton = document.getElementById('retry-button');
const slotNodes = new Map();

const validDate = value => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '');

function displayDate(value) {
  const date = validDate(value);
  if (!date) return 'Date unavailable';
  const parsed = new Date(date + 'T12:00:00');
  return Number.isNaN(parsed.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(parsed);
}

function setText(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function renderSchedule() {
  const ordered = [...backendRecords].sort((a, b) =>
    (String(a.preferred_date || '') + String(a.preferred_time || '')).localeCompare(
      String(b.preferred_date || '') + String(b.preferred_time || '')
    )
  );

  const liveIds = new Set(ordered.map(record => String(record.__backendId)));

  for (const [id, node] of slotNodes) {
    if (!liveIds.has(id)) {
      node.remove();
      slotNodes.delete(id);
    }
  }

  for (const record of ordered) {
    const id = String(record.__backendId);
    let node = slotNodes.get(id);

    if (!node) {
      node = document
        .getElementById('slot-template')
        .content.firstElementChild.cloneNode(true);
      node.dataset.recordId = id;
      slotNodes.set(id, node);
    }

    const values = {
      department: record.department || 'Department unavailable',
      date: displayDate(record.preferred_date),
      time: /^\d{2}:\d{2}$/.test(record.preferred_time || '')
        ? record.preferred_time
        : 'Time unavailable',
      status: record.status || 'Requested'
    };

    for (const [key, value] of Object.entries(values)) {
      setText(node.querySelector('[data-field="' + key + '"]'), value);
    }

    scheduleList.appendChild(node);
  }

  setText(
    scheduleMessage,
    ordered.length ? '' : 'No public appointment requests yet.'
  );

  const today = new Date().toLocaleDateString('en-CA');
  const departments = new Set(ordered.map(row => row.department).filter(Boolean)).size;

  const metricsMap = {
    'doctor-total': ordered.length,
    'doctor-upcoming': ordered.filter(
      row => validDate(row.preferred_date) && row.preferred_date >= today
    ).length,
    'doctor-departments': departments,
    'admin-total': ordered.length,
    'admin-requested': ordered.filter(
      row => String(row.status || '').toLowerCase() === 'requested'
    ).length,
    'admin-departments': departments
  };

  for (const [id, value] of Object.entries(metricsMap)) {
    setText(document.getElementById(id), String(value));
  }
}

function initializeSchedule() {
  clearTimeout(loadTimer);
  scheduleReady = true;
  backendRecords = localDataStore.getRecords();
  retryButton.classList.add('hidden');
  renderSchedule();
}

retryButton.addEventListener('click', initializeSchedule);

// Booking Form Handling
const form = document.getElementById('booking-form');
const dateInput = document.getElementById('preferred-date');
const submitButton = document.getElementById('submit-booking');
const bookingStatus = document.getElementById('booking-status');

function updateMinimumDate() {
  dateInput.min = new Date().toLocaleDateString('en-CA');
}

updateMinimumDate();

form.addEventListener('submit', event => {
  event.preventDefault();
  updateMinimumDate();
  bookingStatus.className = 'message';
  setText(bookingStatus, '');

  if (!form.reportValidity()) return;

  if (dateInput.value < dateInput.min) {
    setText(bookingStatus, 'Please choose today or a future date.');
    bookingStatus.classList.add('error');
    dateInput.focus();
    return;
  }

  if (!scheduleReady) {
    setText(bookingStatus, 'Please wait for the schedule to load, then try again.');
    bookingStatus.classList.add('error');
    return;
  }

  if (backendRecords.length >= 999) {
    setText(bookingStatus, 'The request list is full. Please contact the clinic directly.');
    bookingStatus.classList.add('error');
    return;
  }

  const fields = new FormData(form);
  const record = {
    full_name: String(fields.get('full_name') || '').trim(),
    email: String(fields.get('email') || '').trim(),
    phone: String(fields.get('phone') || '').trim(),
    department: String(fields.get('department') || ''),
    preferred_date: String(fields.get('preferred_date') || ''),
    preferred_time: String(fields.get('preferred_time') || ''),
    status: 'Requested',
    created_at: new Date().toISOString()
  };

  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');

  try {
    backendRecords = localDataStore.saveRecord(record);
    renderSchedule();
    setText(
      bookingStatus,
      'Your request was saved. The clinic will contact you to confirm availability.'
    );
    bookingStatus.classList.add('success');
    form.reset();
  } catch (_) {
    setText(
      bookingStatus,
      'We could not confirm your request was saved. Check with the clinic before trying again.'
    );
    bookingStatus.classList.add('error');
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute('aria-busy');
  }
});

// Boot
initializeSchedule();
