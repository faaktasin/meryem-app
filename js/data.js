/**
 * Meryem App — Data & Configuration
 * Love messages, date utilities, and app constants.
 */

const CONFIG = {
  name: 'Meryem',
  anniversaryDate: new Date('2026-12-31T00:00:00'),
  mapCenter: [39.9334, 32.8597], // Ankara default
  mapZoom: 6,
  maxPhotoWidth: 800,
  storageKeys: {
    memories: 'meryem-memories',
    todos: 'meryem-todos'
  }
};

const LOVE_MESSAGES = [
  'Bugün de seni seviyorum, Meryem.',
  'Seninle geçen her an hayatımın en güzel anı.',
  'Gülüşün güneşten daha çok aydınlatıyor beni.',
  'Seni tanıdığım için ne kadar şanslı olduğumu her gün hatırlıyorum.',
  'Sen benim en güzel hikayemsin.',
  'Seninle her yer güzel, her an özel.',
  'Gözlerinde kaybolmak dünyanın en güzel yolculuğu.',
  'Sen olmadan eksik kalıyor her şey.',
  'Seni her gün biraz daha çok seviyorum.',
  'Kalbimin en güzel köşesi seninle dolu.',
  'Seninle gülmek, dünyanın en güzel müziği.',
  'Her sabah uyandığımda ilk düşündüğüm sensin.',
  'Sen benim küçük mutluluğumsun.',
  'Seninle geçirdiğim her saniye altın değerinde.',
  'Hayatıma anlam katan tek kişi sensin.',
  'Seni sevmek en doğal halim.',
  'Sen benim güneşimsin, yıldızımsın, her şeyimsin.',
  'Seninle büyüyen bu sevgi benim en büyük gururum.',
  'Bir gülüşün bin derdin ilacı.',
  'Seni düşününce yüzüme kocaman bir gülümseme yayılıyor.',
  'Meryem, sen hayatımın en güzel sürprizi oldun.',
  'Seninle her gün yeniden aşık oluyorum.',
  'Ellerini tuttuğumda dünya duruyor sanki.',
  'Sen benim en güzel rüyamın gerçek hali.',
  'Seninle olmak, evde olmak gibi.',
  'Kalbim sadece senin için atıyor.',
  'Seni sevmek benim süper gücüm.',
  'Her anımıza bir yıldız koysak gökyüzü yetmez.',
  'Sen benim bugünüm, yarınım, her şeyimsin.',
  'Meryem, seninle hayat çok güzel.',
  'Sesini duymak en güzel melodiden daha tatlı.',
  'Sana sarılmak dünyanın en huzurlu yeri.',
  'Bizim hikayemiz en sevdiğim hikaye.',
  'Seninle paylaştığım her an bir hazine.',
  'Sen benim kalbimin şifresisin.'
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
  return LOVE_MESSAGES[getDailyMessageIndex(new Date())];
}

/**
 * Calculates time remaining until the anniversary.
 * @returns {{ days: number, hours: number, minutes: number, seconds: number, passed: boolean }}
 */
function getCountdown() {
  const now = new Date();
  const diff = CONFIG.anniversaryDate - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, passed: true };
  }

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    passed: false
  };
}
