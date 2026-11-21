import type { LocaleCode, MaskStyle, ProfileId, SensitivityLevel } from './types.js';

export interface Dictionary {
  isRtl: boolean;
  appName: string;
  arabicTitle: string;
  tagline: string;
  statusActive: string;
  statusPaused: string;
  siteToggleLabel: string;
  siteWhitelisted: string;
  profileLabel: string;
  profiles: Record<ProfileId, { title: string; desc: string }>;
  maskStyleLabel: string;
  maskStyles: Record<MaskStyle, string>;
  sensitivityLabel: string;
  sensitivities: Record<SensitivityLevel, string>;
  blurStrengthLabel: string;
  autoMuteLabel: string;
  zeroFlashLabel: string;
  selfControlTitle: string;
  lockStatusUnlocked: string;
  lockStatusLocked: string;
  lockStatusCooldown: string;
  startCooldownBtn: string;
  activateLockBtn: string;
  pinPlaceholder: string;
  unlockWithPinBtn: string;
  lockedWarning: string;
  statsChecked: string;
  statsMasked: string;
  statsCached: string;
  statsLatency: string;
  statsEngine: string;
  onboardingBadge: string;
  onboardingHeading: string;
  onboardingSubheading: string;
  onboardingContinue: string;
  childExemptionNote: string;
  openOptionsBtn: string;
  optionsTitle: string;
  optionsSubtitle: string;
  sectionProfilesTitle: string;
  sectionVisualTitle: string;
  sectionWhitelistTitle: string;
  sectionSelfControlTitle: string;
  sectionBackupTitle: string;
  ruleFemaleFace: string;
  ruleMaleFace: string;
  ruleAwrahBody: string;
  ruleExposedNudity: string;
  ruleAutoEscalateNsfw: string;
  ruleChildAgeLabel: string;
  grayscaleLabel: string;
  failClosedLabel: string;
  altPeekLabel: string;
  previewTitle: string;
  previewSafeText: string;
  addDomainPlaceholder: string;
  addBtn: string;
  removeBtn: string;
  emptyWhitelist: string;
  lockDurationLabel: string;
  exportBtn: string;
  importBtn: string;
  clearCacheBtn: string;
  backupHint: string;
  diagBackendLabel: string;
  diagModelsLabel: string;
  msgSaved: string;
  msgImported: string;
  msgImportFailed: string;
  msgCacheCleared: string;
  msgInvalidDomain: string;
}

