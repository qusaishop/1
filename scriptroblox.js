const bannerBackground = "https://wallpaperaccess.com/full/8489351.jpg";

const banner1 = document.getElementById("banner1");
banner1.style.backgroundImage = `url('${bannerBackground}')`;
banner1.classList.add("active");




// حساب المبلغ الإجمالي وعرضه
let totalOrder = 0, currencySymbolOrder = "";
function updateTotalAmount() {
  const method = "default"; // ← لا حاجة لاختيار طريقة دفع
  const sel = document.getElementById('selected-amount');

  if (!priceLists[method]) {
    sel.textContent = "لا تتوفر قائمة أسعار";
    return;
  }

  let total = 0, symbol = "", details = "";
  const offers = document.querySelectorAll('.offer-box.selected');

  if (offers.length) {
    offers.forEach(o => {
      const type = o.dataset.type;
      let priceStr = "";

      if (type === "topup") {
        const robux = o.dataset.robux;
        const p = priceLists[method].topup.find(x => x.robux.replace(/,/g, "") === robux);
        priceStr = p?.price || "";
        details += `• ${robux} روبوكس - ${priceStr}<br>`;
      } else {
        const name = o.dataset.offer;
        const p = priceLists[method].memberships.find(x => x.offer.includes(name));
        priceStr = p?.price || "";
        details += `• ${name} - ${priceStr}<br>`;
      }

      const num = parseFloat(priceStr.replace(/[^\d.]/g, ""));
      if (!isNaN(num)) total += num;
      if (!symbol && priceStr) symbol = priceStr.replace(/[\d.,\s]/g, "");
    });
  } else {
    details = "لم يتم اختيار أي عرض<br>";
  }

  totalOrder = total;
  currencySymbolOrder = symbol;
  details += `<br><strong>المجموع: ${total.toFixed(2)} ${symbol}</strong>`;
  sel.innerHTML = details;
}


  function recalcSelectedAmountUI() {
    const selectedOffers = Array.from(document.querySelectorAll('.offer-box.selected')).map(el => ({
      type: el.dataset.type,
      robux: el.dataset.robux || null,
      offerName: el.dataset.offer || null
    }));

    const offersPrices = JSON.parse(localStorage.getItem("offersPrices") || "{}");

    let total = 0;
    let breakdownLines = [];

    selectedOffers.forEach(offer => {
      const key = offer.robux ? `${offer.robux}_robux` : offer.offerName;
      const price = offersPrices[key];

      if (price !== undefined) {
        total += price;
        breakdownLines.push(`${offer.robux ? offer.robux + " روبكس" : offer.offerName} : ${price.toFixed(2)} د.أ`);
      } else {
        breakdownLines.push(`• ${offer.robux || offer.offerName}: ❓ غير معروف`);
      }
    });

    const el = document.getElementById("selected-amount");
    if (el) {
      el.innerHTML = `
        ${breakdownLines.length ? breakdownLines.join("<br>") : "لم يتم اختيار عرض شحن"}
        <br><br>
        <strong>المجموع: ${total.toFixed(2)} د.أ</strong>
      `;
    }
  }


  // state.js (نسخة تعمل فوريًا)
(function () {
  function waitForOffers(timeoutMs = 8000, intervalMs = 100) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (document.querySelectorAll('.offer-box').length) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('Timeout waiting for offers'));
        }
      }, intervalMs);
    });
  }

  function ensureBadge(card) {
    let badge = card.querySelector('.unavailable-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'unavailable-badge';
      badge.textContent = 'غير متوفر';
      card.appendChild(badge);
    }
    return badge;
  }

  function removeBadge(card) {
    const badge = card.querySelector('.unavailable-badge');
    if (badge) badge.remove();
  }

  function setCardState(card, isOn) {
    if (!card) return;
    if (isOn) {
      card.classList.remove('disabled');
      removeBadge(card);
      card.style.opacity = '';
      card.style.filter = '';
      card.style.pointerEvents = '';
      card.title = '';
    } else {
      card.classList.add('disabled');
      ensureBadge(card);
      card.style.pointerEvents = 'auto';
      card.title = 'غير متوفر حالياً';
    }
  }

  async function fetchState() {
    if (!(window.firebase && firebase.firestore)) throw new Error('Firebase not available');
    const db = firebase.firestore();
    try {
      const snap1 = await db.collection('topup').doc('pubg').get();
      if (snap1.exists) {
        const data = snap1.data() || {};
        if (typeof data.state === 'string') {
          return JSON.parse(data.state);
        }
      }
    } catch (_) {}

    const snap2 = await db.collection('pubg').doc('state').get();
    if (snap2.exists) {
      return snap2.data() || {};
    }
    throw new Error('لم يتم العثور على حالة العروض في Firestore');
  }

