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

// ===== مفاتيح الكاش في LocalStorage =====
const LS_INDEX_KEY = 'talabat_orders_index_v1';       // { byId: {docId: {...}}, order: [docId...], cachedAt }
const LS_DETAIL_PREFIX = 'talabat_order_detail_v1_';   // لكل طلب: detail json

// ===== متغيّرات تشغيل =====
let unsubscribeStatusSync = null;      // إلغاء مزامنة الحالة من الجذر
let publicStatusRefreshTimer = null;   // مؤقّت تحديث حالة الطلبات التي تفتقد status بالجذر

// ===== أدوات LocalStorage =====
function lsGet(key, fallback = null) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ثيم داكن (اختياري)
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark-mode');
    }
  } catch {}
});

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    alert("يجب تسجيل الدخول أولاً");
    window.location.href = "index.html";
    return;
  }
  await loadOrdersFromCacheFirst(user);       // عرض فوري من الكاش إن وجد
  startOrdersLiveStatusSync(user);            // مزامنة حيّة للحالة من الجذر
  startPublicStatusRefresh(user, 60_000);     // تحديث دوري لحالة الطلبات التي تفتقد status بالجذر
});

// ===== Skeleton while loading =====
function showOrdersSkeleton(count = 3) {
  const list = document.getElementById("ordersList");
  if (!list) return;
  list.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const sk = document.createElement("div");
    sk.className = "order-card loading";
    list.appendChild(sk);
  }
}

// ===== 1) اعرض من الكاش أولًا، وإن كان الكاش فاضي اجلب مرّة من فايربيس وخزّن =====
async function loadOrdersFromCacheFirst(user) {
  const list = document.getElementById("ordersList");
  if (!list) return;

  const cachedIndex = lsGet(LS_INDEX_KEY, null);
  if (cachedIndex && Array.isArray(cachedIndex.order) && cachedIndex.order.length) {
    renderOrdersFromIndex(cachedIndex);
    // سدّ النقص للحالات المفقودة من public/main مرة واحدة
    const missing = cachedIndex.order
      .map(id => cachedIndex.byId[id])
      .filter(o => !o || !o.status || !o.status.trim());
    if (missing.length) prefetchStatusesFromPublic(missing);
    return;
  }

  // لا يوجد كاش: جلب واحد فقط
  showOrdersSkeleton(2);
  try {
    const freshIndex = await fetchOrdersFromFirebaseOnce(user);
    lsSet(LS_INDEX_KEY, freshIndex);
    renderOrdersFromIndex(freshIndex);
  } catch (e) {
    console.error(e);
    list.innerHTML = `<p style="color:#e11;">تعذّر تحميل الطلبات</p>`;
  }
}

// جلب مرّة واحدة لقائمة الطلبات من الجذر (بدون subcollections)
async function fetchOrdersFromFirebaseOnce(user) {
  const snap = await db.collection("orders").where("userId", "==", user.uid).get();
  const byId = {};
  const order = [];
  snap.forEach(doc => {
    const d = doc.data() || {};
    byId[doc.id] = {
      id: doc.id,
      code: d.code || doc.id,
      status: (d.status || "").trim(),
      timestamp: d.timestamp || null,
      proof: d.proof || ""
    };
    order.push(doc.id);
  });
  order.sort((a, b) => {
    const ta = byId[a].timestamp ? new Date(byId[a].timestamp).getTime() : 0;
    const tb = byId[b].timestamp ? new Date(byId[b].timestamp).getTime() : 0;
    return tb - ta;
  });
  return { byId, order, cachedAt: Date.now() };
}

// ===== 2) رندر القائمة من الفهرس =====
function renderOrdersFromIndex(index) {
  const ordersList = document.getElementById("ordersList");
  if (!ordersList) return;

  ordersList.innerHTML = "";

  index.order.forEach(id => ensureCardExistsAndUpdate(index.byId[id]));
}

