// loader.js
document.addEventListener("DOMContentLoaded", function () {
  const preloader = document.getElementById("preloader");
  if (!preloader) return;

  const hide = () => {
    preloader.style.transition = "opacity 0.4s ease";
    preloader.style.opacity = "0";
    setTimeout(() => { preloader.style.display = "none"; }, 400);
  };

  // أخفِه مبكرًا قدر الإمكان لنُشبه index.html (بدون انتظار تحميل الصور)
  hide();

  // وفي حال بقي ظاهرًا لسبب ما، نضمن إخفاءه بعد اكتمال التحميل
  window.addEventListener("load", hide);
});
