// ===== Firebase init =====
const firebaseConfig = {
  apiKey: "AIzaSyB6dC1UAS0-ilt-dj9UpcLIPljwbI3FCZs",
  authDomain: "qusaystore-ec327.firebaseapp.com",
  projectId: "qusaystore-ec327",
  storageBucket: "qusaystore-ec327.firebasestorage.app",
  messagingSenderId: "701743074708",
  appId: "1:701743074708:web:defc2de594567b6624d381",
  measurementId: "G-00R4XQCB1V"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ========= إعدادات عامة =========
const STATUS_REFRESH_WINDOW_DAYS = 7; // عدد الأيام التي نحدّث فيها حالة الطلب عند كل دخول

/* ===================== Theme (اختياري) ===================== */
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark-mode');
    }
  } catch (e) {}
});

// عند تحقق تسجيل الدخول
firebase.auth().onAuthStateChanged(async user => {
  if (!user) {
    alert("يجب تسجيل الدخول أولاً");
    window.location.href = "index.html";
  } else {
    await loadOrdersCacheFirst(user.uid);   // اعرض من الكاش أو اجلب مرة واحدة إذا فاضي
    refreshRecentStatuses(user.uid);        // عند كل دخول: حدّث حالة الطلبات الحديثة (≤ 7 أيام)
  }
});

/* ===================== LocalStorage Helpers ===================== */
/**
 * نخزن الطلبات بهذا الشكل داخل localStorage:
 * key: orders_cache:<uid>
 * value: { byCode: { CODE: orderObj }, lastSync: <timestamp> }
 * ملاحظة: نضع بيانات public داخل كائن الطلب مباشرة (playerId, total, status, timestamp, العروض ...)
 * وإذا جلبنا تفاصيل pub/priv للطلب نضيفها في حقول __pub / __priv داخل نفس الطلب.
 */
const ORDERS_KEY = (uid) => `orders_cache:${uid}`;

const LS = {
  read(uid) {
    try {
      const raw = localStorage.getItem(ORDERS_KEY(uid));
      if (!raw) return { byCode: {}, lastSync: 0 };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.byCode !== 'object') return { byCode: {}, lastSync: 0 };
      return parsed;
    } catch {
      return { byCode: {}, lastSync: 0 };
    }
  },
  replace(uid, ordersArray) {
    const byCode = {};
    (ordersArray || []).forEach(o => { if (o?.code) byCode[o.code] = o; });
    LS._save(uid, { byCode, lastSync: Date.now() });
  },
  merge(uid, ordersArray) {
    const cur = LS.read(uid);
    (ordersArray || []).forEach(o => {
      if (!o?.code) return;
      cur.byCode[o.code] = { ...(cur.byCode[o.code] || {}), ...o };
    });
    cur.lastSync = Date.now();
    LS._save(uid, cur);
  },
  upsert(uid, orderObj) {
    if (!orderObj?.code) return;
    const cur = LS.read(uid);
    cur.byCode[orderObj.code] = { ...(cur.byCode[orderObj.code] || {}), ...orderObj };
    cur.lastSync = Date.now();
    LS._save(uid, cur);
  },
  _save(uid, obj) {
    try {
      localStorage.setItem(ORDERS_KEY(uid), JSON.stringify(obj));
    } catch (e) {
      console.warn("تعذّر الحفظ في LocalStorage (قد تكون المساحة ممتلئة).", e);
    }
  },
  clear(uid) {
    try { localStorage.removeItem(ORDERS_KEY(uid)); } catch {}
  }
};

// تحويل الكاش إلى مصفوفة مرتبة زمنياً
function cacheToSortedArray(uid) {
  const { byCode } = LS.read(uid);
  const arr = Object.values(byCode || {});
  return arr.sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });
}

// أداة: حساب إن كان الطلب حديثًا (≤ N أيام)
function isWithinDays(ts, days) {
  if (!ts) return true; // إذا التاريخ غير معروف نعتبره حديثًا لتحديثه بحذر
  const t = new Date(ts).getTime();
  if (isNaN(t)) return true;
  const diffMs = Date.now() - t;
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

/* ===================== Skeleton أثناء التحميل ===================== */
function showOrdersSkeleton(count = 3) {
  const list = document.getElementById("ordersList");
  if (!list) return;
  list.querySelectorAll(".order-card.loading").forEach(n => n.remove());
  for (let i = 0; i < count; i++) {
    const sk = document.createElement("div");
    sk.className = "order-card loading";
    list.appendChild(sk);
  }
}

/* ===================== تحميل الطلبات: Cache-First ===================== */
async function loadOrdersCacheFirst(uid) {
  const ordersList = document.getElementById("ordersList");
  if (!ordersList) return;

  // اعرض المخزن أولًا إن وُجد
  const cachedArr = cacheToSortedArray(uid);
  if (cachedArr.length) {
    renderOrders(cachedArr);
    return;
  }

  // الكاش فاضي -> قراءة واحدة من Firebase ثم تخزين
  ordersList.innerHTML = "";
  showOrdersSkeleton(1);

  try {
    const fresh = await fetchOrdersFromFirebaseOnce(uid);
    LS.replace(uid, fresh);
    renderOrders(fresh);
  } catch (e) {
    console.error(e);
    ordersList.querySelectorAll(".order-card.loading").forEach(n => n.remove());
  }
}

// قراءة مرّة واحدة لكل الطلبات الخاصة بالمستخدم (لملء الكاش فقط عند فراغه)
async function fetchOrdersFromFirebaseOnce(uid) {
  const ordersRef = db.collection("orders").where("userId", "==", uid);
  const snapshot = await ordersRef.get();

  const promises = snapshot.docs.map(async (doc) => {
    const orderData = doc.data() || {};
    const pubSnap = await doc.ref.collection("public").doc("main").get();
    const pubData = pubSnap.exists ? pubSnap.data() : {};
    return {
      code: orderData.code || doc.id,
      ...pubData,                        // playerId / total / status / timestamp / العروض...
      proof: orderData.proof || "",
      __fetchedAt: Date.now()
    };
  });

  const ordersArray = await Promise.all(promises);
  return ordersArray.sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });
}

