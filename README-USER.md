# EXELMJ — دليل سريع | Quick Guide

<div dir="rtl">

## بالعربية

**EXELMJ** برنامج جداول لسطح المكتب يشبه اكسل، يعمل بدون إنترنت.

### التثبيت
شغّل ملف `EXELMJ Setup 0.1.0.exe`. إذا ظهر تحذير ويندوز الأزرق اضغط
«مزيد من المعلومات» ثم «تشغيل على أي حال» — يظهر لأن الملف غير موقّع رقمياً
وهو أمر طبيعي للبرامج المستقلة.

### أهم الميزات
- جدول وخلايا ومعادلات مثل اكسل (جمع، متوسط، وأغلب الدوال المعروفة).
- تنسيق كامل: خطوط، ألوان، حدود، دمج خلايا، صيغ أرقام وعملات وتواريخ.
- فتح وحفظ ملفات اكسل الحقيقية (xlsx) — من قائمة «ملف».
- رسوم بيانية: قائمة «إدراج ← رسم بياني» بعد تحديد بياناتك.
- فرز وفلترة وبحث واستبدال وتنسيق شرطي وتحقق من البيانات — من أشرطة الأدوات.
- تبديل اللغة (عربي/إنجليزي) من قائمة «اللغة».
- نسخة احتياطية تلقائية باسم `اسم-الملف.xlsx.bak` قبل كل حفظ فوق ملف موجود.

### أهم الاختصارات (مطابقة لاكسل)
حفظ Ctrl+S — فتح Ctrl+O — جديد Ctrl+N — تراجع Ctrl+Z — إعادة Ctrl+Y —
نسخ/لصق/قص Ctrl+C/V/X — عريض/مائل/تسطير Ctrl+B/I/U — بحث Ctrl+F — استبدال Ctrl+H

### درع الأمانة 🛡️
افتح أي ملف اكسل قديم فيه **جداول محورية أو رسوم اكسل أصلية أو ماكرو**، عدّل
ما تشاء واحفظ — هذه الأجزاء **تبقى سليمة داخل الملف** وتشتغل عند فتحه في
اكسل. (لا تظهر داخل EXELMJ نفسه، لكنها لا تُحذف أبداً.) ملفات الماكرو
`.xlsm` مدعومة فتحاً وحفظاً. تنبيه: إعادة تسمية ورقة تُسقط الأجزاء المرتبطة
بها.

### حدود معروفة في هذه النسخة
1. عند فتح ملفاتنا في اكسل الأصلي: كل شيء يظهر (أرقام، معادلات، تنسيق، صور،
   ملاحظات) **ما عدا رسوم EXELMJ البيانية** — ترجع للظهور عند فتح الملف في
   EXELMJ.
2. في الواجهة العربية تنعكس القوائم والأدوات، لكن شبكة الجدول نفسها يبقى
   العمود A على اليسار (اتجاه الورقة المحفوظ يفتح معكوساً صح في اكسل).
3. لا يدعم بعد: تشغيل الماكرو داخل البرنامج، إنشاء جداول محورية، الطباعة،
   صيغة xls القديمة جداً.

</div>

---

## English

**EXELMJ** is an offline Excel-like desktop spreadsheet.

### Install
Run `EXELMJ Setup 0.1.0.exe`. If Windows SmartScreen appears, click
"More info" → "Run anyway" (the installer is unsigned — normal for
independent apps).

### Highlights
- Excel-like grid, formulas (SUM, AVERAGE and most common functions).
- Full formatting: fonts, colors, borders, merged cells, number/currency/date formats.
- Opens and saves real Excel `.xlsx` files (File menu).
- Charts: select data → Insert → Chart (bar/line/area/pie).
- Sort, filter, find & replace, conditional formatting, data validation.
- Arabic/English UI switch (Language menu).
- Automatic `.bak` backup before overwriting an existing file.

### Known limits (v1)
1. Files opened in real Excel show everything **except EXELMJ charts**
   (they reappear when the file is opened in EXELMJ).
2. In the Arabic UI the menus and toolbars mirror right-to-left, but the
   grid itself keeps column A on the left.
3. Not supported: macros, pivot tables, printing, embedded images/comments,
   legacy `.xls`.
