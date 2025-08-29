// ================== إعدادات Firebase (كما هي) ==================
const firebaseConfig = {
  apiKey: "AIzaSyB6dC1UAS0-ilt-dj9UpcLIPljwbI3FCZs",
  authDomain: "qusaystore-ec327.firebaseapp.com",
  projectId: "qusaystore-ec327",
  storageBucket: "qusaystore-ec327.firebasestorage.app",
  messagingSenderId: "701743074708",
  appId: "1:701743074708:web:defc2de594567b6624d381",
  measurementId: "G-00R4XQCB1V"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

/* ================== أدوات محلية للجلسة ================== */
// نقرأ مفتاح الجلسة من localStorage (حُفظ أثناء الدخول)
function getLocalSessionKey() {
  try {
    const s = JSON.parse(localStorage.getItem("sessionKeyInfo") || "null");
    return s?.sessionKey || "";
  } catch {
    return "";
  }
}

// نافذة عامة لرسائل انتهاء/فشل الجلسة
function showSessionModal(messageText = "صلاحية الجلسة منتهية") {
  // لا تنشئ ثانية إن كانت موجودة
  if (document.getElementById("session-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "session-overlay";
  overlay.style = `
    position:fixed; inset:0; background:rgba(0,0,0,.6);
    display:flex; align-items:center; justify-content:center; z-index:99999;
  `;

  const box = document.createElement("div");
  box.style = `
    background:#fff; padding:22px 24px; border-radius:14px; width:min(420px,90vw);
    box-shadow:0 20px 60px rgba(0,0,0,.2); text-align:center; direction:rtl; font-family:system-ui,-apple-system,Segoe UI,Roboto,Tahoma,Arial;
  `;

  const title = document.createElement("h3");
  title.textContent = messageText;
  title.style = "margin:0 0 12px; font-size:18px; color:#111827;";

  const btn = document.createElement("button");
  btn.textContent = "تسجيل الخروج";
  btn.style = `
    padding:10px 16px; background:#ef4444; color:#fff; border:0; border-radius:10px;
    cursor:pointer; font-size:16px;
  `;
  btn.onclick = async () => {
    try { await firebase.auth().signOut(); } catch {}
    try { localStorage.removeItem("sessionKeyInfo"); } catch {}
    window.location.href = "login.html";
  };

  box.appendChild(title);
  box.appendChild(btn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// نافذة انتهاء الجلسة القديمة (لا بأس بالإبقاء للاستخدام عند عدم وجود مفتاح محلي)
function showSessionExpiredModal() {
  showSessionModal("صلاحية الجلسة منتهية يرجى إعادة تسجيل الدخول");
}

/* ======= تحكم باللودر أثناء الشراء ======= */
function showPreloader() {
  const pre = document.getElementById('preloader');
  if (!pre) return;
  pre.classList.remove('hidden');
  pre.style.display = 'flex';
  pre.style.opacity = '1';
}

function hidePreloader() {
  const pre = document.getElementById('preloader');
  if (!pre) return;
  pre.classList.add('hidden');
  setTimeout(() => { pre.style.display = 'none'; }, 600);
}

/* ============ توليد وتدوير sessionKey بعد الطلب ============ */
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SYMBOLS = "!@#$%&";
function rand(alphabet, len) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
function generateSessionKey(len = 64) {
  return rand(ALPHA + SYMBOLS, len);
}

// كتابة sessionKey الجديد في Firestore ثم تحديث localStorage
async function rotateSessionKeyAfterOrder(uid, ttlSeconds = 0) {
  const newKey = generateSessionKey();
  try {
    await db.collection("users").doc(uid)
      .collection("keys").doc("session")
      .set({
        sessionKey: newKey,
        ttlSeconds,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    localStorage.setItem("sessionKeyInfo", JSON.stringify({
      uid, sessionKey: newKey, ts: Date.now(), ttlSeconds
    }));
  } catch (e) {
    console.warn("Session rotate failed:", e?.message || e);
  }
}

/* ================== الأسعار كما هي ================== */
async function loadPrices(useruid = null) {
  try {
    const url = new URL("https://blood.qousaistore55.workers.dev/");
    url.searchParams.set("mode", "all");
    if (useruid) url.searchParams.set("useruid", useruid);

    const res = await fetch(url.toString(), { method: "GET" });
    const data = await res.json();

    if (!data || data.success === false) {
      throw new Error(data?.error || "فشل جلب الأسعار");
    }

    localStorage.setItem("offersPrices", JSON.stringify(data));
  } catch (e) {
    showToast("❗ فشل في تحميل الأسعار، ستتم المحاولة لاحقًا", "error");
    console.error("Prices load error:", e);
  }
}

// مراقبة حالة تسجيل الدخول ثم جلب الأسعار بمستوى المستخدم إن وُجد
firebase.auth().onAuthStateChanged(async (user) => {
  try {
    if (user) {
      await loadPrices(user.uid);
      const userDoc = await firebase.firestore().collection("users").doc(user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const firebaseUsername = userData.username || "";
      }
    } else {
      await loadPrices(null);
    }
  } catch (error) {
    console.warn("Auth state post-loadPrices error:", error);
  }
});

/* ================== إرسال الطلب (مع كشف فشل رمز الجلسة) ================== */
async function sendOrder() {
  const pid = document.getElementById("player-id").value.trim();
  const selectedOffers = Array.from(document.querySelectorAll('.offer-box.selected')).map(el => ({
    type: el.dataset.type,
    gold: el.dataset.gold || null,
    offerName: el.dataset.offer || null
  }));

  if (!pid || selectedOffers.length === 0) {
    showToast("❗ يرجى تعبئة الحقول المطلوبة قبل الإرسال!", "error");
    return;
  }

  const turnstileToken = turnstile.getResponse();
  if (!turnstileToken) {
    showToast("❗ يرجى اجتياز اختبار الأمان قبل الإرسال!", "error");
    return;
  }

  const user = firebase.auth().currentUser;
  if (!user) {
    showToast("❌ يجب تسجيل الدخول أولاً", "error");
    showSessionExpiredModal();
    return;
  }

  // مفتاح الجلسة المحلي
  const sessionKey = getLocalSessionKey();
  if (!sessionKey) {
    showSessionExpiredModal();
    return;
  }

  // authkey من Firestore (كما هو)
  let authkey = null;
  try {
    const userDoc = await firebase.firestore().collection("users").doc(user.uid).get();
    if (userDoc.exists) authkey = userDoc.data().authkey || null;
  } catch (e) {
    showToast("❌ فشل في جلب بيانات المستخدم", "error");
    return;
  }

  // JWT
  let idToken;
  try { idToken = await user.getIdToken(true); }
  catch (e) {
    showToast("❌ فشل في التحقق من تسجيل الدخول", "error");
    return;
  }

  // Quote
  let total, breakdown;
  try {
    const priceRes = await fetch("https://blood.qousaistore55.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offers: selectedOffers, useruid: user.uid })
    });
    const priceData = await priceRes.json();
    if (priceData?.success === false) throw new Error(priceData.error || "فشل في حساب السعر");
    total = priceData.total;
    breakdown = priceData.breakdown;
  } catch (e) {
    showToast("❌ فشل في حساب السعر", "error");
    console.error("Quote error:", e);
    return;
  }

  const currentUrl = window.location.href;

  // ====== Purchase (مع اللودر وتعطيل الزر) ======
  const submitBtn = document.querySelector('.send-button');
  try {
    // إظهار اللودر وتعطيل الزر
    showPreloader();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset._oldText = submitBtn.textContent;
      submitBtn.textContent = 'جاري المعالجة...';
      submitBtn.style.opacity = '0.7';
      submitBtn.style.pointerEvents = 'none';
    }

    const response = await fetch("https://blood.qousaistore55.workers.dev/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
        "X-SessionKey": sessionKey
      },
      body: JSON.stringify({
        playerId: pid,
        offers: selectedOffers,
        currency: "دأ",
        currentUrl,
        turnstileToken,
        authkey
      })
    });

    // إن كانت 401 نتحقق من كود الخطأ ونُظهر النافذة المطلوبة
    if (response.status === 401) {
      let errJson = {};
      try { errJson = await response.json(); } catch {}
      const code = (errJson?.code || "").toLowerCase();
      const sessionFail =
        code === "session_missing" ||
        code === "session_invalid" ||
        code === "session_mismatch" ||
        code === "session_expired";

      if (sessionFail) {
        showSessionModal("فشل التحقق من رمز الجلسة يرجى تسجيل الدخول مرة اخرى");
        return;
      }
      // إن لم يكن خطأ جلسة، عالج كالعادة
      showToast("❌ فشل الشراء: " + (errJson?.error || "خطأ غير معروف"), "error");
      return;
    }

    const result = await response.json();

    if (result.success) {
      showConfirmation(result.orderCode);
      // تدوير sessionKey بعد نجاح الطلب
      try { await rotateSessionKeyAfterOrder(user.uid); } catch {}
    } else {
      // أيضًا إن أعاد الخادم كود جلسة مع 200 (احتمال ضعيف) نتعامل معه
      const code = (result?.code || "").toLowerCase();
      if (code.startsWith("session_")) {
        showSessionModal("فشل التحقق من رمز الجلسة يرجى تسجيل الدخول مرة اخرى");
        return;
      }
      showToast("❌ فشل الشراء: " + (result.error || "خطأ غير معروف"), "error");
    }
  } catch (err) {
    console.error("Worker Error:", err);
    showToast("❌ حدث خطأ أثناء الشراء", "error");
  } finally {
    // إخفاء اللودر وإرجاع حالة الزر مهما حصل
    hidePreloader();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset._oldText || 'شراء';
      submitBtn.style.opacity = '';
      submitBtn.style.pointerEvents = '';
    }
  }
}

/* ================== نافذة التأكيد كما هي ================== */
function showConfirmation(orderCode, {
  orderUrl = "talabat.html",
  homeUrl  = "index.html",
  theme    = "auto"
} = {}) {


  // احذف أي نسخة سابقة
  const old = document.getElementById("success-like-image");
  if (old) old.remove();

  // اكتشاف الثيم
// داخل showConfirmation(...) استبدل الدالة التالية:
const detectTheme = () => {
  // 0) تفضيل الباراميتر إن وُجد
  if (theme === "light" || theme === "dark") return theme;

  // 1) أولوية للتخزين المحلي (القيمة "theme")
  let stored = "";
  try { stored = (localStorage.getItem("theme") || "").toLowerCase().trim(); } catch {}
  if (stored === "dark")  return "dark";
  // إذا كانت "light" أو غير موجودة/فارغة -> نهاري افتراضيًا
  if (stored === "light" || stored === "") return "light";

  // 2) احتياطيات أخرى (لو عندك سمات/كلاسات في الصفحة)
  if (document.body.classList.contains("dark-mode")) return "dark";
  if ((document.documentElement.dataset.theme || "").toLowerCase() === "dark") return "dark";

  // 3) تفضيل النظام (في حال احتجته)
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";

  // 4) الافتراضي النهائي: نهاري
  return "light";
};


  const palette = (mode) => {
    const dark = mode === "dark";
    return {
      pageBg:        dark ? "#0a0a0f" : "#f7f7fb",
      cardBg:        dark ? "#0e0d13" : "#ffffff",
      cardText:      dark ? "#e8e7f3" : "#111111",
      subtleTx:      dark ? "#bdbdd0" : "#6b7280",
      codeTx:        dark ? "#e6edf3" : "#111111",
      bannerBg:      "#21c065",
      bannerText:    "#ffffff",
      iconBg:        "#ffe34f",
      iconText:      "#151515",
      btnPriBg:      "#ffc21a",
      btnPriTx:      "#1a1a1a",
      btnSecBg:      dark ? "#c7c7d8" : "#d7d7e4",
      btnSecTx:      "#1a1a1a",
      closeBg:       dark ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.08)",
      cardShadow:    dark ? "0 20px 60px rgba(0,0,0,.45)" : "0 20px 60px rgba(0,0,0,.20)",
    };
  };

  // الغلاف
  const root = document.createElement("div");
  root.id = "success-like-image";
  root.dir = "rtl";
  root.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    display:flex; flex-direction:column; align-items:center;
    font-family: system-ui, -apple-system, Segoe UI, Tahoma, Arial;
  `;

  // شريط علوي
  const banner = document.createElement("div");
  banner.textContent = "تمت العملية بنجاح";
  banner.style.cssText = `
    width:100%; text-align:center; font-weight:800; font-size:20px;
    padding:14px 16px;
  `;

  // زر إغلاق
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label","إغلاق");
  close.style.cssText = `
    position:absolute; top:12px; inset-inline-start:12px;
    width:36px; height:36px; border-radius:8px; border:0; font-size:22px; cursor:pointer;
  `;
  close.onclick = () => { cleanup(); root.remove(); };

  // المحتوى
  const wrap = document.createElement("div");
  wrap.style.cssText = `max-width:720px; width:min(92vw,720px); margin:72px auto 0; text-align:center; padding:0 16px;`;

  const card = document.createElement("div");
  card.style.cssText = `margin:0 auto; border-radius:18px; overflow:hidden; padding:0 0 22px;`;

  const icon = document.createElement("div");
  icon.textContent = "🕒";
  icon.style.cssText = `width:100px; height:100px; border-radius:50%; display:grid; place-items:center; font-size:44px; margin:22px auto 12px;`;

  const h2 = document.createElement("h2");
  h2.textContent = "طلبك قيد المعالجة";
  h2.style.cssText = "font-size:28px; font-weight:800; margin:6px 0 10px;";

  const p1 = document.createElement("p");
  p1.textContent = "يمكنك مراجعة طلباتك في أي وقت من خلال سجل الطلبات";
  p1.style.cssText = "margin:0 0 8px; line-height:1.8;";

  const p2 = document.createElement("p");
  p2.textContent = "شكرًا لاستخدامك خدماتنا";

  const code = document.createElement("p");
  code.innerHTML = `🆔 كود الطلب: <strong>${orderCode || "-"}</strong>`;
  code.style.cssText = "margin:6px 0 18px; font-size:16px;";

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex; gap:16px; justify-content:center; flex-wrap:wrap;";

  const orderBtn = document.createElement("a");
  orderBtn.href = orderUrl;
  orderBtn.textContent = "طلباتي";
  orderBtn.style.cssText = `text-decoration:none; padding:14px 24px; border-radius:16px; font-weight:800;`;

  const homeBtn = document.createElement("a");
  homeBtn.href = homeUrl;
  homeBtn.textContent = "الرئيسية";
  homeBtn.style.cssText = `text-decoration:none; padding:14px 24px; border-radius:16px; font-weight:800;`;

  actions.append(orderBtn, homeBtn);
  card.append(icon, h2, p1, p2, code, actions);
  wrap.append(card);
  root.append(banner, close, wrap);
  document.body.appendChild(root);

  // تطبيق الثيم الحالي
  const applyTheme = () => {
    const mode = detectTheme();
    const pal  = palette(mode);
    root.style.background   = pal.pageBg;
    banner.style.background = pal.bannerBg;
    banner.style.color      = pal.bannerText;
    close.style.background  = pal.closeBg; close.style.color = "#fff";
    card.style.background   = pal.cardBg;  card.style.boxShadow = pal.cardShadow; card.style.color = pal.cardText;
    icon.style.background   = pal.iconBg;  icon.style.color = pal.iconText;
    p1.style.color = pal.subtleTx; p2.style.color = pal.subtleTx; code.style.color = pal.codeTx;
    orderBtn.style.background = pal.btnPriBg; orderBtn.style.color = pal.btnPriTx;
    homeBtn.style.background  = pal.btnSecBg; homeBtn.style.color  = pal.btnSecTx;
  };
  applyTheme();

  // مراقبة تغيّر النظام أو تغيير كلاس/أتريبيوت الثيم في الصفحة (للوضع auto فقط)
  const mm = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  const mmHandler = () => { if (theme === "auto") applyTheme(); };
  mm && mm.addEventListener && mm.addEventListener("change", mmHandler);

  const obs = new MutationObserver(() => { if (theme === "auto") applyTheme(); });
  obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function cleanup() {
    try { mm && mm.removeEventListener && mm.removeEventListener("change", mmHandler); } catch {}
    try { obs.disconnect(); } catch {}
  }

  // صوت نجاح (اختياري)
  try { new Audio("success.mp3").play(); } catch {}
}


// ✅ عند تحميل الصفحة سننتظر onAuthStateChanged لتحديد useruid ثم ننادي loadPrices()
document.addEventListener('DOMContentLoaded', () => {
  // onAuthStateChanged أعلاه سيتكفّل بتحميل الأسعار
});