function ensureCardExistsAndUpdate(o) {
  if (!o) return;
  const ordersList = document.getElementById("ordersList");
  if (!ordersList) return;

  let card = document.getElementById(`order-${o.id}`);
  const st = (o.status || "").trim();
  const statusText = st || "قيد المعالجة";
  const normalized = statusText.replace(/\s+/g, "_");
  let statusClass = "";
  if (normalized === "مرفوض") statusClass = "مرفوض";
  else if (normalized === "تم_الشحن" || normalized === "تم_التسليم") statusClass = "تم_الشحن";

  if (!card) {
    card = document.createElement("div");
    card.className = "order-card";
    card.id = `order-${o.id}`;
    card.innerHTML = `
      <div class="order-header" onclick="toggleDetails('${o.id}')">
        <div>
          <strong>كود الطلب:</strong> ${o.code}<br>
          <small>انقر لعرض التفاصيل</small>
        </div>
        <div class="order-status ${statusClass}" data-order-id="${o.id}">${statusText}</div>
        <i class="fas fa-chevron-down"></i>
      </div>
      <div class="order-details" id="details-${o.id}" data-loaded="false" style="display:none;"></div>
    `;
    ordersList.appendChild(card);
  } else {
    // تحديث الحالة فقط
    const el = card.querySelector(".order-status");
    if (el) {
      el.textContent = statusText;
      el.classList.remove("مرفوض", "تم_الشحن");
      if (statusClass) el.classList.add(statusClass);
    }
    // تحدّث كود العرض إن تغيّر
    const headerInfo = card.querySelector(".order-header > div:first-child");
    if (headerInfo) {
      headerInfo.innerHTML = `<strong>كود الطلب:</strong> ${o.code}<br><small>انقر لعرض التفاصيل</small>`;
    }
  }
}

// ===== 3) مزامنة حيّة للحالة من جذر orders (بدون فتح الكرت) =====
function startOrdersLiveStatusSync(user) {
  if (unsubscribeStatusSync) unsubscribeStatusSync();

  const q = db.collection("orders").where("userId", "==", user.uid);
  unsubscribeStatusSync = q.onSnapshot((snapshot) => {
    const idx = lsGet(LS_INDEX_KEY, { byId: {}, order: [] });
    let dirty = false;

    snapshot.docChanges().forEach((chg) => {
      const doc = chg.doc;
      const d = doc.data() || {};

      if (chg.type === "removed") {
        // احذف من DOM ومن الكاش
        const card = document.getElementById(`order-${doc.id}`);
        if (card && card.parentNode) card.parentNode.removeChild(card);
        if (idx.byId[doc.id]) {
          delete idx.byId[doc.id];
          idx.order = idx.order.filter(x => x !== doc.id);
          dirty = true;
        }
        return;
      }

      // added / modified
      const prev = idx.byId[doc.id] || {};
      const merged = {
        id: doc.id,
        code: d.code || prev.code || doc.id,
        status: (d.status || prev.status || "").trim(),
        timestamp: d.timestamp || prev.timestamp || null,
        proof: d.proof || prev.proof || ""
      };

      idx.byId[doc.id] = merged;
      if (!idx.order.includes(doc.id)) {
        idx.order.unshift(doc.id); // الأحدث إلى الأعلى
      }
      dirty = true;

      // حدّث العرض فورًا
      ensureCardExistsAndUpdate(merged);
    });

    if (dirty) {
      // أعد فرز الترتيب إن لزم
      idx.order.sort((a, b) => {
        const ta = idx.byId[a] && idx.byId[a].timestamp ? new Date(idx.byId[a].timestamp).getTime() : 0;
        const tb = idx.byId[b] && idx.byId[b].timestamp ? new Date(idx.byId[b].timestamp).getTime() : 0;
        return tb - ta;
      });
      lsSet(LS_INDEX_KEY, idx);
    }
  }, (err) => {
    console.error("status sync error:", err);
  });
}

