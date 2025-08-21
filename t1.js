 
// إنشاء العنصر الرئيسي للحاوية
const contentContainer = document.createElement("div");
contentContainer.className = "content-container";

// العنوان مع الأيقونة
const heading = document.createElement("h2");
const icon = document.createElement("i");
icon.className = "fas fa-history";
heading.appendChild(icon);
heading.append(" طلباتي:");
contentContainer.appendChild(heading);

// إنشاء الحاوية التي ستحتوي على الطلبات
const ordersList = document.createElement("div");
ordersList.id = "ordersList";
ordersList.className = "orders-list";
contentContainer.appendChild(ordersList);

// إدراجها في الصفحة داخل العنصر المطلوب
window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("ordersContainer");
  if (container) {
    container.appendChild(contentContainer);
  } else {
    console.error('لم يتم العثور على العنصر بالمعرف "ordersContainer"');
  }
});

// إنشاء الفوتر
const footer = document.createElement("footer");
footer.className = "footer-icons";

// عنوان الفوتر
const footerTitle = document.createElement("h2");
footerTitle.className = "footer-title";
footerTitle.textContent = "لماذا تختارنا؟";
footer.appendChild(footerTitle);

// بيانات صناديق الأيقونات
const iconBoxesData = [
  {
    iconClass: "fas fa-shipping-fast shipping-icon",
    title: "شحن سريع",
    desc: "يتميز متجرنا بسرعته الفائقة بالشحن فبمجرد أن تطلب سيتم الشحن لك مباشرة"
  },
  {
    iconClass: "fas fa-lock",
    title: "آمن 100%",
    desc: "حماية كاملة للبيانات والمعاملات"
  },
  {
    iconClass: "fas fa-headset",
    title: "دعم فني مستمر",
    desc: "دعم فني مستمر لمساعدة العملاء عند الحاجة"
  },
  {
    iconClass: "fas fa-coins special-icon",
    title: "اسعار مميزة",
    desc: "نقدم اسعار اقل من اسعار اللعبة"
  },
  {
    iconClass: "fas fa-credit-card",
    title: "سهولة الدفع",
    desc: "طرق دفع عديدة"
  },
  {
    iconClass: "fas fa-shield-alt",
    title: "ضمان على الشحن",
    desc: "احصل على كامل المبلغ مع تعويض في حالة عدم وصول الشحنه"
  },
  {
    iconClass: "fas fa-sync-alt",
    title: "تحديثات مستمرة",
    desc: "نقوم بحل جميع المشاكل بشكل دوري"
  },
  {
    iconClass: "fas fa-tasks",
    title: "تعقب الطلبات",
    desc: "يمكنك رؤية حالة الطلبات الخاص بك من تبويب طلباتي"
  },
  {
    iconClass: "fas fa-undo",
    title: "الغاء الطلبات",
    desc: "يمكنك الغاء اي طلب قبل اتمام عملية الدفع عبر التواصل مع الدعم الفني"
  },
  {
    iconClass: "fas fa-server",
    title: "تخزين للطلبات",
    desc: "يتم وضع الطلبات في سيرفرات لعدم فقدانها تحت اي ضرف"
  }
];

// إنشاء كل صندوق أيقونة وإضافته للفوتر
iconBoxesData.forEach(({ iconClass, title, desc }) => {
  const box = document.createElement("div");
  box.className = "icon-box";

  const icon = document.createElement("i");
  icon.className = iconClass;
  box.appendChild(icon);

  const h3 = document.createElement("h3");
  h3.textContent = title;
  box.appendChild(h3);

  const p = document.createElement("p");
  p.textContent = desc;
  box.appendChild(p);

  footer.appendChild(box);
});

// إضافة الفوتر إلى الصفحة (مثلاً داخل العنصر بالمعرف footerContainer)
document.getElementById("footerContainer").appendChild(footer);


// دالة لتغيير حالة العرض (اختيار عنصر)
function toggleOffer(element) {
  element.classList.toggle("selected");
}

// دالة عرض تفاصيل الطلبات
function showOrderDetails(value) {
  const details = document.getElementById('orderDetails');
  if (value) {
    details.style.display = 'block';
    details.innerHTML = `<p>تفاصيل الطلب لكود: <strong>${value}</strong></p>`;
  } else {
    details.style.display = 'none';
    details.innerHTML = '';
  }
}