/* ===================== تحديث حالة الطلبات الحديثة عند كل دخول ===================== */
/**
 * يجلب public/main لكل طلب حديث (≤ 7 أيام) لتحديث الحقول (خصوصًا status).
 * الأقدم من 7 أيام لا يُجلب ويوثق من الكاش فقط.
 */
async function refreshRecentStatuses(uid) {
  const cache = LS.read(uid);
  const codes = Object.keys(cache.byCode || {});
  if (!codes.length) return;

  const recentCodes = codes.filter(code => {
    const o = cache.byCode[code];
    // نحدّث إذا الطلب حديث (≤ 7 أيام) أو لا يملك timestamp أو لا يملك status
    return isWithinDays(o?.timestamp, STATUS_REFRESH_WINDOW_DAYS) || !o?.status;
  });

  if (!recentCodes.length) return;

  try {
    // اجلب public/main لكل كود حديث
    const updates = await Promise.all(recentCodes.map(async (code) => {
      try {
        const orderRef = db.collection("orders").doc(code);
        const pubSnap = await orderRef.collection("public").doc("main").get();
        const pub = pubSnap.exists ? pubSnap.data() : {};
        // ندمج فقط الحقول العامة (ومن ضمنها status/timestamp)
        return { code, ...pub, __lastStatusRefreshAt: Date.now() };
      } catch (e) {
        console.warn("تعذّر تحديث حالة الطلب:", code, e);
        return null;
      }
    }));

    const valid = updates.filter(Boolean);
    if (valid.length) {
      LS.merge(uid, valid);
      // أعد الرسم بعد الدمج
      renderOrders(cacheToSortedArray(uid));
    }
  } catch (e) {
    console.error("refreshRecentStatuses error:", e);
  }
}

