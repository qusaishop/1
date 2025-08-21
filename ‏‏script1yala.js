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
    const url = new URL("https://yala.qusaistore33.workers.dev/");
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
    jewels: el.dataset.jewels || null,
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
    const priceRes = await fetch("https://yala.qusaistore33.workers.dev/", {
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

    const response = await fetch("https://yala.qusaistore33.workers.dev/", {
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
function showConfirmation(code) {
  const audio = new Audio('success.mp3');
  audio.play();

  if (!document.querySelector('script[src*="dotlottie-player-component"]')) {
    const lottieScript = document.createElement('script');
    lottieScript.type = 'module';
    lottieScript.src = 'https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs';
    document.head.appendChild(lottieScript);
  }

  const overlay = document.createElement("div");
  overlay.style = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
    justify-content: center; align-items: center;`;

  const container = document.createElement("div");

  // ✅ نحدد الألوان حسب الثيم الحالي
  const isDark = document.body.classList.contains("dark-mode");
  container.style = `
    background: ${isDark ? "#0f172a" : "white"};
    color: ${isDark ? "#e6edf3" : "#111"};
    padding: 25px 35px; border-radius: 12px;
    text-align: center; max-width: 90vw;
    box-shadow: 0 8px 22px rgba(0,0,0,0.25);
  `;

  const lottie = document.createElement("dotlottie-player");
  lottie.setAttribute("src", "https://lottie.host/e254b369-8819-4942-b33f-b3b699f9bc28/32zzWRxzaZ.lottie");
  lottie.setAttribute("background", "transparent");
  lottie.setAttribute("speed", "1");
  lottie.setAttribute("autoplay", "");
  lottie.setAttribute("style", "width: 300px; height: 300px; margin: 0 auto;");

  lottie.addEventListener("complete", () => { lottie.pause(); });

  const message = document.createElement("p");
  message.style = "font-size: 20px; margin: 10px 0;";
  message.innerText = "✅ تم استلام طلبك بنجاح";

  const codeParagraph = document.createElement("p");
  codeParagraph.innerHTML = `🆔 كود الطلب: <strong>${code}</strong>`;

  const reloadButton = document.createElement("button");
  reloadButton.innerHTML = "🔄 إعادة تحميل الصفحة";
  reloadButton.style = `
    margin-top: 15px; padding: 10px 25px;
    background: ${isDark ? "#0369a1" : "#28a745"};
    color: white; border: none;
    border-radius: 8px; cursor: pointer;
  `;
  reloadButton.onclick = () => location.reload();

  container.appendChild(lottie);
  container.appendChild(message);
  container.appendChild(codeParagraph);
  container.appendChild(reloadButton);
  overlay.appendChild(container);
  document.body.appendChild(overlay);
}


// ✅ عند تحميل الصفحة سننتظر onAuthStateChanged لتحديد useruid ثم ننادي loadPrices()
document.addEventListener('DOMContentLoaded', () => {
  // onAuthStateChanged أعلاه سيتكفّل بتحميل الأسعار
});
