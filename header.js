// ===== الهيدر =====
const header = document.createElement("header");
header.className = "top-header";

// زر الهامبرغر
const hamburger = document.createElement("div");
hamburger.id = "hamburger";
hamburger.onclick = toggleSidebar;

for (let i = 0; i < 3; i++) {
  const span = document.createElement("span");
  hamburger.appendChild(span);
}
header.appendChild(hamburger);

// الشعار
const logo = document.createElement("img");
logo.src = "https://i.ibb.co/Jw8XwRLg/Picsart-25-08-21-23-54-55-228.png";
logo.alt = "Store Logo";
logo.className = "header-logo";

// عنصر الرصيد داخل الهيدر
const balanceSpan = document.createElement("span");
balanceSpan.id = "balanceHeader";
balanceSpan.className = "header-balance";
balanceSpan.style.marginRight = "0px";

// أضف أيقونة الرصيد + أيقونة (+) للنقل إلى الإيداع
balanceSpan.innerHTML = `
  <i class="fas fa-coins"></i> 
  <span id="headerBalanceText">0.00 د.أ</span>
  <i id="depositShortcut" class="fas fa-plus" style="color: white; cursor: pointer; margin-left:0px;"></i>
`;


// مستمع لتحويل المستخدم إلى صفحة الإيداع عند الضغط على +
balanceSpan.querySelector("#depositShortcut").onclick = () => {
  window.location.href = "edaa.html";
};


const leftContainer = document.createElement("div");
leftContainer.style.display = "flex";
leftContainer.style.alignItems = "center";
leftContainer.style.gap = "10px"; // ✅ مسافة بين الرصيد والهامبرغر
leftContainer.appendChild(hamburger);
leftContainer.appendChild(balanceSpan);

// ضعه في أقصى يسار الهيدر
header.appendChild(logo); // الشعار في أقصى اليمين
header.appendChild(leftContainer); // الهامبرغر والرصيد في اليسار

// ===== مستمع الرصيد اللحظي =====
let unsubscribeBalance = null;

// مساعد لتحديث نص الرصيد بأمان
function setHeaderBalance(text) {
  const el = document.getElementById("headerBalanceText") || balanceSpan.querySelector("#headerBalanceText");
  if (el) el.textContent = text;
}

// تحميل وتحديث الرصيد لحظيًا بعد تسجيل الدخول
firebase.auth().onAuthStateChanged(user => {
  // ألغِ أي اشتراك سابق قبل إنشاء اشتراك جديد
  if (typeof unsubscribeBalance === "function") {
    try { unsubscribeBalance(); } catch (e) { console.warn("unsubscribeBalance error:", e); }
    unsubscribeBalance = null;
  }

  if (user && user.emailVerified) {
    setHeaderBalance("0.00 د.أ");

    const docRef = firebase.firestore().collection("users").doc(user.uid);

    // 🟢 مستمع لحظي لأي تغيير في وثيقة المستخدم (balance)
    unsubscribeBalance = docRef.onSnapshot(
      (snap) => {
        if (snap.exists) {
          const raw = snap.data().balance ?? 0;
          const numeric = Number(raw);
          const safe = Number.isFinite(numeric) ? numeric : 0;
          setHeaderBalance(`${safe.toFixed(2)} د.أ`);
        } else {
          setHeaderBalance("0.00 د.أ");
        }
      },
      (err) => {
        console.error("Balance listener error:", err);
        setHeaderBalance("تعذر التحميل");
      }
    );
  } else {
    setHeaderBalance("غير مسجل");
  }
});

// (اختياري) نظافة: إلغاء المستمع عند إغلاق الصفحة
window.addEventListener("beforeunload", () => {
  if (typeof unsubscribeBalance === "function") {
    try { unsubscribeBalance(); } catch (e) {}
  }
});

// إضافته للصفحة
window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("headerContainer");
  if (container) {
    container.appendChild(header);
  }
  // علّم جلسة الملاحة لأي رابط يؤدي إلى صفحة HTML داخل الموقع
  document.addEventListener('click', function(e){
    const a = e.target.closest('a[href$=".html"]');
    if (a) { try { sessionStorage.setItem('nav:fromHome','1'); } catch (e) {} }
  });
});

// التحكم في ظهور زر "تسجيل الدخول" و"الإعدادات" و"الإيداع" بناء على حالة المصادقة
firebase.auth().onAuthStateChanged(user => {
  const loginItem = document.getElementById('loginSidebarBtn');
  const depositItem = document.getElementById('depositBtn');
  const sahbItem = document.getElementById('sahbBtn'); // ⬅️ جديد

  if (user && user.emailVerified) {
    if (loginItem) loginItem.style.display = "none";

    // أظهر زرّي الإيداع والسحب للمسجّلين
    if (depositItem) depositItem.style.display = "flex";
    if (sahbItem) sahbItem.style.display = "flex"; // ⬅️ جديد

    // أضف زر الإعدادات إذا لم يكن موجوداً
    if (!document.getElementById("settingsBtn")) {
      const settingsLi = document.createElement("li");
      settingsLi.id = "settingsBtn";
      settingsLi.innerHTML = `<i class="fas fa-cog"></i><a href="#">الإعدادات</a>`;
      settingsLi.onclick = () => navigateTo("settings.html");

      const ul = document.querySelector("#sidebar ul");
      if (ul) ul.insertBefore(settingsLi, loginItem);
    }

  } else {
    if (loginItem) loginItem.style.display = "flex";

    // أخفِ زرّي الإيداع والسحب لغير المسجّلين
    if (depositItem) depositItem.style.display = "none";
    if (sahbItem) sahbItem.style.display = "none"; // ⬅️ جديد

    const settingsLi = document.getElementById("settingsBtn");
    if (settingsLi) settingsLi.remove();
  }
});