/* ===================== عرض الطلبات ===================== */
function renderOrders(orders) {
  const ordersList = document.getElementById("ordersList");
  if (!ordersList) return;

  ordersList.innerHTML = "";

  orders.forEach(order => {
    const { code, playerId, total, country, payment, العروض: offers, timestamp, status, proof } = order;
    const existing = document.getElementById(`order-${code}`);
    if (existing) existing.remove();

    let formattedDate = "";
    try {
      formattedDate = new Date(timestamp).toLocaleString("ar-EG", {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      formattedDate = timestamp || "غير معروف";
    }

    let offersFormatted = "";
    if (offers) {
      offersFormatted = offers
        .split("•")
        .filter(item => item.trim())
        .map(item => `<li>${item.trim()}</li>`)
        .join("");
      offersFormatted = `<ul style="padding-right:20px;">${offersFormatted}</ul>`;
    }

    let statusClass = "";
    if (status === "مرفوض") statusClass = "مرفوض";
    else if (status === "تم_الشحن") statusClass = "تم_الشحن";

    const card = document.createElement("div");
    card.className = "order-card";
    card.id = `order-${code}`;

    card.innerHTML = `
      <div class="order-header" onclick="toggleDetails('${code}')">
        <div>
          <strong>كود الطلب:</strong> ${code}<br>
          🎮 <strong>${playerId || "-"}</strong> | 💵 <strong>${total || "-"}</strong>
        </div>
        <div class="order-status ${statusClass}">
          ${status === "تم_الشحن" ? "تم الشحن" : (status || "قيد المعالجة")}
        </div>
        <i class="fas fa-chevron-down"></i>
      </div>
      <div class="order-details" id="details-${code}" style="display:none;">
        <p><strong>🆔 معرف اللاعب:</strong> ${playerId || "غير متوفر"}</p>
        <p><strong>🎁 العروض:</strong> ${offersFormatted || "-"}</p>
        <p><strong>💵 المجموع:</strong> ${total || "-"}</p>
        <p><strong>📅 تاريخ الإرسال:</strong> ${formattedDate}</p>
        ${
          proof
            ? `<p>
                 <strong>📸 إثبات التحويل:</strong>
                 <button class="btn-show-proof" data-code="${code}">عرض الصورة</button><br>
                 <img id="proof-img-${code}" src="${proof}" alt="إثبات التحويل" style="display:none; max-width:100%; margin-top:10px;">
               </p>`
            : ``
        }
      </div>
    `;

    ordersList.appendChild(card);
  });

  attachProofButtons();
}

function attachProofButtons() {
  document.querySelectorAll('.btn-show-proof').forEach(btn => {
    btn.onclick = () => {
      const code = btn.dataset.code;
      const img = document.getElementById(`proof-img-${code}`);
      if (img.style.display === 'none' || !img.style.display) {
        img.style.display = 'block';
        btn.textContent = 'إخفاء الصورة';
      } else {
        img.style.display = 'none';
        btn.textContent = 'عرض الصورة';
      }
    };
  });
}

/* ===================== تفاصيل الطلب: Cache-First ثم Firebase لهذا الطلب ===================== */
async function showOrderDetails(code) {
  const detailsBox = document.getElementById("orderDetails");
  if (!detailsBox) return;

  if (!code) {
    detailsBox.style.display = "none";
    return;
  }

  const uid = (auth.currentUser || firebase.auth().currentUser)?.uid;
  if (!uid) return;

  // حاول من الكاش أولاً
  const cache = LS.read(uid);
  const cachedOrder = cache.byCode[code];

  if (cachedOrder?.__pub && cachedOrder?.__priv) {
    renderDetailsTable(cachedOrder.__pub, cachedOrder.__priv, detailsBox);
    return;
  }

  // خلاف ذلك: اجلب لهذا الطلب فقط ثم خزّنه
  try {
    const orderRef = db.collection("orders").doc(code);
    const [pubSnap, privSnap] = await Promise.all([
      orderRef.collection("public").doc("main").get(),
      orderRef.collection("private").doc("main").get()
    ]);

    const pub = pubSnap.exists ? pubSnap.data() : {};
    const priv = privSnap.exists ? privSnap.data() : {};

    // خزّن ضمن نفس عنصر الطلب في الكاش
    LS.upsert(uid, { code, __pub: pub, __priv: priv });

    renderDetailsTable(pub, priv, detailsBox);
  } catch (e) {
    console.error(e);
    detailsBox.style.display = "none";
  }
}

function renderDetailsTable(pub, priv, detailsBox) {
  let rows = '';
  const appendRow = (label, value) => {
    rows += `<tr>
               <td style="padding:10px;font-weight:bold;border:1px solid #ccc;">${label}</td>
               <td style="padding:10px;border:1px solid #ccc;">${value}</td>
             </tr>`;
  };

  rows += `<tr><td colspan="2" style="background:#eee;padding:10px;font-weight:bold;">📂 Public</td></tr>`;
  Object.entries(pub || {}).forEach(([k, v]) => appendRow(k, v));

  rows += `<tr><td colspan="2" style="background:#eee;padding:10px;font-weight:bold;">🔒 Private</td></tr>`;
  Object.entries(priv || {}).forEach(([k, v]) => appendRow(k, v));

  detailsBox.innerHTML = `<table style="width:100%;direction:rtl;border-collapse:collapse;">${rows}</table>`;
  detailsBox.style.display = "block";
}

/* ===================== اتفاقية المستخدم (كما لديك) ===================== */
// أبقِ هذا الحدث للاتفاقية فقط — بدون استدعاء تحميلات هنا
window.addEventListener("DOMContentLoaded", () => {
  const agreed = localStorage.getItem('userAgreementAccepted');
  if (agreed !== 'true') {
    const box = document.getElementById('user-agreement');
    if (box) {
      box.style.display = 'flex';
      box.style.alignItems = 'center';
      box.style.justifyContent = 'center';
    }
  }
});

/* ===================== أدوات واجهة بسيطة (اختيارية) ===================== */
// زر تحديت/مسح الكاش (إن أضفتهما في الصفحة)
document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btnRefresh');
  const btnClear = document.getElementById('btnClearCache');

  if (btnRefresh) {
    btnRefresh.onclick = async () => {
      const uid = (auth.currentUser || firebase.auth().currentUser)?.uid;
      if (!uid) return;
      showOrdersSkeleton(1);
      try {
        const fresh = await fetchOrdersFromFirebaseOnce(uid);
        LS.replace(uid, fresh);
        renderOrders(fresh);
        // بعد التحديث الكامل، ما زلنا نطبّق قاعدة 7 أيام تلقائيًا عند الدخول القادم
      } catch (e) {
        console.error(e);
      }
    };
  }

  if (btnClear) {
    btnClear.onclick = () => {
      const uid = (auth.currentUser || firebase.auth().currentUser)?.uid;
      if (!uid) return;
      LS.clear(uid);
      const ordersList = document.getElementById("ordersList");
      if (ordersList) ordersList.innerHTML = "";
    };
  }
});

/* ===================== أدوات صغيرة ===================== */
function toggleDetails(code) {
  const d = document.getElementById(`details-${code}`);
  if (!d) return;
  d.style.display = (d.style.display === 'block') ? 'none' : 'block';
}
