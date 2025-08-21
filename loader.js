// loader.js
document.addEventListener("DOMContentLoaded", function () {
  const preloader = document.getElementById("preloader");

  window.addEventListener("load", function () {
    setTimeout(() => {
      preloader.style.opacity = "0";
      preloader.style.transition = "opacity 0.5s ease";
      setTimeout(() => {
        preloader.style.display = "none";
      }, 500);
    }, 1000); // يظل ظاهر نصف ثانية إضافية
  });
});
