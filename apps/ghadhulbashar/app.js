const I18N = {
  id: {
    dir: 'ltr',
    navDemo: 'Demo',
    navArch: 'Arsitektur',
    navCompare: 'Perbandingan',
    navPrivacy: 'Privasi',
    heroBadge: '100% On-Device AI · Open Source AGPL-3.0 · v1.1.0',
    heroTitle: 'Lindungi Pandangan Tanpa Merusak Halaman Web.',
    heroDesc:
      'Ekstensi browser generasi baru dengan Smart Surgical Masking di dalam Closed Shadow DOM, Zero-Flash Shield 0 ms, dan Adaptive Cascade <150 ms — 100% lokal tanpa internet.',
    ctaChrome: 'Unduh Chrome / Brave / Edge (.zip)',
    ctaFirefox: 'Unduh Firefox (.zip)',
    ctaGithub: 'Kode Sumber GitHub',
    metricWasm: 'Adaptive WASM CPU',
    metricDhash: '64-bit dHash Cache',
    metricCloud: 'Data ke Server Luar',
    metricModels: 'ONNX XNNPACK Lokal',
    demoToolbarTitle: 'Simulasi Sensor Interaktif',
    modeSurgical: 'Surgical (Ghadhul Bashar)',
    modeWhole: 'Whole-Blur (Lama)',
    modeOff: 'Tanpa Proteksi',
    demoSlideNote: 'Teks materi kuliah, kode program, dan deskripsi produk tetap 100% tajam terbaca.',
    personFemale: 'Dewasa (Wanita)',
    personMale: 'Dewasa (Pria)',
    personChild: 'Anak (<10 thn · Aman)',
    profBrothers: 'Ikhwan',
    profSisters: 'Akhwat',
    profFamily: 'Keluarga',
    profStrict: 'Strict',
    archHeading: 'Arsitektur Fase 2: Cepat, Presisi, Zero-Breakage',
    archSub:
      'Dibangun dari nol untuk mengatasi lambatnya model tunggal, kebocoran kilatan frame, dan error CORS pada ekstensi pelindung pandangan terdahulu.',
    feat1Desc:
      'Stage 0 menyaring UI/gradien dalam <1 ms, Stage 1 YuNet mendeteksi wajah hingga 16 orang, Stage 2–3 NudeNet & AGR0013 mengecualikan anak <10 tahun, dan Marqo ViT-Tiny hanya dipanggil pada gambar ambigu atau manga/ilustrasi.',
    feat2Desc:
      'Media langsung ditutup shimmer saat masuk DOM sebelum pixel dirender. Overlay hidup di dalam Closed Shadow Root di luar pohon DOM situs sehingga tidak memicu error hidrasi React/Next.js.',
    feat3Desc:
      'Tidak pernah mengubah atribut crossorigin atau dimensi elemen — menjaga audio/video lintas-domain tetap lancar. Dilengkapi Commitment Time-Lock, Partner PIN PBKDF2-SHA-256, dan Export/Import JSON.',
    compareHeading: 'Perbandingan Jujur dengan Ekstensi Terdahulu',
    colFeature: 'Kemampuan',
    rowSurgical: 'Smart Surgical Mask (Teks Tetap Tajam)',
    rowChild: 'Pengecualian Anak Otomatis (<10 thn)',
    rowCors: 'Zero-CORS & SSR Hydration Safe',
    rowBundle: 'Ukuran Bundel Model + Kecepatan CPU',
    rowVault: 'Offline Time-Lock, Partner PIN & Export/Import',
  },
  en: {
    dir: 'ltr',
    navDemo: 'Demo',
    navArch: 'Architecture',
    navCompare: 'Comparison',
    navPrivacy: 'Privacy',
    heroBadge: '100% On-Device AI · Open Source AGPL-3.0 · v1.1.0',
    heroTitle: 'Protect Your Gaze Without Breaking the Web.',
    heroDesc:
      'Next-generation browser shield featuring Closed Shadow DOM Surgical Masking, deterministic 0 ms Zero-Flash protection, and an Adaptive Cascade (<150 ms) — 100% local with zero cloud calls.',
    ctaChrome: 'Download Chrome / Brave / Edge (.zip)',
    ctaFirefox: 'Download Firefox (.zip)',
    ctaGithub: 'GitHub Source',
    metricWasm: 'Adaptive WASM CPU',
    metricDhash: '64-bit dHash Cache',
    metricCloud: 'External Server Calls',
    metricModels: 'Local XNNPACK ONNX',
    demoToolbarTitle: 'Interactive Mask Simulation',
    modeSurgical: 'Surgical (Ghadhul Bashar)',
    modeWhole: 'Whole-Blur (Legacy)',
    modeOff: 'Unprotected',
    demoSlideNote: 'Lecture slides, code snippets, and surrounding text remain 100% crisp.',
    personFemale: 'Adult (Female)',
    personMale: 'Adult (Male)',
    personChild: 'Child (<10 yrs · Safe)',
    profBrothers: 'Brothers',
    profSisters: 'Sisters',
    profFamily: 'Family',
    profStrict: 'Strict',
    archHeading: 'Phase 2 Architecture: Fast, Precise, Zero-Breakage',
    archSub:
      'Engineered from scratch to eliminate single-model CPU stalls, flash leaks, and CORS playback breakage seen in legacy filters.',
    feat1Desc:
      'Stage 0 skips trivial UI graphics in <1 ms, Stage 1 YuNet catches up to 16 faces, Stage 2–3 NudeNet & AGR0013 exempt children <10, and Marqo ViT-Tiny runs only on ambiguous skin close-ups, anime, or B&W manga.',
    feat2Desc:
      'Media elements are shielded upon DOM discovery before pixels render. Overlays live inside a Closed Shadow Root outside the page tree, preventing React/Next.js SSR hydration warnings.',
    feat3Desc:
      'Never mutates crossorigin or dimension attributes — keeping cross-origin audio/video working cleanly. Includes offline Commitment Time-Lock, PBKDF2-SHA-256 Partner PIN, and safe JSON backup.',
    compareHeading: 'Honest Comparison vs Legacy Extensions',
    colFeature: 'Capability',
    rowSurgical: 'Smart Surgical Mask (Crisp Context)',
    rowChild: 'Automatic Child Exemption (<10 yrs)',
    rowCors: 'Zero-CORS & SSR Hydration Safe',
    rowBundle: 'Model Size & CPU Speed',
    rowVault: 'Offline Time-Lock, Partner PIN & Export/Import',
  },
  ar: {
    dir: 'rtl',
    navDemo: 'محاكاة',
    navArch: 'البنية',
    navCompare: 'المقارنة',
    navPrivacy: 'الخصوصية',
    heroBadge: 'ذكاء اصطناعي محلي ١٠٠٪ · مفتوح المصدر AGPL-3.0 · v1.1.0',
    heroTitle: 'احفظ بصرك دون تعطيل مواقع الويب.',
    heroDesc:
      'إضافة متصفح حديثة توفر طمساً موضعياً ذكياً داخل Closed Shadow DOM، ودرعاً فورياً لمنع الوميض، وتسلسل استدلال تكيفي أقل من ١٥٠ مللي ثانية — محلياً بالكامل دون اتصال بالسحابة.',
    ctaChrome: 'تنزيل لـ Chrome / Brave / Edge (.zip)',
    ctaFirefox: 'تنزيل لـ Firefox (.zip)',
    ctaGithub: 'الشيفرة المصدرية على GitHub',
    metricWasm: 'متوسط معالج WASM',
    metricDhash: 'ذاكرة dHash 64-bit',
    metricCloud: 'بيانات مرسلة للخارج',
    metricModels: 'نماذج ONNX محلية',
    demoToolbarTitle: 'محاكاة حية للطمس الموضعي',
    modeSurgical: 'طمس موضعي (غض البصر)',
    modeWhole: 'طمس كامل (تقليدي)',
    modeOff: 'بدون حماية',
    demoSlideNote: 'الشرائح التعليمية والأكواد والنصوص المحيطة تبقى واضحة ١٠٠٪.',
    personFemale: 'بالغ (أنثى)',
    personMale: 'بالغ (ذكر)',
    personChild: 'طفل (<١٠ سنوات · مستثنى)',
    profBrothers: 'للإخوة',
    profSisters: 'للأخوات',
    profFamily: 'للعائلة',
    profStrict: 'صارم',
    archHeading: 'معمارية المرحلة الثانية: سرعة فائقة دون تعارض',
    archSub:
      'صُممت من الصفر لتجاوز بطء النماذج الثقيلة ووميض الصور قبل الفحص وأخطاء CORS في الإضافات التقليدية.',
    feat1Desc:
      'يتخطى المسار الأول العناصر غير العضوية في أقل من ١ مللي ثانية، ثم يكشف YuNet حتى ١٦ وجهاً، ويعفي AGR0013 الأطفال دون ١٠ سنوات، ولا يعمل نموذج Marqo الثقيل إلا في الحالات الملتبسة والمانجا.',
    feat2Desc:
      'تُحجب الوسائط فور ظهورها في DOM قبل عرض الإطارات. وتُعرض الأقنعة داخل Closed Shadow Root معزول عن شجرة الصفحة دون كسر تطبيقات React/Next.js.',
    feat3Desc:
      'لا يغير سمات crossorigin أبداً للحفاظ على عمل الصوتيات والفيديو. ويتضمن خزنة ضبط النفس الزمنية ورمز الشريك ونسخاً احتياطياً آمناً للإعدادات.',
    compareHeading: 'مقارنة صريحة مع الإضافات السابقة',
    colFeature: 'الميزة',
    rowSurgical: 'طمس موضعي ذكي مع بقاء النصوص واضحة',
    rowChild: 'استثناء تلقائي للأطفال (<١٠ سنوات)',
    rowCors: 'توافق تام مع CORS وتطبيقات React',
    rowBundle: 'حجم النماذج وسرعة المعالج',
    rowVault: 'قفل زمني دون إنترنت وتصدير/استيراد الإعدادات',
  },
};

