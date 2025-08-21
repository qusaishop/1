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

// فعّل الثيم المحفوظ مبكرًا (اختياري)
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark-mode');
    }
  } catch (e) {}
});

firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    alert("يجب تسجيل الدخول أولاً");
    window.location.href = "index.html";
  } else {
    // ✅ تحميل الطلبات بعد تأكد تسجيل الدخول
    loadOrdersFromFirebaseLive(user);
  }
});

let unsubscribeOrderList = [];

// ===== Skeleton shimmer while loading =====
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

function loadOrdersFromFirebaseLive(user) {
  const ordersList = document.getElementById("ordersList");
  if (!ordersList) return;

  ordersList.innerHTML = "";
  showOrdersSkeleton(1);

  unsubscribeOrderList.forEach(unsub => unsub && unsub());
  unsubscribeOrderList = [];

  const ordersRef = db.collection("orders").where("userId", "==", user.uid);

  const unsub = ordersRef.onSnapshot(async (snapshot) => {
    // إزالة اللمعات قبل البناء
    ordersList.querySelectorAll(".order-card.loading").forEach(n => n.remove());

    const promises = snapshot.docs.map(async (doc) => {
      const orderData = doc.data();
      const pubSnap = await doc.ref.collection("public").doc("main").get();
      const pubData = pubSnap.exists ? pubSnap.data() : {};

      return {
        code: orderData.code,
        ...pubData,
        proof: orderData.proof || ""
      };
    });

    const ordersArray = (await Promise.all(promises)).sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tB - tA;
    });

    renderOrders(ordersArray);
  }, (err) => {
    console.error(err);
    ordersList.querySelectorAll(".order-card.loading").forEach(n => n.remove());
  });

  unsubscribeOrderList.push(unsub);
}

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

let unsubscribeOrderListener = null;
async function showOrderDetails(code) {
  const detailsBox = document.getElementById("orderDetails");
  if (!detailsBox) return;

  if (unsubscribeOrderListener) unsubscribeOrderListener();

  if (!code) {
    detailsBox.style.display = "none";
    return;
  }

  const orderRef = db.collection("orders").doc(code);
  unsubscribeOrderListener = orderRef.onSnapshot(async docSnap => {
    if (!docSnap.exists) {
      detailsBox.style.display = "none";
      return;
    }
    const pubSnap = await orderRef.collection("public").doc("main").get();
    const privSnap = await orderRef.collection("private").doc("main").get();

    const pub = pubSnap.exists ? pubSnap.data() : {};
    const priv = privSnap.exists ? privSnap.data() : {};

    let rows = '';
    const appendRow = (label, value) => {
      rows += `<tr>
                 <td style="padding:10px;font-weight:bold;border:1px solid #ccc;">${label}</td>
                 <td style="padding:10px;border:1px solid #ccc;">${value}</td>
               </tr>`;
    };

    rows += `<tr><td colspan="2" style="background:#eee;padding:10px;font-weight:bold;">📂 Public</td></tr>`;
    Object.entries(pub).forEach(([k, v]) => appendRow(k, v));

    rows += `<tr><td colspan="2" style="background:#eee;padding:10px;font-weight:bold;">🔒 Private</td></tr>`;
    Object.entries(priv).forEach(([k, v]) => appendRow(k, v));

    detailsBox.innerHTML = `<table style="width:100%;direction:rtl;border-collapse:collapse;">${rows}</table>`;
    detailsBox.style.display = "block";
  }, err => {
    console.error(err);
    detailsBox.style.display = "none";
  });
}

// ✅ أبقِ هذا الحدث للاتفاقية فقط — بدون استدعاء loadOrdersFromFirebaseLive هنا
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

function toggleDetails(code) {
  const d = document.getElementById(`details-${code}`);
  if (!d) return;
  d.style.display = (d.style.display === 'block') ? 'none' : 'block';
}
