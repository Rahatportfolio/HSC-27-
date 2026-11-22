# আলাদা নতুন Android অ্যাপ — রিলিজ প্রস্তুতি

এই অ্যাপের package ID `com.prostuti.hsc27.fresh`, নাম **প্রস্তুতি নতুন**। এটি পুরোনো `com.prostuti.hsc27`-কে আপডেট বা মুছে দেয় না। দুটির ডেটা আলাদা; কোনো ডেটা স্বয়ংক্রিয়ভাবে স্থানান্তরিত হয় না। আলাদা ডিভাইস/PDF-সহ নিরাপদ ব্যাকআপ রাখুন, পুরোনো অ্যাপ uninstall বা Clear data করবেন না।

## Signing (শুধু repository administrator-এর জন্য)

বাস্তব রিলিজ এবং ভবিষ্যতের আপডেটের জন্য নতুন অ্যাপের নিজস্ব **স্থায়ী** signing keystore দরকার। এই অ্যাপের জন্য আলাদা keystore ব্যবহার করুন; পুরোনো অ্যাপের কী পুনরুদ্ধার করার প্রয়োজন নেই। keystore, তার পাসওয়ার্ড বা base64 **চ্যাটে, issue-তে, commit-এ বা build artifact-এ দেবেন না**। এই repository-তে secrets লেখার জন্য বর্তমান GitHub integration-এর অনুমতি নেই; repository administrator-কে নিরাপদে GitHub Actions secrets কনফিগার করতে হবে।

1. একটি বিশ্বস্ত কম্পিউটারে Java `keytool` ব্যবহার করে **repository-র বাইরে** keystore তৈরি করুন। যেমন: `keytool -genkeypair -alias prostuti-fresh -keyalg RSA -keysize 3072 -validity 9125 -storetype PKCS12 -keystore ~/prostuti-fresh-release.p12`। পাসওয়ার্ড কেবল স্থানীয় prompt-এ দিন। ফাইল ও পাসওয়ার্ড নিরাপদে, আলাদা জায়গায় ব্যাকআপ রাখুন; হারালে ভবিষ্যতে এই APK-র ওপর আপডেট সাইন করা যাবে না।
2. `keytool -list -v -alias prostuti-fresh -keystore ~/prostuti-fresh-release.p12` দিয়ে **certificate SHA-256 fingerprint** দেখুন। এটি secret key নয়; প্রথম রিলিজের expected identity হিসেবে অপরিবর্তিত রাখুন।
3. GitHub repository → Settings → Secrets and variables → Actions-এ নিচের repository secrets সেট করুন। মানগুলো চ্যাটে পাঠাবেন না:
   - `FRESH_ANDROID_KEYSTORE_BASE64` — keystore ফাইলের সম্পূর্ণ base64। একটি নিরাপদ স্থানীয় টার্মিনালে `base64 -w 0 ~/prostuti-fresh-release.p12` দিয়ে পাওয়া যায় (macOS-এ `base64 -i ~/prostuti-fresh-release.p12`)। আউটপুট private; শুধু secret editor-এ দিন।
   - `FRESH_ANDROID_KEYSTORE_PASSWORD` — keystore পাসওয়ার্ড।
   - `FRESH_ANDROID_KEY_ALIAS` — নির্বাচিত alias, উদাহরণে `prostuti-fresh`।
   - `FRESH_ANDROID_KEY_PASSWORD` — key password। PKCS12 keystore-এ সাধারণত এটি keystore password-ই।
   - `FRESH_ANDROID_CERT_SHA256` — উপরে দেখা certificate SHA-256 fingerprint; colon থাকলেও চলবে। ভবিষ্যৎ রিলিজে একই fingerprint থাকতে হবে।
4. workflow `Separate Android app` main-এ থাকার পর Actions থেকে **Run workflow** চালান। এটি source এবং Android 34/35-এ পাশাপাশি ইনস্টল ও আগের অ্যাপের পৃথক private file অক্ষত রাখার পরীক্ষা চালায়। সব পাস ও signing inputs থাকলে তবেই `prostuti-fresh-signed-apk` artifact দেবে। APK-এর package, non-debuggable manifest, ZIP, signature এবং pinned certificate পরীক্ষা হয়। workflow একটি debug APK-কে production হিসেবে প্রকাশ করে না।

Artifact ডাউনলোডের জন্য GitHub sign-in লাগতে পারে। Android emulator-এ পরীক্ষিত debug variant এবং সম্পূর্ণ signed APK যাচাই এক জিনিস নয়: signed APK-এর exact bytes physical phone-এ আলাদাভাবে পরীক্ষা না হওয়া পর্যন্ত সেই পরীক্ষা হয়েছে বলে দাবি করবেন না। এটি নতুন package হওয়ায় পুরোনো ডেটা import করতে চাইলে আগে বর্তমান Full backup-এর ফাইল অক্ষত ও খোলা যায় কি না পরীক্ষা করে রাখুন; একমাত্র কপি হিসেবে নতুন ইনস্টলের ওপর নির্ভর করবেন না। JSON এবং পুরোনো Full backup-এ media bytes বাদ থাকতে পারে।