let demoMode = 'surgical';
let demoProfile = 'brothers';

function syncDemo() {
  const maskF = document.getElementById('maskFemale');
  const maskM = document.getElementById('maskMale');
  const whole = document.getElementById('demoWholeOverlay');

  if (demoMode === 'off') {
    whole.classList.add('hidden');
    maskF.classList.add('hidden');
    maskM.classList.add('hidden');
    return;
  }
  if (demoMode === 'whole') {
    whole.classList.remove('hidden');
    maskF.classList.add('hidden');
    maskM.classList.add('hidden');
    return;
  }

  whole.classList.add('hidden');
  const blurFemale = demoProfile === 'brothers' || demoProfile === 'strict';
  const blurMale = demoProfile === 'sisters' || demoProfile === 'strict';
  maskF.classList.toggle('hidden', !blurFemale);
  maskM.classList.toggle('hidden', !blurMale);
}

function applyLang(lang) {
  const dict = I18N[lang] || I18N.id;
  document.documentElement.lang = lang;
  document.documentElement.dir = dict.dir;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key && dict[key]) el.textContent = dict[key];
  }
}

document.getElementById('langSelect')?.addEventListener('change', (ev) => {
  applyLang(ev.target.value);
});

for (const btn of document.querySelectorAll('#demoModeGroup .seg-btn')) {
  btn.addEventListener('click', () => {
    demoMode = btn.getAttribute('data-mode') || 'surgical';
    for (const b of document.querySelectorAll('#demoModeGroup .seg-btn')) {
      b.classList.toggle('active', b === btn);
    }
    syncDemo();
  });
}

for (const chip of document.querySelectorAll('#demoProfiles .chip')) {
  chip.addEventListener('click', () => {
    demoProfile = chip.getAttribute('data-profile') || 'brothers';
    for (const c of document.querySelectorAll('#demoProfiles .chip')) {
      c.classList.toggle('active', c === chip);
    }
    syncDemo();
  });
}

syncDemo();