// ===== 4) تحديث دوري لحالات الطلبات التي تفتقد status بالجذر عبر public/main =====
function startPublicStatusRefresh(user, intervalMs = 60000) {
  if (publicStatusRefreshTimer) clearInterval(publicStatusRefreshTimer);
  publicStatusRefreshTimer = setInterval(async () => {
    const idx = lsGet(LS_INDEX_KEY, null);
    if (!idx || !idx.order || !idx.order.length) return;

    // التحديث فقط للطلبات التي لا تحمل status في الجذر
    const missing = idx.order.map(id => idx.byId[id]).filter(o => !o || !o.status || !o.status.trim());
    if (!missing.length) return;

    await prefetchStatusesFromPublic(missing, (docId, st, proof) => {
      // حدّث DOM
      updateCardStatus(docId, st || "قيد المعالجة");
      // حدّث الكاش
      const cur = lsGet(LS_INDEX_KEY, null);
      if (cur && cur.byId && cur.byId[docId]) {
        cur.byId[docId].status = (st || "").trim();
        if (proof && !cur.byId[docId].proof) cur.byId[docId].proof = proof;
        lsSet(LS_INDEX_KEY, cur);
      }
    });
  }, intervalMs);
}

// قراءة محدودة من public/main لعدة طلبات (لتعبئة أو تحديث الحالة فقط)
async function prefetchStatusesFromPublic(pending, onUpdate = null, concurrency = 3) {
  const queue = pending.slice();
  let active = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (queue.length === 0 && active === 0) return resolve();
      while (active < concurrency && queue.length) {
        const o = queue.shift();
        if (!o || !o.id) continue;
        active++;

        db.collection("orders").doc(o.id)
          .collection("public").doc("main").get()
          .then(snap => {
            const data = snap.exists ? snap.data() : {};
            const st = data.status || "";
            const proof = data.proof || "";
            if (onUpdate) onUpdate(o.id, st, proof);
            else updateCardStatus(o.id, st || "قيد المعالجة");
          })
          .catch(() => updateCardStatus(o.id, "تعذّر التحميل"))
          .finally(() => { active--; next(); });
      }
    };
    next();
  });
}

// ===== تحديث نص/ستايل الحالة (ويحدّث الكاش أيضًا) =====
function updateCardStatus(docId, status) {
  const el = document.querySelector(`#order-${docId} .order-status`);
  if (el) {
    const st = (status || "").trim();
    el.textContent = st || "غير متوفرة";
    el.classList.remove("مرفوض", "تم_الشحن");
    const normalized = st.replace(/\s+/g, "_");
    if (normalized === "مرفوض") el.classList.add("مرفوض");
    else if (normalized === "تم_الشحن" || normalized === "تم_التسليم") el.classList.add("تم_الشحن");
  }

  // حدّث الكاش (index)
  const idx = lsGet(LS_INDEX_KEY, null);
  if (idx && idx.byId && idx.byId[docId]) {
    idx.byId[docId].status = (status || "").trim();
    lsSet(LS_INDEX_KEY, idx);
  }

  // حدّث التفاصيل (لو مخزّنة) أيضًا
  const det = lsGet(LS_DETAIL_PREFIX + docId, null);
  if (det && det.public) {
    det.public.status = (status || "").trim();
    lsSet(LS_DETAIL_PREFIX + docId, det);
  }
}

// ===== التفاصيل Lazy + كاش =====
async function fetchAndFillDetails(docId) {
  const box = document.getElementById(`details-${docId}`);
  if (!box) return;

  // إن وُجدت تفاصيل بالكاش، اعرضها مباشرة
  const cachedDetail = lsGet(LS_DETAIL_PREFIX + docId, null);
  if (cachedDetail) {
    fillDetailsBox(docId, cachedDetail);
    if (cachedDetail.public && typeof cachedDetail.public.status === "string") {
      updateCardStatus(docId, cachedDetail.public.status);
    }
    return;
  }

  // لا يوجد تفاصيل: اجلبها مرّة واحدة وخزّن
  box.innerHTML = `<p>جارٍ تحميل التفاصيل…</p>`;
  try {
    const orderRef = db.collection("orders").doc(docId);
    const pubSnap = await orderRef.collection("public").doc("main").get();
    const pub = pubSnap.exists ? pubSnap.data() : {};



    const data = { public: pub, updatedAt: Date.now() };
    lsSet(LS_DETAIL_PREFIX + docId, data);

    fillDetailsBox(docId, data);

    // لو الحالة وصلت ضمن التفاصيل، حدّث الهيدر والكاش
    if (typeof pub.status === "string") {
      updateCardStatus(docId, pub.status);
    }
    // proof إن ظهر لأول مرة، خزّنه بالفهرس
    if (pub.proof) {
      const idx = lsGet(LS_INDEX_KEY, null);
      if (idx && idx.byId && idx.byId[docId]) {
        if (!idx.byId[docId].proof) {
          idx.byId[docId].proof = pub.proof;
          lsSet(LS_INDEX_KEY, idx);
        }
      }
    }
  } catch (e) {
    console.error(e);
    box.innerHTML = `<p style="color:#e11;">تعذّر تحميل التفاصيل</p>`;
  }
}

