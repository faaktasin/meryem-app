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
  'Sen benim kalbimin şifresisin.',
  'Dünyada en çok sevdiğim yer senin yanın.',
  'Seninle tanıştığım gün hayatımın dönüm noktası.',
  'Gözlerin bana huzur veriyor, Meryem.',
  'Sen varken başka hiçbir şeye ihtiyacım yok.',
  'Seninle saatlerce konuşsam da hiç sıkılmam.',
  'Her gün seninle uyansam keşke.',
  'Sen benim en güzel şansımsın.',
  'Aklım hep sende, kalbim hep sende.',
  'Seni görmek günümü güzelleştiriyor.',
  'Seninle yürüdüğüm her yol cennet gibi.',
  'Kokun dünyanın en güzel parfümü.',
  'Sen benim sakinliğimsin, huzurumun kaynağı.',
  'Seninle gülerken zaman duruyor.',
  'Meryem, sen olmasaydın bu dünya çok sıradan olurdu.',
  'Sana her baktığımda ilk günkü gibi heyecanlanıyorum.',
  'Sen benim en değerli hazinem.',
  'Seninle geçen bir dakika, bin saatten değerli.',
  'Rüyalarım bile seni kıskanıyor.',
  'Senin varlığın bana güç veriyor.',
  'Dünyayı seninle keşfetmek istiyorum.',
  'Sen hayatımın en tatlı melodisi.',
  'Seni sevmek, nefes almak kadar doğal.',
  'Her gece yatarken seni düşünerek uyuyorum.',
  'Sen benim küçük evrenimsin.',
  'Seninle olan her anı fotoğraflasam albüm yetmez.',
  'Meryem, sen benim için yazılmış en güzel şiirsin.',
  'Gülümsemeni görünce tüm sorunlarımı unutuyorum.',
  'Seni sevmek hayatımda yaptığım en güzel şey.',
  'Sen benim kayıp parçamdın, seni buldum artık tamlığım.',
  'Seninle kahve içmek bile bir macera.',
  'Yağmurda bile seninle yürümek güneşli bir gün gibi.',
  'Meryem, adın bile kalbimi hızlandırıyor.',
  'Sen benim favorimsin, her konuda.',
  'Seninle suskunluk bile huzurlu.',
  'Gözlerinin içine bakınca evimi görüyorum.',
  'Her gün sana teşekkür etmek istiyorum, hayatımda olduğun için.',
  'Sen yokken saatler geçmiyor.',
  'Seninle bir ömür yetmez, bin ömür isterim.',
  'Dünyanın en güzel gülüşü senin.',
  'Meryem, sen benim motivasyonumsun.',
  'Seni ilk gördüğüm anı hiç unutmayacağım.',
  'Sen benim gökkuşağımsın, her rengimsin.',
  'Seninle dans etmek istiyorum, müzik olmasa bile.',
  'Kalbimin ritmi senin adını söylüyor.',
  'Senden güzel bir armağan veremezdi hayat bana.',
  'Seninle büyümek, birlikte yaşlanmak istiyorum.',
  'Sen benim en güzel sabahımsın.',
  'Her seni gördüğümde kelebekler uçuyor içimde.',
  'Meryem, sen benim için evrenin en güzel mucizesi.',
  'Sana dokunmak, yıldızlara dokunmak gibi.',
  'Sen varken korkacak hiçbir şey yok.',
  'Seninle paylaşılan bir çay bile bayram.',
  'Sen benim pusulamısın, hep sana yöneliyorum.',
  'Dünyada milyarlarca insan var ama kalbim sadece seni seçti.',
  'Seninle kurduğum hayaller gerçek oluyor yavaş yavaş.',
  'Meryem, seni sevmek bir ayrıcalık.',
  'Sen benim en güzel alışkanlığımsın.',
  'Seninle geçen kış bile sıcacık.',
  'Her dakikan benim için özel.',
  'Sen gülünce dünya daha güzel bir yer oluyor.',
  'Sana yazacak binlerce mesajım var, hiçbiri yeterli değil.',
  'Seninle el ele tutuşmak, tüm kelimelerin ötesinde.',
  'Meryem, seninle tanışmak kaderime teşekkür etmeme yetti.',
  'Sen benim en güzel gecemin yıldızısın.',
  'Seni seviyorum, dün de bugün de yarın da.',
  'Sen olmasan bu app boş olurdu, tıpkı hayatım gibi.'
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