function applyConfig(cfg) {
  const topupMap = cfg.topup || {};
  const membershipMap = cfg.membership || {};

  let deselectedCount = 0;

  Object.entries(topupMap).forEach(([robux, status]) => {
    const card = document.querySelector(`.offer-box[data-type="topup"][data-robux="${robux}"]`);
    const isOn = String(status).toLowerCase() === 'on';
    setCardState(card, isOn);
    if (card && !isOn && card.classList.contains('selected')) {
      card.classList.remove('selected'); // ✅ إزالة التحديد عند الإيقاف
      deselectedCount++;
    }
  });

  Object.entries(membershipMap).forEach(([name, status]) => {
    const card = document.querySelector(`.offer-box[data-type="membership"][data-offer="${name}"]`);
    const isOn = String(status).toLowerCase() === 'on';
    setCardState(card, isOn);
    if (card && !isOn && card.classList.contains('selected')) {
      card.classList.remove('selected'); // ✅ إزالة التحديد عند الإيقاف
      deselectedCount++;
    }
  });

  // ✅ تحدّيث المبلغ إن تغيّر أي اختيار
  if (deselectedCount > 0) {
    recalcSelectedAmountUI();
    if (typeof showToast === 'function') {
      showToast(`⚠️ تم إلغاء تحديد ${deselectedCount} عرض بعد إيقافه`, "warning");
    }
  }
}


  async function applyState() {
    try {
      await waitForOffers().catch(() => {});
      const cfg = await fetchState();
      applyConfig(cfg);
    } catch (err) {
      console.error('فشل في جلب/تطبيق حالة العروض:', err);
    }
  }

  function listenStateRealtime() {
    if (!(window.firebase && firebase.firestore)) return;
    const db = firebase.firestore();
    waitForOffers().catch(() => {});

    // 1) topup/freefire.state (JSON string)
    try {
      db.collection('topup').doc('pubg').onSnapshot(snap => {
        const data = snap.data() || {};
        if (typeof data.state === 'string') {
          try {
            const cfg = JSON.parse(data.state);
            applyConfig(cfg);
          } catch (_) {
            console.warn('JSON غير صالح في topup/pubg.state');
          }
        }
      });
    } catch (_) {}

    // 2) freefire/state (object)
    try {
      db.collection('pubg').doc('state').onSnapshot(snap => {
        if (snap.exists) {
          const cfg = snap.data() || {};
          applyConfig(cfg);
        }
      });
    } catch (e) {
      console.error('فشل إنشاء مستمع Realtime:', e);
    }
  }

  // توسيط toast
  (function injectToastCentering(){
    const s = document.createElement('style');
    s.textContent = `#toast-message{display:flex;justify-content:center;align-items:center;width:100%;text-align:center;}`;
    document.head.appendChild(s);
  })();

  // إقلاع
  const boot = () => { applyState(); listenStateRealtime(); };
  if (window.firebase && firebase.auth) {
    const u = firebase.auth().currentUser;
    if (u) boot();
    else firebase.auth().onAuthStateChanged(() => boot());
  } else {
    boot();
  }
})();


  function applyConfig(cfg) {
    const topupMap = cfg.topup || {};
    const membershipMap = cfg.membership || {};
    let deselectedCount = 0;

    Object.entries(topupMap).forEach(([robux, status]) => {
      const card = document.querySelector(`.offer-box[data-type="topup"][data-robux="${robux}"]`);
      const isOn = String(status).toLowerCase() === 'on';
      setCardState(card, isOn);
      if (card && !isOn && card.classList.contains('selected')) {
        card.classList.remove('selected');
        deselectedCount++;
      }
    });

    Object.entries(membershipMap).forEach(([name, status]) => {
      const card = document.querySelector(`.offer-box[data-type="membership"][data-offer="${name}"]`);
      const isOn = String(status).toLowerCase() === 'on';
      setCardState(card, isOn);
      if (card && !isOn && card.classList.contains('selected')) {
        card.classList.remove('selected');
        deselectedCount++;
      }
    });

    if (deselectedCount > 0) {
      recalcSelectedAmountUI();
      if (typeof showToast === 'function') {
        showToast(`⚠️ تم إلغاء تحديد ${deselectedCount} عرض بعد إيقافه`, "warning");
      }
    }
  }




// اتفاقية المستخدم
function toggleAgreementText() {
  const container = document.getElementById('agreement-text');
  if (container.innerHTML.trim() === '') {
    container.innerHTML = agreementText;
    container.style.display = 'block';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function acceptAgreement() {
  localStorage.setItem('userAgreementAccepted', 'true');
  document.getElementById('user-agreement').style.display = 'none';
}



window.addEventListener("load", function () {
  const loader = document.getElementById("loader");
  if (loader) {
    loader.style.opacity = "0";
    loader.style.transition = "opacity 0.5s ease";
    setTimeout(() => {
      loader.style.display = "none";
    }, 500);
  }
});

function closePopupOnOutsideClick(event) {
  closePopup();
}