// ===== الشريط الجانبي (sidebar) =====
const sidebar = document.createElement("nav");
sidebar.id = "sidebar";

const ul = document.createElement("ul");

// عنصر: الرئيسية
const homeLi = document.createElement("li");
homeLi.onclick = () => navigateTo("index.html");
homeLi.innerHTML = `<i class="fas fa-home"></i><a href="#">الرئيسية</a>`;
ul.appendChild(homeLi);

// عنصر: طلباتي (سنستخدمه كمرجع للإدراج قبلَه)
const ordersLi = document.createElement("li");
ordersLi.onclick = () => navigateTo("talabat.html");
ordersLi.innerHTML = `<i class="fas fa-list"></i><a href="#">طلباتي</a>`;
ul.appendChild(ordersLi);

// عنصر: الإيداع (يوضع بعد الرئيسية وقبل "طلباتي")
// عنصر: الإيداع (يوضع بعد الرئيسية وقبل "طلباتي")
const depositLi = document.createElement("li");
depositLi.id = "depositBtn";
depositLi.innerHTML = `<i class="fas fa-wallet"></i><a href="#">الإيداع</a>`;
depositLi.onclick = () => navigateTo("edaa.html");
// مخفي مبدئياً وسنظهره للمستخدم المسجّل فقط
depositLi.style.display = "none";
// ضعه قبل "طلباتي" ليظهر بعد "الرئيسية" مباشرة
ul.insertBefore(depositLi, ordersLi);


// عنصر: التقييمات
const ratingLi = document.createElement("li");
ratingLi.onclick = () => navigateTo("Reviews.html"); 
ratingLi.innerHTML = `<i class="fas fa-star" style="color: gold;"></i><a href="#">التقييمات</a>`;
ul.appendChild(ratingLi);


// عنصر: تسجيل الدخول
const loginLi = document.createElement("li");
loginLi.id = "loginSidebarBtn";
loginLi.innerHTML = `<i class="fas fa-sign-in-alt"></i><a href="#">تسجيل الدخول</a>`;
loginLi.onclick = () => {
  toggleSidebar();
  window.location.href = "login.html";
};
ul.appendChild(loginLi);

sidebar.appendChild(ul);

// إضافته للصفحة
window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("sidebarContainer");
  if (container) {
    container.appendChild(sidebar);
  }
});

// ===== قسم الدعم =====
const section = document.createElement("section");
section.className = "support-section";

const title = document.createElement("h2");
title.className = "support-title";
title.textContent = "هل تحتاج إلى المساعدة؟ تواصل معنا عبر";
section.appendChild(title);

const iconsDiv = document.createElement("div");
iconsDiv.className = "support-icons";

const contacts = [
  {
    href: "https://t.me/+962790809441",
    iconURL: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/telegram.svg",
    class: "telegram"
  },
  {
    href: "https://www.instagram.com/qus2i_shop/",
    iconURL: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/instagram.svg",
    class: "instagram"
  },
  {
    href: "https://wa.me/962790809441",
    iconURL: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/whatsapp.svg",
    class: "whatsapp"
  },
  {
    href: "https://www.facebook.com/share/17Eodommb4/",
    iconURL: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/facebook.svg",
    class: "facebook"
  },
  {
    href: "https://mail.google.com/mail/?view=cm&to=qusaialfalahat2@gmail.com",
    iconURL: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/gmail.svg",
    class: "email"
  }
];

contacts.forEach(contact => {
  const a = document.createElement("a");
  a.href = contact.href;
  a.target = "_blank";
  a.className = `support-icon ${contact.class}`;

  const img = document.createElement("img");
  img.src = contact.iconURL;
  img.alt = `${contact.class} icon`;
  img.style.width = "32px";
  img.style.height = "32px";

  a.appendChild(img);
  iconsDiv.appendChild(a);
});

section.appendChild(iconsDiv);
document.body.appendChild(section);

// ===== قسم الحقوق =====
const rightsDiv = document.createElement("div");
rightsDiv.className = "support-rights";

// رابط واتساب مع النص
const devLink = document.createElement("a");
devLink.href = "https://wa.me/962790108559";
devLink.target = "_blank";
devLink.innerHTML = `<i class="fas fa-external-link-alt" style="margin-left:6px;"></i> هذا الموقع من تطوير ليث قرقز`;
rightsDiv.appendChild(devLink);

// حقوق النشر
const copyright = document.createElement("p");
copyright.textContent = "كل الحقوق محفوظة © 2025";
rightsDiv.appendChild(copyright);

section.appendChild(rightsDiv);

// ===== الدوال المستخدمة =====
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) {
    console.warn("الشريط الجانبي غير موجود بعد.");
    return;
  }
  sidebar.classList.toggle('active');
}

document.addEventListener('click', function(event) {
  const sidebar = document.getElementById('sidebar');
  const hamburger = document.getElementById('hamburger');
  if (
    sidebar.classList.contains('active') &&
    !sidebar.contains(event.target) &&
    !hamburger.contains(event.target)
  ) {
    sidebar.classList.remove('active');
  }
});

function navigateTo(url) {
  try { sessionStorage.setItem('nav:fromHome', '1'); } catch (e) {}
  toggleSidebar();
  setTimeout(() => {
    window.location.href = url;
  }, 200);
}

// تعطيل القائمة اليمنى وسحب الصور
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});
document.addEventListener('dragstart', function (e) {
  if (e.target.tagName === 'IMG') {
    e.preventDefault();
  }
});