export const TRANSLATIONS: Record<LocaleCode, Dictionary> = {
  id: {
    isRtl: false,
    appName: 'Ghadhul Bashar',
    arabicTitle: 'غض البصر',
    tagline: 'Pelindung Pandangan AI Lokal — Cepat, Presisi, Zero-Flash',
    statusActive: 'Proteksi Aktif',
    statusPaused: 'Dijeda',
    siteToggleLabel: 'Situs Ini',
    siteWhitelisted: 'Dikecualikan',
    profileLabel: 'Profil Fiqh / Aturan Sensor',
    profiles: {
      brothers: {
        title: 'Ikhwan (Brothers)',
        desc: 'Blur wajah wanita dewasa, aurat terbuka pria/wanita & NSFW. Anak <10 thn tetap tampil.',
      },
      sisters: {
        title: 'Akhwat (Sisters)',
        desc: 'Blur wajah pria dewasa, aurat terbuka pria/wanita & NSFW. Wajah wanita tetap tampil.',
      },
      family: {
        title: 'Keluarga & Anak',
        desc: 'Menyaring aurat terbuka & NSFW sambil menjaga wajah berpakaian sopan tetap terlihat.',
      },
      strict: {
        title: 'Strict (Maksimal)',
        desc: 'Blur semua wajah dewasa pria & wanita, aurat terbuka, serta konten NSFW.',
      },
      'nsfw-only': {
        title: 'Kerja / NSFW-Only',
        desc: 'Hanya menutup ketelanjangan eksplisit & NSFW tanpa mem-blur wajah normal.',
      },
    },
    maskStyleLabel: 'Gaya Sensor Visual',
    maskStyles: {
      'surgical-frosted': 'Smart Surgical Frosted Blur',
      'surgical-ambient': 'Solid Ambient Fill (Anti-Siluet)',
      'surgical-pixelate': 'Pixelate / Mosaic Regional',
      'whole-blur': 'Whole-Media Blur Penuh',
    },
    sensitivityLabel: 'Sensitivitas AI',
    sensitivities: {
      relaxed: 'Santai',
      balanced: 'Seimbang',
      strict: 'Ketat',
    },
    blurStrengthLabel: 'Kekuatan Blur',
    autoMuteLabel: 'Auto-Mute Audio Saat Video Disensor',
    zeroFlashLabel: 'Zero-Flash Shimmer (Tutup Sebelum Render)',
    selfControlTitle: 'Benteng Kendali Diri (Offline)',
    lockStatusUnlocked: 'Tidak Terkunci',
    lockStatusLocked: 'Terkunci Aman',
    lockStatusCooldown: 'Cooldown Buka Kunci Aktif',
    startCooldownBtn: 'Minta Buka Kunci (Cooldown)',
    activateLockBtn: 'Kunci Pengaturan (Time-Lock)',
    pinPlaceholder: 'PIN Partner (min. 4 digit)',
    unlockWithPinBtn: 'Buka dengan PIN',
    lockedWarning: 'Perubahan yang melemahkan proteksi sedang dikunci.',
    statsChecked: 'Diperiksa',
    statsMasked: 'Disensor',
    statsCached: 'Cache Hit',
    statsLatency: 'Latensi',
    statsEngine: 'Mesin',
    onboardingBadge: 'Auto-Protect Sudah Aktif Sejak Detik Pertama',
    onboardingHeading: 'Pilih Profil Pandangan Anda',
    onboardingSubheading:
      'Semua analisis AI berjalan 100% di perangkat Anda tanpa internet atau server luar.',
    onboardingContinue: 'Simpan & Mulai Menjelajah Aman',
    childExemptionNote: 'Otomatis mengecualikan wajah anak-anak (<10 tahun).',
    openOptionsBtn: 'Pengaturan Lengkap',
    optionsTitle: 'Pengaturan Lengkap Ghadhul Bashar',
    optionsSubtitle:
      'Kendalikan aturan Fiqh granular, pratinjau sensor bedah, daftar pengecualian situs, benteng kendali diri, dan pencadangan konfigurasi lokal.',
    sectionProfilesTitle: '1. Profil Fiqh & Aturan Granular',
    sectionVisualTitle: '2. Gaya Sensor Visual, Video Guard & Pratinjau',
    sectionWhitelistTitle: '3. Daftar Pengecualian Domain (Whitelist)',
    sectionSelfControlTitle: '4. Benteng Kendali Diri & Hardening OS',
    sectionBackupTitle: '5. Cadangkan Konfigurasi (Export / Import) & Diagnostik',
    ruleFemaleFace: 'Sensor Wajah Wanita Dewasa',
    ruleMaleFace: 'Sensor Wajah Pria Dewasa',
    ruleAwrahBody: 'Sensor Bagian Aurat Terbuka',
    ruleExposedNudity: 'Sensor Ketelanjangan Eksplisit',
    ruleAutoEscalateNsfw: 'Eskalasi Otomatis Full-Mask jika Skor NSFW Tinggi',
    ruleChildAgeLabel: 'Batas Usia Pengecualian Anak',
    grayscaleLabel: 'Desaturasi Abu-Abu pada Area Sensor',
    failClosedLabel: 'Fail-Closed (Tetap Tutup Jika Gagal Memuat)',
    altPeekLabel: 'Alt + Hover untuk Intip Sementara',
    previewTitle: 'Pratinjau Langsung Smart Surgical Mask',
    previewSafeText: 'Slide materi & teks di sekitar area terdeteksi tetap 100% tajam.',
    addDomainPlaceholder: 'contoh: quran.com',
    addBtn: 'Tambah',
    removeBtn: 'Hapus',
    emptyWhitelist: 'Belum ada domain yang dikecualikan.',
    lockDurationLabel: 'Durasi Kunci Komitmen',
    exportBtn: 'Export Konfigurasi (.json)',
    importBtn: 'Import Konfigurasi (.json)',
    clearCacheBtn: 'Bersihkan Cache Deteksi Lokal',
    backupHint: 'File ekspor tidak menyertakan hash PIN. Mengimpor konfigurasi yang lebih longgar tetap mematuhi Time-Lock & PIN aktif.',
    diagBackendLabel: 'Backend Inferensi Aktif',
    diagModelsLabel: 'Model Lokal (4 ONNX XNNPACK)',
    msgSaved: 'Pengaturan disimpan.',
    msgImported: 'Konfigurasi berhasil diimpor.',
    msgImportFailed: 'Gagal mengimpor konfigurasi: format tidak valid atau dikunci Time-Lock.',
    msgCacheCleared: 'Cache deteksi memori & IndexedDB telah dibersihkan.',
    msgInvalidDomain: 'Masukkan nama domain yang valid (mis. example.com).',
  },
  en: {
    isRtl: false,
    appName: 'Ghadhul Bashar',
    arabicTitle: 'غض البصر',
    tagline: 'On-Device Surgical AI Gaze Shield — Fast & Zero-Flash',
    statusActive: 'Protection Active',
    statusPaused: 'Paused',
    siteToggleLabel: 'This Site',
    siteWhitelisted: 'Whitelisted',
    profileLabel: 'Modesty Policy Profile',
    profiles: {
      brothers: {
        title: 'Brothers (Default)',
        desc: 'Masks adult female faces, exposed awrah & NSFW. Exempts children <10 yrs.',
      },
      sisters: {
        title: 'Sisters',
        desc: 'Masks adult male faces, exposed awrah & NSFW while keeping female faces clear.',
      },
      family: {
        title: 'Family & Kids',
        desc: 'Masks exposed awrah & NSFW while keeping modestly dressed faces clear.',
      },
      strict: {
        title: 'Strict Gaze',
        desc: 'Masks all adult faces, exposed awrah body parts, and NSFW content.',
      },
      'nsfw-only': {
        title: 'Work / NSFW-Only',
        desc: 'Masks explicit nudity and NSFW only; normal faces remain untouched.',
      },
    },
    maskStyleLabel: 'Visual Masking Style',
    maskStyles: {
      'surgical-frosted': 'Smart Surgical Frosted Blur',
      'surgical-ambient': 'Solid Ambient Fill (Zero Silhouette)',
      'surgical-pixelate': 'Regional Pixelate / Mosaic',
      'whole-blur': 'Full Whole-Media Blur',
    },
    sensitivityLabel: 'AI Sensitivity',
    sensitivities: {
      relaxed: 'Relaxed',
      balanced: 'Balanced',
      strict: 'Strict',
    },
    blurStrengthLabel: 'Blur Intensity',
    autoMuteLabel: 'Auto-Mute Video Audio While Masked',
    zeroFlashLabel: 'Zero-Flash Shimmer Shield',
    selfControlTitle: 'Offline Self-Control Vault',
    lockStatusUnlocked: 'Unlocked',
    lockStatusLocked: 'Locked',
    lockStatusCooldown: 'Cooldown Countdown Active',
    startCooldownBtn: 'Request Unlock (Cooldown)',
    activateLockBtn: 'Enable Commitment Lock',
    pinPlaceholder: 'Partner PIN (min 4 chars)',
    unlockWithPinBtn: 'Unlock with PIN',
    lockedWarning: 'Weakening protection is currently locked.',
    statsChecked: 'Checked',
    statsMasked: 'Masked',
    statsCached: 'Cache Hits',
    statsLatency: 'Avg Latency',
    statsEngine: 'Engine',
    onboardingBadge: 'Auto-Protect Is Already Active',
    onboardingHeading: 'Choose Your Gaze-Protection Profile',
    onboardingSubheading:
      '100% local AI inference inside your browser. Zero images or URLs ever leave your device.',
    onboardingContinue: 'Save & Browse Safely',
    childExemptionNote: 'Automatically exempts children faces (<10 years old).',
    openOptionsBtn: 'Full Settings',
    optionsTitle: 'Ghadhul Bashar Full Settings',
    optionsSubtitle:
      'Fine-tune granular Fiqh rules, live surgical mask preview, domain allowlist, offline self-control vault, and local config backup.',
    sectionProfilesTitle: '1. Modesty Profile & Granular Rules',
    sectionVisualTitle: '2. Visual Masking, Video Guard & Live Preview',
    sectionWhitelistTitle: '3. Domain Whitelist Manager',
    sectionSelfControlTitle: '4. Offline Self-Control Vault & OS Hardening',
    sectionBackupTitle: '5. Configuration Backup (Export / Import) & Diagnostics',
    ruleFemaleFace: 'Mask Adult Female Faces',
    ruleMaleFace: 'Mask Adult Male Faces',
    ruleAwrahBody: 'Mask Exposed Awrah Body Regions',
    ruleExposedNudity: 'Mask Explicit Nudity',
    ruleAutoEscalateNsfw: 'Auto-Escalate to Full-Mask on High NSFW Score',
    ruleChildAgeLabel: 'Child Exemption Age Cutoff',
    grayscaleLabel: 'Desaturate Masked Region (Grayscale)',
    failClosedLabel: 'Fail-Closed (Keep Shielded on Fetch/Decode Error)',
    altPeekLabel: 'Alt + Hover Temporary Peek',
    previewTitle: 'Live Smart Surgical Mask Preview',
    previewSafeText: 'Surrounding slides, code, and captions stay 100% crisp.',
    addDomainPlaceholder: 'e.g. quran.com',
    addBtn: 'Add',
    removeBtn: 'Remove',
    emptyWhitelist: 'No whitelisted domains yet.',
    lockDurationLabel: 'Commitment Lock Duration',
    exportBtn: 'Export Config (.json)',
    importBtn: 'Import Config (.json)',
    clearCacheBtn: 'Clear Local Detection Cache',
    backupHint: 'Exports strip Partner PIN hashes. Importing weaker settings remains blocked while Time-Lock or PIN is active.',
    diagBackendLabel: 'Active Inference Backend',
    diagModelsLabel: 'Local Models (4 ONNX XNNPACK)',
    msgSaved: 'Settings saved.',
    msgImported: 'Configuration imported successfully.',
    msgImportFailed: 'Failed to import configuration: invalid JSON or blocked by active Time-Lock.',
    msgCacheCleared: 'In-memory & IndexedDB vision cache cleared.',
    msgInvalidDomain: 'Enter a valid domain name (e.g. example.com).',
  },
  ar: {
    isRtl: true,
    appName: 'غض البصر',
    arabicTitle: 'Ghadhul Bashar',
    tagline: 'حماية البصر بالذكاء الاصطناعي محلياً — سرعة فائقة دون وميض',
    statusActive: 'الحماية مفعّلة',
    statusPaused: 'متوقف مؤقتاً',
    siteToggleLabel: 'هذا الموقع',
    siteWhitelisted: 'مستثنى',
    profileLabel: 'ملف قواعد الحماية',
    profiles: {
      brothers: {
        title: 'للإخوة (افتراضي)',
        desc: 'طمس وجوه النساء البالغات والعورة المكشوفة والمحتوى غير اللائق مع استثناء الأطفال.',
      },
      sisters: {
        title: 'للأخوات',
        desc: 'طمس وجوه الرجال البالغين والعورة المكشوفة والمحتوى غير اللائق.',
      },
      family: {
        title: 'للعائلة والأطفال',
        desc: 'حجب العورة المكشوفة والمحتوى غير اللائق مع إبقاء الوجوه المحتشمة واضحة.',
      },
      strict: {
        title: 'حماية قصوى',
        desc: 'طمس جميع وجوه البالغين والعورة المكشوفة والمحتوى غير اللائق.',
      },
      'nsfw-only': {
        title: 'العمل / حجب الإباحية فقط',
        desc: 'حجب العري الصريح والمحتوى غير اللائق فقط دون طمس الوجوه العادية.',
      },
    },
    maskStyleLabel: 'نمط الطمس البصري',
    maskStyles: {
      'surgical-frosted': 'طمس ذكي موضعي (زجاجي)',
      'surgical-ambient': 'تعبئة لونية صلبة موضعية',
      'surgical-pixelate': 'طمس فسيفسائي موضعي',
      'whole-blur': 'طمس الصورة كاملة',
    },
    sensitivityLabel: 'حساسية الذكاء الاصطناعي',
    sensitivities: {
      relaxed: 'مرن',
      balanced: 'متوازن',
      strict: 'صارم',
    },
    blurStrengthLabel: 'شدة الطمس',
    autoMuteLabel: 'كتم الصوت تلقائياً أثناء طمس الفيديو',
    zeroFlashLabel: 'درع منع الوميض قبل الفحص',
    selfControlTitle: 'خزنة ضبط النفس (دون إنترنت)',
    lockStatusUnlocked: 'غير مقفل',
    lockStatusLocked: 'مقفل',
    lockStatusCooldown: 'فترة الانتظار قيد التشغيل',
    startCooldownBtn: 'طلب إلغاء القفل (انتظار)',
    activateLockBtn: 'تفعيل القفل الزمني',
    pinPlaceholder: 'رمز الشريك (٤ أحرف فأكثر)',
    unlockWithPinBtn: 'فتح بالرمز',
    lockedWarning: 'تخفيف الحماية مقفل حالياً.',
    statsChecked: 'تم فحصها',
    statsMasked: 'تم طمسها',
    statsCached: 'الذاكرة المؤقتة',
    statsLatency: 'زمن الاستجابة',
    statsEngine: 'المحرك',
    onboardingBadge: 'الحماية التلقائية تعمل الآن',
    onboardingHeading: 'اختر ملف الحماية المناسب لك',
    onboardingSubheading:
      'يعمل الذكاء الاصطناعي بالكامل على جهازك دون إرسال أي صور أو بيانات.',
    onboardingContinue: 'حفظ وبدء التصفح الآمن',
    childExemptionNote: 'استثناء تلقائي لوجوه الأطفال (أقل من ١٠ سنوات).',
    openOptionsBtn: 'الإعدادات الكاملة',
    optionsTitle: 'الإعدادات الكاملة لغض البصر',
    optionsSubtitle:
      'تحكم دقيق في قواعد الحماية، معاينة الطمس الموضعي، قائمة المواقع المستثناة، خزنة ضبط النفس، والنسخ الاحتياطي للإعدادات.',
    sectionProfilesTitle: '١. ملف الحماية والقواعد الدقيقة',
    sectionVisualTitle: '٢. نمط الطمس البصري وحماية الفيديو والمعاينة',
    sectionWhitelistTitle: '٣. إدارة النطاقات المستثناة',
    sectionSelfControlTitle: '٤. خزنة ضبط النفس وحماية النظام',
    sectionBackupTitle: '٥. تصدير واستيراد الإعدادات والتشخيص',
    ruleFemaleFace: 'طمس وجوه النساء البالغات',
    ruleMaleFace: 'طمس وجوه الرجال البالغين',
    ruleAwrahBody: 'طمس مناطق العورة المكشوفة',
    ruleExposedNudity: 'طمس العري الصريح',
    ruleAutoEscalateNsfw: 'ترقية تلقائية للطمس الكامل عند ارتفاع مؤشر NSFW',
    ruleChildAgeLabel: 'الحد العمري لاستثناء الأطفال',
    grayscaleLabel: 'تحويل منطقة الطمس إلى تدرج رمادي',
    failClosedLabel: 'إغلاق آمن عند تعذر فحص الوسائط',
    altPeekLabel: 'معاينة مؤقتة عند الضغط على Alt مع التمرير',
    previewTitle: 'معاينة حية للطمس الذكي الموضعي',
    previewSafeText: 'النصوص والشرائح التعليمية المحيطة تبقى واضحة ١٠٠٪.',
    addDomainPlaceholder: 'مثال: quran.com',
    addBtn: 'إضافة',
    removeBtn: 'إزالة',
    emptyWhitelist: 'لا توجد نطاقات مستثناة حالياً.',
    lockDurationLabel: 'مدة القفل الزمني',
    exportBtn: 'تصدير الإعدادات (.json)',
    importBtn: 'استيراد الإعدادات (.json)',
    clearCacheBtn: 'مسح ذاكرة الفحص المؤقتة',
    backupHint: 'ملف التصدير لا يتضمن رمز الشريك. يظل القفل الزمني سارياً عند محاولة استيراد إعدادات أضعف.',
    diagBackendLabel: 'محرك الاستدلال النشط',
    diagModelsLabel: 'النماذج المحلية (٤ نماذج ONNX)',
    msgSaved: 'تم حفظ الإعدادات.',
    msgImported: 'تم استيراد الإعدادات بنجاح.',
    msgImportFailed: 'تعذر استيراد الإعدادات: صيغة غير صالحة أو القفل الزمني نشط.',
    msgCacheCleared: 'تم مسح ذاكرة التخزين المؤقت للفحص.',
    msgInvalidDomain: 'أدخل اسم نطاق صحيح (مثال: example.com).',
  },
};
