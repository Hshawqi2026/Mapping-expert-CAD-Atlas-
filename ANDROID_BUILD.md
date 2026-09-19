# بناء تطبيق Android احترافي

يستخدم المشروع Expo SDK 54 مع React Native، ويحتفظ بكل وظائف الخريطة والمسح والتخزين المحلي والاستيراد والتصدير والنمذجة ثلاثية الأبعاد. لا يُحفظ مجلد `android/` في Git؛ بل يُولّد بشكل حتمي من `app.config.ts` أثناء البناء حتى تبقى ملفات Android متزامنة مع نسخة Expo والاعتمادات.

## البناء التلقائي للاختبار

سير العمل `.github/workflows/android-apk.yml` يعمل عند كل دفع إلى `main` أو يدوياً من تبويب **Actions**. ينفذ فحص TypeScript والاختبارات، ثم يثبت Node.js وpnpm وJava 17، ويولّد مشروع Android الأصلي عبر `expo prebuild`، ويبني APK داخلياً ويرفعه كـ artifact باسم `agon-surveyor-android-apk`.

هذا APK مناسب للتثبيت والاختبار الداخلي. توقيعه الافتراضي ليس توقيع نشر Google Play.

## بناء إصدار Google Play

سير العمل `.github/workflows/android-release.yml` يعمل يدوياً من **Actions → Build Android Release → Run workflow**. قبل تشغيله، أنشئ مفتاح توقيع Android إنتاجياً ثم أضف القيم التالية إلى GitHub Actions Secrets، ويفضل داخل Environment باسم `production`:

| Secret                      | القيمة                                   |
| --------------------------- | ---------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | محتوى ملف keystore بعد تحويله إلى Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور keystore                       |
| `ANDROID_KEY_ALIAS`         | اسم المفتاح داخل keystore                |
| `ANDROID_KEY_PASSWORD`      | كلمة مرور المفتاح                        |

ينتج سير العمل ملف AAB موقّعاً باسم artifact `agon-surveyor-android-aab`، وهو الملف المناسب للرفع إلى Google Play Console. لا تضع ملف keystore أو كلمات المرور داخل المستودع.

## البناء المحلي

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm exec expo prebuild --platform android --no-install --non-interactive
cd android
./gradlew assembleRelease
```

للنشر العام استخدم سير العمل الموقّع بعد إعداد Secrets، ولا تعتمد على توقيع debug أو على مفاتيح موجودة في جهاز المطور.