function fillDetailsBox(docId, detailData) {
  const box = document.getElementById(`details-${docId}`);
  if (!box) return;

  const pub = detailData.public || {};
  const playerId = pub.playerId || "غير متوفر";
  const offers = pub["العروض"];
  const total = pub.total || "-";
  const timestamp = pub.timestamp;
  const proof = pub.proof;

  const formattedDate = timestamp
    ? new Date(timestamp).toLocaleString("ar-EG", {
        weekday:'long', year:'numeric', month:'long', day:'numeric',
        hour:'2-digit', minute:'2-digit'
      })
    : "غير معروف";

  let offersHtml = "-";
  if (offers) {
    offersHtml = offers
      .split("•")
      .filter(x => x.trim())
      .map(x => `<li>${x.trim()}</li>`)
      .join("");
    offersHtml = `<ul style="padding-right:20px;">${offersHtml}</ul>`;
  }

  const proofBtn = proof ? `
    <p>
      <strong>📸 إثبات التحويل:</strong>
      <button class="btn-show-proof" data-id="${docId}" data-src="${proof}">عرض الصورة</button><br>
      <img id="proof-img-${docId}" alt="إثبات التحويل" style="display:none; max-width:100%; margin-top:10px;">
    </p>` : ``;

  box.innerHTML = `
    <p><strong>🆔 معرف اللاعب:</strong> ${playerId}</p>
    <p><strong>🎁 العروض:</strong> ${offersHtml}</p>
    <p><strong>💵 المجموع:</strong> ${total}</p>
    <p><strong>📅 تاريخ الإرسال:</strong> ${formattedDate}</p>
    ${proofBtn}
  `;

  box.dataset.loaded = "true";
  attachProofButtons();
}

// ===== أزرار الصورة (Lazy) =====
function attachProofButtons() {
  document.querySelectorAll('.btn-show-proof').forEach(btn => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.onclick = () => {
      const docId = btn.dataset.id;
      const img = document.getElementById(`proof-img-${docId}`);
      if (!img) return;
      if (!img.src && btn.dataset.src) img.src = btn.dataset.src; // تحميل عند أول ضغطة
      const hidden = img.style.display === 'none' || !img.style.display;
      img.style.display = hidden ? 'block' : 'none';
      btn.textContent = hidden ? 'إخفاء الصورة' : 'عرض الصورة';
    };
  });
}

// ===== فتح/إغلاق التفاصيل =====
function toggleDetails(docId) {
  const d = document.getElementById(`details-${docId}`);
  const card = document.getElementById(`order-${docId}`);
  if (!d || !card) return;

  const willOpen = d.style.display !== 'block';
  d.style.display = willOpen ? 'block' : 'none';
  card.classList.toggle('open', willOpen);
  if (willOpen) fetchAndFillDetails(docId);
}

// ===== زر تحديث يدوي اختياري =====
async function refreshOrdersFromFirebase(user) {
  const list = document.getElementById("ordersList");
  if (!list) return;
  showOrdersSkeleton(2);
  try {
    const freshIndex = await fetchOrdersFromFirebaseOnce(user);
    lsSet(LS_INDEX_KEY, freshIndex);
    renderOrdersFromIndex(freshIndex);
  } catch (e) {
    console.error(e);
    list.innerHTML = `<p style="color:#e11;">تعذّر تحديث الطلبات</p>`;
  }
}

// ===== (اختياري) عرض اتفاقية المستخدم إن وُجدت =====
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
