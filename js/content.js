/**
 * Meryem App — Content
 * Every word the app shows lives here, under one global CONTENT object, so Furkan can change any
 * text without touching view logic. Feature code only READS this object.
 * Poem lines in words.quotes are verified against the poem's own text — keep their exact wording.
 */

var CONTENT = {
  greetings: {
    morning: [
      'Günaydın güzelim ☀️',
      'Günaydın hayatım, güne gülümseyerek başla',
      'Uyandın mı canım? Ayı seni bekliyordu 🐻',
      'Günaydın Meryem, bugün de güzel bir gün olsun',
      'Gözlerini aç, güneş de sensin zaten'
    ],
    afternoon: [
      'Günün nasıl gidiyor bakalım?',
      'Biraz mola ver, seni düşünüyorum şu an 💭',
      'Öğlen arası bir gülümseme sana yeter mi?',
      'Umarım günün güzel geçiyordur canım',
      'Ayıcık merak etti, sen iyi misin? 🐻'
    ],
    evening: [
      'Akşamın hayırlı olsun güzelim 🌆',
      'Gün bitti, şimdi sıra dinlenmekte',
      'Bugün de bir gün daha seni sevdim',
      'Akşam oldu, aklım yine sende',
      'Nasıl geçti günün, anlat bana'
    ],
    night: [
      'İyi geceler Meryem, tatlı rüyalar 🌙',
      'Gözlerin kapanmadan bil ki seni seviyorum',
      'Uyu güzelim, yarın yine buradayım',
      'Ayıcık nöbette, sen rahat uyu 🐻',
      'Gece de seninle güzel, iyi uykular'
    ]
  },

  together: {
    prefix: 'Birlikte',
    suffix: 'gündür 💞'
  },

  gate: {
    yesLabel: 'Evet 💗',
    noLabels: [
      'Hayır',
      'Emin misin?',
      'Gerçekten mi? 🥺',
      'Bir daha düşün bence',
      'Ayıcık üzülüyor bak 🐻',
      'Kalbimi kırıyorsun 💔',
      'Ayıcık ağlıyor bak 😭',
      'Yapma böyle ya 😢',
      'Son şansın bu ha',
      'Bu tuş bozuk galiba',
      'Neredeyse bitti, dayan',
      'Hayır diye bir şey yok 💗'
    ],
    /* The reply is Furkan's answer after she presses Yes. */
    opener: {
      q: 'Meryem, beni seviyor musun?',
      reply: 'Biliyordum! Ben de seni çok seviyorum 💗'
    },
    pool: [
      { q: 'Pizzanın son dilimini bana verir misin?', reply: 'İşte gerçek aşk bu 🍕' },
      { q: 'Ben dünyanın en tatlı sevgilisi miyim?', reply: 'Resmen onaylandı, belgesi hazırlanıyor 📜' },
      { q: 'Benimle yaşlanır mısın?', reply: 'Birlikte beyaz tüylü ayıcıklar olacağız 🐻' },
      { q: 'Kötü şakalarıma bile gülüyor musun?', reply: 'İşte bu yüzden seni seviyorum 😄' },
      { q: 'Bugün beni biraz özledin mi?', reply: 'Ben de seni çok özledim 🥺' },
      { q: 'Benimle bir kahve içmeye gelir misin?', reply: 'Randevu kaydedildi ☕' },
      { q: 'Bir gün aynı evde uyanacak mıyız?', reply: 'En güzel planım bu 🏡' },
      { q: 'Beni ilk günden daha çok mu seviyorsun?', reply: 'Ben de seni her gün daha çok 💗' },
      { q: 'Kavga etsek bile yanımda kalır mısın?', reply: 'Ben de hep yanındayım, söz' },
      { q: 'Film seçme hakkını bu seferlik bana verir misin?', reply: 'Yaşasın! Bu akşamın filmi benden 🎬' },
      { q: 'Sana sarılmama izin verir misin?', reply: 'Geliyorum, kollarım açık 🤗' },
      { q: 'Bugün bana bir öpücük borçlu musun?', reply: 'Not aldım, tahsil edeceğim 😘' },
      { q: 'Kolumu yastık yapar mısın?', reply: 'Kolum sadece sana ayrıldı 🧸' },
      { q: 'Gece yarısı dondurma yemeye gelir misin?', reply: 'Anlaştık, tek kase iki kaşık 🍦' },
      { q: 'Sonsuza kadar elimi tutar mısın?', reply: 'Ben de hiç bırakmayacağım 🤝' }
    ],
    birthday: [
      { q: 'Bugün çok özel bir gün, biliyor musun?', reply: 'Bugün dünyanın en güzel kızının doğum günü 🎂' },
      { q: 'Hediyeni açmaya hazır mısın?', reply: 'O zaman sıkı tutun, geliyor! 🎁' }
    ],
    meter: {
      q: 'Peki beni ne kadar seviyorsun?',
      steps: ['Biraz', 'Çok', 'Çok çok', 'Dünyalar kadar', 'Sonsuz ∞'],
      button: 'İşte bu kadar!'
    },
    finale: {
      title: 'Ben de seni sonsuz seviyorum',
      text: 'Bunu her sabah yeniden söylemek isterim, bıkmadan.',
      button: 'İçeri gel 💕',
      birthdayButton: 'Sürprizini aç 🎁'
    }
  },

  words: {
    quotes: [
      {
        text: 'Seni düşünmek güzel şey, ümitli şey,\ndünyanın en güzel sesinden\nen güzel şarkıyı dinlemek gibi bir şey.',
        author: 'Nâzım Hikmet',
        source: 'Piraye İçin Yazılmış Saat 21-22 Şiirleri (30 Eylül 1945)'
      },
      {
        text: 'En güzel deniz:\nhenüz gidilmemiş olanıdır.\n…\nVe sana söylemek istediğim en güzel söz:\nhenüz söylememiş olduğum sözdür.',
        author: 'Nâzım Hikmet',
        source: 'Piraye İçin Yazılmış Saat 21-22 Şiirleri (24 Eylül 1945)'
      },
      {
        text: 'Sen esirliğim ve hürriyetimsin,\n…\nsen memleketimsin.',
        author: 'Nâzım Hikmet',
        source: 'Sen'
      },
      {
        text: 'Sevmek, bir insanı sevmekle başlar her şey.',
        author: 'Sait Faik Abasıyanık',
        source: "Alemdağ'da Var Bir Yılan"
      },
      {
        text: 'Aşk imiş her ne var âlemde,\nİlm bir kıyl ü kâl imiş ancak.',
        author: 'Fuzûlî',
        source: 'Leylâ ile Mecnûn'
      },
      {
        text: 'Gelin tanış olalım,\nİşi kolay kılalım,\nSevelim sevilelim,\nDünya kimseye kalmaz.',
        author: 'Yunus Emre',
        source: 'Sevelim Sevilelim'
      },
      {
        text: 'Ben sana mecburum bilemezsin\nAdını mıh gibi aklımda tutuyorum\nBüyüdükçe büyüyor gözlerin',
        author: 'Attila İlhan',
        source: 'Ben Sana Mecburum'
      },
      {
        text: 'Sana gitme demeyeceğim.\nÜşüyorsun ceketimi al.\nGünün en güzel saatleri bunlar.\nYanımda kal.',
        author: 'Özdemir Asaf',
        source: 'Lavinia'
      },
      {
        text: 'Bilmezdim şarkıların bu kadar güzel,\nKelimelerinse kifayetsiz olduğunu\nBu derde düşmeden önce.',
        author: 'Orhan Veli Kanık',
        source: 'Anlatamıyorum'
      }
    ],
    lines: [
      'Kalbim seni ezbere biliyor artık.',
      'Yanında zaman başka türlü akıyor.',
      'Gülüşün bugünün en iyi haberi.',
      'İki kişilik bir dünya kurduk, hoşuma gidiyor.',
      'Elini tutunca her şey daha kolay.',
      'Aklımdan çıkmadın bugün, çıkacak gibi de değilsin.',
      'Seninle sıradan bir Salı bile özel oluyor.',
      'Bir mesajın günümü kurtarıyor bazen.',
      'Aramızdaki mesafe kaç kilometre olursa olsun, kalbim yanında.',
      'Sesini duyunca omuzlarımdaki yük hafifliyor.',
      'İyi ki seni sevmeyi seçmişim, her gün yeniden seçerim.',
      'Uzun bir günün sonunda tek istediğim seninle konuşmak.',
      'Sana sarılmak listemdeki ilk sıradaki iş.',
      'Küçük şeyleri seninle büyük yapıyorum.',
      'Gülümsedin mi bilmiyorum ama ben senin için gülümsedim.',
      'Uyandığımda bile seni özlüyorum, mantıksız biliyorum.',
      'Ayıcık bugün de senin adına nöbet tuttu 🐻',
      'Aklımda bir sürü plan var, hepsinin ortasında sen varsın.',
      'Bugün ne kadar güzel olduğunu söyledim mi? Söyleyeyim: çok güzelsin.',
      'Yanımda olmadığında bile elini tutuyormuş gibi hissediyorum.',
      'Bir günüm nasıl geçerse geçsin, sonunda seni düşünmek iyi geliyor.',
      'Gülüşünü hayal etmek bile günümü değiştiriyor.',
      'Yanımda olman, en sevdiğim alışkanlık.',
      'Listeye yeni bir satır ekledim bugün: seni sevmek.',
      'Kalbimdeki en rahat köşe sana ait.',
      'Bazı günler tek kelime etmeden anlaşıyoruz, bu bile özel.',
      'Telefonun titremesi, seni yazmışsındır umuduyla heyecanlandırıyor beni.',
      'Güzel bir şey olursa ilk seninle paylaşmak istiyorum.',
      'Yorulduğumda bile seni düşünmek dinlendiriyor.',
      'En sevdiğim rutin: günün sonunda sana ulaşmak 💕'
    ],
    reasons: [
      'Seni seviyorum çünkü gülüşün odaya giren ilk şey oluyor.',
      'Seni seviyorum çünkü beni gerçekten dinliyorsun, göz göze bakarak.',
      'Seni seviyorum çünkü kötü bir günümü tek bir mesajla düzeltebiliyorsun.',
      'Seni seviyorum çünkü yanındayken kendim olmaktan korkmuyorum.',
      'Seni seviyorum çünkü küçük şeylere bile heyecanlanmayı biliyorsun.',
      'Seni seviyorum çünkü sesini duyunca içim rahatlıyor.',
      'Seni seviyorum çünkü hatalarımı görüp yine de yanımda kalıyorsun.',
      'Seni seviyorum çünkü bana gülmeyi hatırlatıyorsun.',
      'Seni seviyorum çünkü her fikrimi ciddiye alıyorsun.',
      'Seni seviyorum çünkü kucaklaşmalarımız hiç yeterli gelmiyor.',
      'Seni seviyorum çünkü inatçılığını bile sevimli buluyorum.',
      'Seni seviyorum çünkü yanında olduğumda ev orası oluyor.',
      'Seni seviyorum çünkü sabırlısın, benimle bile.',
      'Seni seviyorum çünkü sıkıldığında yüzünü buruşturman bile çok tatlı.',
      'Seni seviyorum çünkü planlarımızı hayal etmek bile keyifli.',
      'Seni seviyorum çünkü kalbin cömert, herkese karşı.',
      'Seni seviyorum çünkü beni olduğum gibi seviyorsun.',
      'Seni seviyorum çünkü ufak bir şaka için bile gözlerin parlıyor.',
      'Seni seviyorum çünkü zor günlerimde panik yapmadan yanımda duruyorsun.',
      'Seni seviyorum çünkü konuşurken ellerini nasıl kullandığını izlemeyi seviyorum.',
      'Seni seviyorum çünkü merakın hiç bitmiyor.',
      'Seni seviyorum çünkü bana inanıyorsun, ben bile kendime inanmazken.',
      'Seni seviyorum çünkü küçük bir haberi bile heyecanla anlatıyorsun.',
      'Seni seviyorum çünkü sarılmak seninle hep aynı huzuru veriyor.',
      'Seni seviyorum çünkü nazik olmayı seçiyorsun, kolay olmasa bile.',
      'Seni seviyorum çünkü benimle dalga geçmeyi de çok iyi biliyorsun.',
      'Seni seviyorum çünkü kalbin çok büyük, benim için hep yer buluyor.',
      'Seni seviyorum çünkü seninle sessizlik bile rahatsız etmiyor.',
      'Seni seviyorum çünkü hayal kurmaktan hiç vazgeçmiyorsun.',
      'Seni seviyorum çünkü bir şeyi anlattığımda gerçekten meraklanıyorsun.',
      'Seni seviyorum çünkü kırgınken bile bana bir şans daha veriyorsun.',
      'Seni seviyorum çünkü beni her seferinde şaşırtmayı beceriyorsun.',
      'Seni seviyorum çünkü yanımda kendimi güvende hissediyorum.',
      'Seni seviyorum çünkü tartışsak bile bir şekilde bulup çözüyoruz.',
      'Seni seviyorum çünkü küçük sürprizlerden büyük mutluluk çıkarıyorsun.',
      'Seni seviyorum çünkü bana güvenmeyi hiç bırakmadın.',
      'Seni seviyorum çünkü benim aptal şakalarıma bile gülüyorsun.',
      'Seni seviyorum çünkü her günü biraz daha anlamlı yapıyorsun.',
      'Seni seviyorum çünkü umudunu hiç kaybetmiyorsun.',
      'Seni seviyorum çünkü seninle konuşmak en sevdiğim zaman geçirme şekli.',
      'Seni seviyorum çünkü beni gerçekten tanımaya çalışıyorsun.',
      'Seni seviyorum çünkü kalbindeki iyilik her davranışında görünüyor.',
      'Seni seviyorum çünkü yorgun olsan bile beni aramayı unutmuyorsun.',
      'Seni seviyorum çünkü seninle her plan daha eğlenceli hale geliyor.',
      'Seni seviyorum çünkü kırılgan olduğun anlarda bile güçlüsün.',
      'Seni seviyorum çünkü minik detayları hatırlıyorsun, ben unutsam bile.',
      'Seni seviyorum çünkü bana her gün yeni bir şey öğretiyorsun.',
      'Seni seviyorum çünkü mutluluğun bulaşıcı.',
      'Seni seviyorum çünkü seninle geleceği düşünmek hiç korkutmuyor.',
      'Seni seviyorum çünkü sen, sen olduğun için.'
    ],
    letters: [
      {
        id: 'miss',
        title: 'Beni özlediğinde',
        emoji: '💌',
        birthdayOnly: false,
        body: [
          'Bu satırları tam da böyle bir an için yazdım, beni özlediğin bir an için.',
          'Bil ki ben de seni özlüyorum, şu an bile. Aramızdaki mesafe ne olursa olsun kalbim hep senin tarafında duruyor.',
          'Telefonunu bırak, gözlerini kapat ve düşün: birazdan konuşacağız, birazdan yine gülüşeceğiz. O an çok yakın.'
        ]
      },
      {
        id: 'sad',
        title: 'Canın sıkıldığında',
        emoji: '🤍',
        birthdayOnly: false,
        body: [
          'Canın sıkkınsa, önce derin bir nefes al. Sonra bil ki yalnız değilsin.',
          'Bu duygu geçici, sen kalıcısın. Ben burada, seni bekliyorum, ne zaman hazır olursan.',
          'İstersen anlat, istersen sadece sessiz kal. İkisi de bana uyar, yeter ki yanında olayım.'
        ]
      },
      {
        id: 'sleep',
        title: 'Uyuyamadığında',
        emoji: '🌙',
        birthdayOnly: false,
        body: [
          'Gözlerin açık kalmışsa, bırak bu satırlar seni yavaşça uyutsun.',
          'Bugünü geride bırak. Yarın hâlâ orada olacak, bu gece sadece dinlen.',
          'Ben buradayım, kalbimde bir yerin hep sıcak duruyor. Gözlerini kapat, güzel rüyalar seni bulsun.'
        ]
      },
      {
        id: 'angry',
        title: 'Bana kızdığında',
        emoji: '🐻',
        birthdayOnly: false,
        body: [
          'Bana kızgınsan haklı bir sebebin vardır, biliyorum. Bazen beceremiyorum ama denemekten vazgeçmiyorum.',
          'Özür dilemek benim için hiç zor değil, çünkü seni üzmek asla istemediğim bir şey.',
          'Kızgınlığın geçince konuşalım, ben hazırım. O zamana kadar da seni sevmeye devam ediyorum.'
        ]
      },
      {
        id: 'laugh',
        title: 'Gülmek istediğinde',
        emoji: '😄',
        birthdayOnly: false,
        body: [
          'Gülmek mi istiyorsun? O zaman şunu hayal et: ben dans ederken.',
          'Evet, o kadar kötü. Sağ ayağım hangi taraf bilmiyor, ritim benden kaçıyor ama yine de her fırsatta deniyorum, sırf sen güleyim diye.',
          'Bir de o andaki yüzündeki ifadeyi hayal ediyorum, gülümsemen bile bana yeter zaten.'
        ]
      },
      {
        id: 'lonely',
        title: 'Kendini yalnız hissettiğinde',
        emoji: '💗',
        birthdayOnly: false,
        body: [
          'Yalnız hissetmek bazen içimize sinsice giriyor, biliyorum. Ama şunu unutma: seni düşünen biri var, tam burada.',
          'Uzakta olsam da aklım sende, kalbim seninle. Bu his geçici, ben kalıcıyım.',
          'İstediğin an yaz, istediğin an ara. Beklemekten hiç sıkılmam.'
        ]
      },
      {
        id: 'proud',
        title: 'Kendinle gurur duyman gerektiğinde',
        emoji: '✨',
        birthdayOnly: false,
        body: [
          'Bugün kendinle gurur duyman gereken bir gün olabilir, fark etmemiş olsan bile.',
          'Küçük ya da büyük, attığın her adım beni gururlandırıyor. Sen kendini görmesen de ben görüyorum.',
          'Başardığın her şey senin emeğin. Bunu unutma ve kendine biraz da sen inan.'
        ]
      },
      {
        id: 'bday',
        title: 'Doğum günü sabahın',
        emoji: '🎂',
        birthdayOnly: true,
        body: [
          'Bugün gözlerini açtığında ilk bilmeni istediğim şey: bugün senin günün, ve ben bunu kutlamak için sabırsızlanıyorum.',
          "Bu yıl, birbirimize ilk kez 'seni seviyorum' dediğimiz yıl. Ve bu yılın en güzel gününü de seninle kutluyorum.",
          'İyi ki doğdun Meryem. Bugünün, tıpkı sen gibi, güzel geçmesini diliyorum.'
        ]
      }
    ]
  },

  birthday: {
    locked: {
      title: 'Burada bir sürpriz var 🎁',
      subtitle: "Ama 4 Ekim'e kadar kilitli. Ayıcık nöbette 🐻",
      teases: [
        'Sabret, daha {days} gün var 🙈',
        'Kurcalama, ayıcık bekçi 🐻',
        'Bu kapı sadece doğum gününde açılıyor',
        '{days} gün sonra görüşürüz burada',
        'Meraklı olma, sürpriz sürpriz kalsın 😉',
        'Ayıcık nöbeti bırakmıyor, kilit kalıyor 🔒'
      ]
    },
    title: 'İyi ki doğdun Meryem',
    wish: 'Gözlerini kapat ve bir dilek tut.',
    blow: {
      prompt: 'Mumları üfle!',
      micButton: 'Mikrofonu aç ve üfle 🎤',
      tapHint: 'Ya da mumlara dokunarak söndür',
      micDenied: 'Mikrofon izni yoksa sorun değil, mumlara dokunman yeterli 💗'
    },
    afterBlow: 'Dileğin tutuldu! Umarım hepsi gerçek olur, hepsini hak ediyorsun ✨',
    balloons: [
      'Bu yeni yaşın sana sağlık ve mutluluk getirsin 🎈',
      'Gülüşün hiç eksilmesin yüzünden.',
      'Her dileğin bir bir gerçek olsun.',
      'Bu yıl sana hep iyi şeyler gelsin.',
      'Kalbin hep bu kadar güzel kalsın.',
      'Yanında olduğum her gün için minnettarım.',
      'Doğum günün kutlu olsun, güzelim 🎂',
      'Seninle geçecek nice yıllara.'
    ],
    gift: {
      prompt: 'Sana bir hediyem var.',
      open: 'Hediyeni aç 🎁'
    },
    letter: {
      greeting: 'Sevgili Meryem,',
      paragraphs: [
        "Bu yıl benim için bambaşka bir yıl oldu, çünkü içinde sen vardın. Ocak'ta birbirimize sevgimizi söyledik, Mart'ta ilk kez yüz yüze geldik ve o günden beri hayatım çok daha güzel bir yer.",
        'Bu, birlikte kutladığımız ilk doğum günün. Nasıl kutlasam diye çok düşündüm; bu küçük uygulama da o düşüncelerin bir parçası, içindeki her kalp senin için.',
        'Sana her gün küçük bir şey söylemek istedim, çünkü seni her gün biraz daha çok sevdiğimi fark ettim. Bugün de bunlardan biri, ama en özel olanı.',
        'Umarım bu yeni yaşın sana sağlık, mutluluk ve gülümseyeceğin çok an getirir. Umarım hayat sana hak ettiğin kadar güzel davranır.',
        'Ben yanındayım, bugün de, yarın da, önümüzdeki bütün doğum günlerinde de. Seninle kurduğumuz her şey benim için çok değerli.',
        'İyi ki doğdun, iyi ki varsın, iyi ki hayatımdasın.'
      ],
      signature: 'Seni çok seven, Furkan'
    },
    slideshow: {
      title: 'Bizim güzel anılarımız 📸'
    },
    end: {
      title: 'İyi ki doğdun, iyi ki varsın 💗',
      button: 'Uygulamaya dön 💕'
    }
  }
};
