/**
 * Meryem App — Data & Configuration
 * Love messages, date utilities, and app constants.
 */

const CONFIG = {
  name: 'Meryem',
  firstMeetDate: new Date('2026-04-08T00:00:00'),
  loveDate: new Date('2026-02-03T00:00:00'),
  engagementDate: new Date('2026-08-12T00:00:00'),
  wedding: { year: 2027, month: 8, day: null }, // Furkan sets `day` once the wedding date is fixed
  herBirthday: { month: 11, day: 25 },   // November 25
  hisBirthday: { month: 4, day: 14 },   // April 14
  mapCenter: [39.9334, 32.8597], // Ankara default
  mapZoom: 6,
  maxPhotoWidth: 600,
  storageKeys: {
    memories: 'meryem-memories',
    todos: 'meryem-todos'
  },
  /* "Takip" (js/habits.js). The first month the tracker shows; every month from here to the
     current one exists by itself. */
  habitsStart: '2026-10',
  people: { furkan: 'Furkan', meryem: 'Meryem' },
  /* The list. `owners` = who ticks it, `weekdaysOnly` = due Mon-Fri only, `since` / optional
     `until` = the dates it is active (so changing the list never rewrites old months). */
  habits: [
    { id: 'spor', label: 'Spor', owners: ['furkan', 'meryem'], weekdaysOnly: false, since: '2026-10-07', note: 'Birlikte hareket edeceğiz' },
    { id: 'kitap', label: 'Kitap (en az 10 sayfa)', owners: ['furkan', 'meryem'], weekdaysOnly: false, since: '2026-10-07', note: 'Her gün biraz kitap okuyacağız' },
    { id: 'muzik', label: 'Müzik pratiği (en az 15 dk)', owners: ['meryem'], weekdaysOnly: false, since: '2026-10-07', note: 'Her gün biraz müzik pratiği yapacağım' },
    { id: 'yuruyus', label: 'Yürüyüş', owners: ['meryem'], weekdaysOnly: false, since: '2026-10-07', note: 'Her gün kısa bir yürüyüşe çıkacağım' },
    { id: 'su', label: 'Su içme', owners: ['furkan'], weekdaysOnly: false, since: '2026-10-07', note: 'Gün boyunca yeterince su içeceğim' },
    { id: 'uyku', label: 'Düzenli uyku', owners: ['furkan'], weekdaysOnly: true, since: '2026-10-07', note: 'Hafta içi düzenli saatte uyuyacağım' }
  ],
};

const LOVE_MESSAGES = [
  'Bu bir örnek mesajdır.',
  'Bugün güzel bir gün olsun.',
  'Küçük bir gülümseme günü değiştirir.',
  'Bir adım at, gerisi gelir.',
  'Bugün kendine iyi davran.',
  'Güzel şeyler yolda.',
  'Derin bir nefes al ve devam et.',
  'Bu mesaj örnek amaçlıdır.',
  'Her gün yeni bir başlangıç.',
  'Sakin ve güçlü kal.',
  'Bugün de harika gidiyorsun.',
  'Gerçek mesajlar giriş yapınca yüklenir.'
];

/**
 * Returns a deterministic daily index so the same message shows all day.
 * @param {Date} date
 * @returns {number}
 */
function getDailyMessageIndex(date) {
  const daysSinceEpoch = Math.floor(date.getTime() / 86400000);
  return ((daysSinceEpoch * 2654435761) >>> 0) % LOVE_MESSAGES.length;
}

/**
 * Returns today's love message.
 * @returns {string}
 */
function getDailyMessage() {
  return LOVE_MESSAGES[getDailyMessageIndex(appNow())];
}

/**
 * Returns a random message different from the current one.
 * @param {string} currentMessage
 * @returns {string}
 */
function getRandomMessage(currentMessage) {
  var msg;
  do {
    msg = LOVE_MESSAGES[Math.floor(Math.random() * LOVE_MESSAGES.length)];
  } while (msg === currentMessage && LOVE_MESSAGES.length > 1);
  return msg;
}

/**
 * Calculates time remaining until the anniversary.
 * @returns {{ days: number, hours: number, minutes: number, seconds: number, passed: boolean }}
 */
function getElapsed(sinceDate) {
  var now = appNow();
  var diff = now - sinceDate;

  if (diff < 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000)
  };
}

function getNextBirthdayCountdown(month, day) {
  var now = appNow();

  /* Compare CALENDAR DATES first, not a midnight instant — a plain `now < midnight-of-birthday`
     check made the whole day AFTER midnight read as "already passed", so the countdown fell all
     the way through to next year's birthday (~364 days) instead of staying at {today:true} for
     the rest of the day. */
  var isToday = now.getMonth() === (month - 1) && now.getDate() === day;
  if (isToday) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, today: true };
  }

  var thisYear = new Date(now.getFullYear(), month - 1, day);
  var target = now < thisYear ? thisYear : new Date(now.getFullYear() + 1, month - 1, day);
  var diff = target - now;

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    today: false
  };
}
