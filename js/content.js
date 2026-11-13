/**
 * Meryem App — Content
 * Every word the app shows lives here, under one global CONTENT object, so Furkan can change any
 * text without touching view logic. Feature code only READS this object.
 * Poem lines in words.quotes are verified against the poem's own text — keep their exact wording.
 * `\u00a0` before a closing emoji is a no-break space: it keeps the emoji on the same line as
 * the word before it. Keep it when you edit such a line.
 */

var CONTENT = {
  greetings: {
    morning: [
      'Günaydın\u00a0☀️',
      'Günaydın, güne gülümseyerek başla',
      'Uyandın mı? Yeni bir gün seni bekliyor\u00a0🌿',
      'Günaydın Meryem, bugün yeni bir sayfa',
      'Gözlerini aç, güneş doğdu bile'
    ],
    afternoon: [
      'Günün nasıl geçiyor, merak ettim',
      'Biraz mola ver, bir su iç\u00a0💧',
      'Öğle arasında kısa bir nefes al',
      'Umarım günün güzel geçiyordur',
      'Küçük bir nefes molası zamanı\u00a0🌤️'
    ],
    evening: [
      'Akşamın hayırlı olsun\u00a0🌆',
      'Gün sona erdi, sıra dinlenmekte',
      'Bugün de bir gün daha geride kaldı',
      'Akşam oldu, ışıklar yanıyor',
      'Nasıl geçti günün, anlat bakalım'
    ],
    night: [
      'İyi geceler Meryem, rahat bir uyku\u00a0🌙',
      'Gözlerini kapat, yarın yeni bir gün',
      'Uyu rahatça, yarın yine buradayız',
      'Bu gece yıldızlar çok parlak\u00a0⭐',
      'Gece de güzel, iyi uykular'
    ],
    /* Her birthday (all day) replaces the time-of-day line above — Furkan speaking to her. */
    birthday: [
      'İyi ki doğdun\u00a0🎂',
      'Bugün senin günün, doğum günün kutlu olsun\u00a0🎉',
      'Mutlu yıllar, bugün senin için özel bir gün\u00a0🎂'
    ],
    /* On her birthday this replaces "Bugünün Mesajı" for the whole day. */
    birthdayMessage: 'Bugün doğum günün. Mutlu yıllar Meryem.'
  },

  together: {
    prefix: 'Birlikte',
    suffix: 'gündür\u00a0✨'
  },

  gate: {
    /* The quiet skip control in the gate's top corner (js/gate.js). */
    skip: { label: 'Geç', aria: 'Soruları geç' },
    yesLabel: 'Evet\u00a0💗',
    noLabels: [
      'Hayır',
      'Emin misin?',
      'Gerçekten mi?\u00a0🥺',
      'Bir daha düşün bence',
      'Olmaz öyle şey\u00a0😉',
      'Üzülüyorum bak\u00a0🥲',
      'Kalbimi kırıyorsun\u00a0💔',
      'Ağlayacağım bak\u00a0😭',
      'Yapma böyle ya\u00a0😢',
      'Son şansın bu ha',
      'Bu tuş bozuk galiba',
      'Neredeyse bitti, dayan',
      'Bu seçenek yok\u00a0💗'
    ],
    /* The reply is Furkan's answer after she presses Yes. */
    opener: {
      q: 'Meryem, hazır mısın?',
      reply: 'Harika, başlayalım\u00a0✨'
    },
    pool: [
      { q: 'Bugün gülümsedin mi?', reply: 'Ne güzel, devam\u00a0😄' },
      { q: 'Bir fincan çay içmeye var mısın?', reply: 'Su kaynıyor\u00a0☕' },
      { q: 'Küçük bir yürüyüş yapalım mı?', reply: 'Ceketini al, çıkıyoruz\u00a0🚶' },
      { q: 'Bugün yeni bir şey öğrendin mi?', reply: 'Merak güzel şey\u00a0📚' },
      { q: 'Sıradaki şarkıyı sen seçer misin?', reply: 'Listeye ekledim\u00a0🎵' },
      { q: 'Birlikte yıldızlara bakalım mı?', reply: 'Battaniyeyi getiriyorum\u00a0✨' }
    ],
    birthday: [
      { q: 'Bugün özel bir gün, biliyor musun?', reply: 'Bugün senin doğum günün\u00a0🎂' },
      { q: 'Sürprizi görmeye hazır mısın?', reply: 'O zaman başlıyoruz!\u00a0🎁' }
    ],
    meter: {
      q: 'Peki ne kadar heyecanlısın?',
      steps: ['Biraz', 'Çok', 'Çok çok', 'Dünyalar kadar', 'Sonsuz ∞'],
      button: 'İşte bu kadar!'
    },
    finale: {
      title: 'Harika, hazırız',
      text: 'Bu metin bir örnektir ve gerçek metinle değiştirilir.',
      button: 'İçeri gel\u00a0💕',
      birthdayButton: 'Sürprizini aç\u00a0🎁'
    }
  },

  words: {
    /* Small messages on the Sözler tab, in Furkan's voice. */
    ui: {
      favEmpty: 'Henüz favori sözün yok. Kalbe dokun, favorilere ekle\u00a0💗',   // favourites filter is on but empty
      jarHint: 'Kavanoza dokun, sana bir not çıksın\u00a0💌',                  // under the jar, before/while drawing
      jarReshuffled: 'Hepsini okudun! Kavanoz yeniden karışıyor\u00a0🔄'        // after all reasons were drawn
    },
    quotes: [
      {
        text: 'Örnek bir söz birinci satır,\nikinci satır burada,\nüçüncü satır sonda.',
        author: 'Örnek',
        source: 'Deneme metni'
      },
      {
        text: 'Bu bir örnek söz.\n…\nGerçek metin giriş yapınca yüklenir.',
        author: 'Örnek',
        source: 'Deneme metni'
      },
      {
        text: 'Küçük şeyler büyük günleri kurar.',
        author: 'Örnek',
        source: 'Deneme metni'
      },
      {
        text: 'Her yolculuk bir adımla başlar,\nbu adım da sana ait.',
        author: 'Örnek',
        source: 'Deneme metni'
      }
    ],
    lines: [
      'Bu bir örnek cümledir.',
      'Bugün küçük bir adım at.',
      'Güzel günler sana yakışır.',
      'Bir çay, bir kitap, sakin bir akşam.',
      'Gülümsemek bulaşıcıdır.',
      'Bugünün tadını çıkar.',
      'Yavaş git, ama vazgeçme.',
      'Güzel bir şey olacak, hissediyorum.'
    ],
    reasons: [
      'Bu bir örnek nottur: gülüşün odayı aydınlatıyor.',
      'Bu bir örnek nottur: küçük şeylere sevinmeyi biliyorsun.',
      'Bu bir örnek nottur: sabırlı ve nazik biri olduğun için.',
      'Bu bir örnek nottur: merakın hiç bitmiyor.',
      'Bu bir örnek nottur: yanında rahat hissedildiği için.',
      'Bu bir örnek nottur: gerçek notlar giriş yapınca yüklenir.'
    ],
    letters: [
      {
        id: 'miss',
        title: 'Beni özlediğinde',
        emoji: '💌',
        birthdayOnly: false,
        body: [
          'Bu bir örnek mektuptur, özlediğin bir an için yazıldı.',
          'Mesafe ne olursa olsun, kısa süre sonra yine konuşacaksınız.',
          'Bir nefes al ve gülümse, o an çok yakın.'
        ]
      },
      {
        id: 'sad',
        title: 'Canın sıkıldığında',
        emoji: '🤍',
        birthdayOnly: false,
        body: [
          'Canın sıkkınsa önce derin bir nefes al.',
          'Bu duygu geçici, sen kalıcısın.',
          'İstersen anlat, istersen sessiz kal; ikisi de olur.'
        ]
      },
      {
        id: 'sleep',
        title: 'Uyuyamadığında',
        emoji: '🌙',
        birthdayOnly: false,
        body: [
          'Gözlerin açık kalmışsa bırak bu satırlar seni yavaşça uyutsun.',
          'Bugünü geride bırak, yarın hâlâ orada olacak.',
          'Gözlerini kapat, güzel rüyalar seni bulsun.'
        ]
      },
      {
        id: 'angry',
        title: 'Bana kızdığında',
        emoji: '🐻',
        birthdayOnly: false,
        body: [
          'Kızgınsan bir sebebin vardır, bunu anlıyorum.',
          'Özür dilemek zor değil, üzmek istemem.',
          'Kızgınlığın geçince konuşalım.'
        ]
      },
      {
        id: 'laugh',
        title: 'Gülmek istediğinde',
        emoji: '😄',
        birthdayOnly: false,
        body: [
          'Gülmek mi istiyorsun? Şunu hayal et: bir penguen kayıyor.',
          'Üstelik tam kıyafetli, çok ciddi bir yüzle.',
          'Şimdi bir gülümse bakalım.'
        ]
      },
      {
        id: 'lonely',
        title: 'Yalnız hissettiğinde',
        emoji: '💗',
        birthdayOnly: false,
        body: [
          'Yalnız hissetmek bazen insanın içine sinsice girer.',
          'Ama seni düşünen biri var, tam burada.',
          'İstediğin an yaz, istediğin an ara.'
        ]
      },
      {
        id: 'proud',
        title: 'Gurur duymak istediğinde',
        emoji: '✨',
        birthdayOnly: false,
        body: [
          'Bugün kendinle gurur duyman gereken bir gün olabilir.',
          'Küçük ya da büyük, attığın her adım değerli.',
          'Başardığın her şey senin emeğin.'
        ]
      },
      {
        id: 'bday',
        title: 'Doğum günü sabahın',
        emoji: '🎂',
        birthdayOnly: true,
        body: [
          'Bugün gözlerini açtığında ilk bilmeni istediğim şey: bugün senin günün.',
          'Bu bir örnek mektuptur ve gerçek metinle değiştirilir.',
          'İyi ki doğdun Meryem, güzel bir gün geçir.'
        ]
      }
    ]
  },

  dates: {
    /* Engagement card: days since the engagement date (CONFIG.engagementDate). */
    engagementLabel: 'Özel günden beri',
    /* Wedding card. CONFIG.wedding holds the date; while only the month is known it shows months. */
    weddingLabel: 'Büyük güne',
    weddingApprox: 'yaklaşık {months} ay var',          // {months} is filled in
    weddingThisMonth: 'Bu ay büyük gün\u00a0🎉',
    weddingDone: 'Büyük gün geldi\u00a0🎉',
    hisToday: 'Bugün onun doğum günü\u00a0🎉'          // his card, on his birthday
  },

  birthday: {
    /* The 🎁 tab card once the surprise is unlocked (Furkan speaking to her). */
    ready: {
      title: 'Sürpriz hazır!\u00a0🎉',
      firstTime: 'Dokun, sürpriz başlasın\u00a0🎁',                   // before she has opened it this year
      again: 'İstediğin zaman yeniden aç\u00a0💗'   // after she has opened it
    },
    balloonsPrompt: 'Bir balon seç, içinden bir dilek çıksın\u00a0🎈',            // above the balloons scene
    locked: {
      title: 'Burada bir sürpriz var\u00a0🎁',
      subtitle: 'Ama doğum gününe kadar kilitli\u00a0🔒',
      teases: [
        'Biraz bekle, {days} gün kaldı\u00a0🙈',
        'Kurcalama, kilit sağlam\u00a0🔒',
        'Bu bölüm doğum gününde açılacak',
        '{days} gün sonra burada buluşuruz',
        'Biraz sabır, sürpriz yolda\u00a0😉',
        'Kilit yerinde, biraz daha bekle\u00a0🔒'
      ]
    },
    title: 'Mutlu yıllar Meryem',
    wish: 'Gözlerini kapat ve bir dilek tut.',
    blow: {
      prompt: 'Mumları üfle!',
      micButton: 'Mikrofonu aç ve üfle\u00a0🎤',
      tapHint: 'Ya da mumlara dokunarak söndür',
      micDenied: 'Mikrofon izni yoksa sorun değil, mumlara dokunman yeterli\u00a0💗'
    },
    afterBlow: 'Dileğin kaydedildi, güzel şeyler olsun\u00a0✨',
    balloons: [
      'Bu yeni yaşın sana mutluluk getirsin\u00a0🎈',
      'Gülüşün hiç eksilmesin.',
      'Dileklerin gerçek olsun.',
      'Bu yıl güzel şeyler getirsin.',
      'Neşen hep yanında olsun.',
      'Her gün küçük bir sevinç bulasın.',
      'Doğum günün kutlu olsun\u00a0🎂',
      'Nice güzel yıllara.'
    ],
    gift: {
      prompt: 'Sana bir hediyem var.',
      open: 'Hediyeni aç\u00a0🎁'
    },
    letter: {
      greeting: 'Sevgili Meryem,',
      paragraphs: [
        'Bu bir örnek mektuptur. Gerçek mektup giriş yaptıktan sonra yüklenir.',
        'İkinci paragraf da örnek metindir; burada kimseye ait bir anı yoktur.',
        'Üçüncü paragraf, yalnızca sayfa düzenini göstermek için yazıldı.',
        'Dördüncü paragraf: kısa, sade ve herkese uyan bir metin.',
        'Beşinci paragraf de aynı şekilde bir yer tutucudur.',
        'Altıncı paragraf: yeni yaşın sana güzel günler getirmesini dilerim.',
        'Yedinci paragraf: bu metin gerçek mektupla değiştirilecek.',
        'İyi ki doğdun.'
      ],
      signature: 'İçtenlikle, Furkan'
    },
    /* Scene after the letter: his recorded voice message (audio/sesli-mesaj.*). Skipped when no file. */
    voice: {
      title: 'Bir de sana bir ses kaydı var',
      hint: 'Sesini aç, sonra dokun\u00a0🎧',
      play: 'Dinle',
      pause: 'Durdur'
    },
    /* Love coupons: his offers to her. Shown as a scene in the surprise and kept on the 🎁 tab. */
    coupons: {
      title: 'Doğum günü kuponların\u00a0🎟️',
      hint: 'İstediğin zaman bir kupona dokun, bana göster, gerisi bende\u00a0💌',
      confirm: 'Bu kuponu şimdi kullanmak istiyor musun?',
      yes: 'Evet, kullanıyorum',
      no: 'Sonra',
      used: 'Kullanıldı',
      items: [
        { id: 'hug', emoji: '🤗', title: 'Örnek kupon: sarılma', text: 'Bu bir örnek kupondur.' },
        { id: 'yourday', emoji: '👑', title: 'Örnek kupon: senin günün', text: 'Bu bir örnek kupondur.' },
        { id: 'trip', emoji: '🗺️', title: 'Örnek kupon: küçük gezi', text: 'Bu bir örnek kupondur.' },
        { id: 'dinner', emoji: '🍽️', title: 'Örnek kupon: yemek', text: 'Bu bir örnek kupondur.' },
        { id: 'walk', emoji: '🌙', title: 'Örnek kupon: yürüyüş', text: 'Bu bir örnek kupondur.' },
        { id: 'win', emoji: '🏳️', title: 'Örnek kupon: son söz', text: 'Bu bir örnek kupondur.' },
        { id: 'letter', emoji: '💌', title: 'Örnek kupon: mektup', text: 'Bu bir örnek kupondur.' },
        { id: 'wish', emoji: '🎁', title: 'Örnek kupon: dilek', text: 'Bu bir örnek kupondur.' }
      ]
    },
    slideshow: {
      title: 'Güzel anılarımız\u00a0📸'
    },
    end: {
      title: 'İyi ki doğdun\u00a0💗',
      button: 'Hadi içeri gel\u00a0💕'
    }
  },

  /* Takip (js/habits.js). Voice: "biz" - the two of us, warm and short. Nothing here says who
     does what between them; a line names a person only where a box belongs to that person. */
  habits: {
    me: {
      title: 'Ben kimim?',
      sub: 'Bu telefonda kim işaretleyecek?',
      line: 'Ben:',
      change: 'değiştir',
      cancel: 'Vazgeç'
    },
    today: {
      title: 'Bugün',
      hint: 'Kendi kalbine dokun, yaptıkça yanar. İkimiz de yapınca ortadaki kalp yanar\u00a0💞'
    },
    notStarted: {
      title: '1 Ekim\'de başlıyoruz',
      sub: 'O gün kutular burada açılır\u00a0🐻'
    },
    groups: { together: 'Birlikte', meryem: 'Meryem', furkan: 'Furkan' },
    legendJoint: 'ikimiz de',
    noData: '—',
    monthsShort: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
    stats: {
      lead: 'Önde: {name} (+{n} puan)',
      tie: 'Başa baş\u00a0💞',
      jointDays: '{n} gün ikimiz de',
      streakDays: '{n} gün',
      streakNow: 'seri',
      streakBest: 'en uzun seri'
    },
    daily: {
      title: 'Gün gün',
      aria: 'Gün gün, ayın her günü için yüzdeler. Bu ay Meryem {m}, Furkan {f}'
    },
    bars: { title: 'Görev görev' },
    mom: {
      title: 'Aydan aya',
      hint: 'Her ay için yüzdeler'
    },
    report: {
      title: '{month} karnesi',
      best: 'En düzenli görev: {item} ({pct})',
      streak: '{name} en uzun seri: 🔥 {n} gün',
      teaser: 'Ay bitince karnemiz burada\u00a0🐻',
      closing: [
        'Bir ay daha geride kaldı\u00a0👏',
        'Adım adım ilerleyen bir ay\u00a0🌷',
        'Düzenli gitmek güzel\u00a0🌱',
        'Gelecek ay da devam\u00a0💪',
        'Güzel bir ay oldu\u00a0🌟',
        'Ay tamamlandı, yenisi için hazırız\u00a0✨'
      ]
    },
    log: {
      title: 'Geçmiş',
      empty: 'Bu ayda henüz işaret yok',
      undone: 'geri aldı',
      pending: 'kaydediliyor',
      box: 'kutu: {name}',
      all: 'Tümünü gör ({n})',
      less: 'Daha az göster'
    },
    sheetEmpty: 'Bu gün için kutu yok',
    readError: 'Kayıtlara ulaşamadık, sayfayı yenileyelim 💗',
    previewNote: 'Önizlemede kayıt yapılmıyor 💗',
    saveError: 'Kaydedemedik, bir daha dokunalım\u00a0💗',
    dow: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
    days: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
    months: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
    aria: {
      done: 'yapıldı',
      notDone: 'yapılmadı',
      locked: '{name} kendisi işaretler',
      jointOn: 'ikimiz de yaptık',
      jointOff: 'ikimiz de yapınca yanar',
      prev: 'Önceki ay',
      next: 'Sonraki ay',
      day: '{day}: Meryem %{m}, Furkan %{f}'
    }
  },

  /* The private-texts loader and its import/export panel (js/private.js). Interface strings only:
     the texts themselves are never written here, they arrive from the signed-in account. */
  privateTexts: {
    loadError: 'Özel metinler yüklenemedi',
    panel: {
      title: 'Özel metinler',
      hint: 'Bir JSON dosyası yükle ya da kayıtlı metinleri indir.',
      choose: 'Dosya seç',
      download: 'İndir',
      saved: 'Metinler kaydedildi. Sayfayı yenile\u00a0💗',
      invalid: 'Dosya geçersiz: {reason}',
      saveError: 'Metinler kaydedilemedi',
      noDocument: 'Kayıtlı metin yok',
      downloadError: 'Metinler indirilemedi'
    }
  }
};
