/**
 * Meryem App — Data & Configuration
 * Love messages, date utilities, and app constants.
 */

const CONFIG = {
  name: 'Meryem',
  firstMeetDate: new Date('2026-03-10T00:00:00'),
  loveDate: new Date('2026-01-17T00:00:00'),
  herBirthday: { month: 10, day: 4 },   // October 4
  hisBirthday: { month: 5, day: 26 },   // May 26
  mapCenter: [39.9334, 32.8597], // Ankara default
  mapZoom: 6,
  maxPhotoWidth: 600,
  storageKeys: {
    memories: 'meryem-memories',
    todos: 'meryem-todos'
  },
  google: {
    clientId: '548770900516-76u61ct0rjs4oa6rpe7c418m3k5jqooh.apps.googleusercontent.com',
    apiKey: 'AIzaSyCMJX7CIG5CaXHGQKylj2GnUfGgcaNPOV4'
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
  'Sen olmasan bu app boş olurdu, tıpkı hayatım gibi.',
  'Seninle yediğim her yemek şölen gibi.',
  'Gece yarısı mesajların günümün en güzel sürprizi.',
  'Seninle tartışmak bile özlediğim bir şey olur sonra.',
  'Sen benim en sevdiğim bildirimsin.',
  'Seninle çektiğimiz her selfie bir sanat eseri.',
  'Meryem, sen benim favori kişimsin, bugün de yarın da.',
  'Sana sarıldığımda zaman kavramını kaybediyorum.',
  'Seninle yapılan planlar asla sıkıcı olmuyor.',
  'Sen benim hayatımdaki en güzel tesadüf değil, kadersin.',
  'Seninle izlediğim en kötü film bile eğlenceli.',
  'Sesini duyunca içimdeki bütün stres eriyor.',
  'Meryem, seni her gördüğümde yeniden tanışmış gibi heyecanlanıyorum.',
  'Seninle geçirdiğim sıradan bir gün bile unutulmaz.',
  'Sen gülünce gözlerindeki ışık her şeyi aydınlatıyor.',
  'Benim için en güzel manzara senin yüzün.',
  'Seninle susarken bile mutluyum.',
  'Sen benim en güzel baharımsın, her mevsim.',
  'Sana bakınca geleceğimizi görüyorum ve çok güzel.',
  'Meryem, seninle her şey ilk kez yaşanmış gibi taze.',
  'Seninle yürüdüğüm sokaklar bile özel hissettiriyor.',
  'Sen benim en güzel alışkanlığım, bırakmak istemediğim tek şey.',
  'Kalbim seni seçeli beri hiç yanılmadığını biliyorum.',
  'Seninle geçen her gün bir öncekinden daha güzel.',
  'Sen benim huzur limanımsın, Meryem.',
  'Dünyanın en güzel gözleri senin, bunu her gün söyleyeceğim.',
  'Seninle paylaşılan bir battaniye bile lüks.',
  'Seni özlemek bile güzel, çünkü kavuşmak var.',
  'Meryem, sen hayatıma renk katan en güzel tablo.',
  'Seninle kurulan cümleler bile daha güzel oluyor.',
  'Sen benim için yazılmış en güzel şarkının sözlerisin.',
  'Seninle uyumak dünyanın en huzurlu anı.',
  'Sabah gözlerini açtığında ilk seni görmek istiyorum.',
  'Sen benim en güzel sırrımsın, herkese anlatmak istediğim.',
  'Meryem, seninle büyüyen bu aşk beni daha iyi biri yapıyor.',
  'Seninle geçen her saniye, ömrüme ömür katıyor.',
  'Sen benim dünyamın merkezinde dönen güneşsin.',
  'Seninle çay içmek, başkalarıyla tatile gitmekten güzel.',
  'Gülüşünü duyunca kalbim dans ediyor.',
  'Sen benim en güzel cümlemin son noktasısın.'
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
function getElapsed(sinceDate) {
  var now = new Date();
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
  var now = new Date();
  var thisYear = new Date(now.getFullYear(), month - 1, day);
  var target = now < thisYear ? thisYear : new Date(now.getFullYear() + 1, month - 1, day);
  var diff = target - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, today: true };
  }

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    today: false
  };
}
