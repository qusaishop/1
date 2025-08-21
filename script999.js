function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      getUserBalance(userCredential.user.uid);
    })
    .catch((error) => {
      document.getElementById("authStatus").textContent = "خطأ: " + error.message;
    });
}

function register() {
  const displayName = document.getElementById("displayName").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      return userCredential.user.updateProfile({ displayName: displayName })
        .then(() => {
          return db.collection("users").doc(userCredential.user.uid).set({
            email: email,
            displayName: displayName,
            balance: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
    })
    .then(() => {
      document.getElementById("authStatus").textContent = "تم إنشاء الحساب بنجاح!";
    })
    .catch((error) => {
      document.getElementById("authStatus").textContent = "خطأ: " + error.message;
    });
}

function logout() {
  auth.signOut().then(() => {
    document.getElementById("authStatus").textContent = "تم تسجيل الخروج";
  });
}

function resetPassword() {
  const email = document.getElementById("email").value;
  if (!email) {
    return document.getElementById("authStatus").textContent = "الرجاء إدخال بريدك الإلكتروني أولًا.";
  }
  auth.sendPasswordResetEmail(email)
    .then(() => {
      document.getElementById("authStatus").textContent = "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك.";
    })
    .catch((error) => {
      document.getElementById("authStatus").textContent = "خطأ: " + error.message;
    });
}

function getUserBalance(uid) {
  db.collection("users").doc(uid).get()
    .then((doc) => {
      if (doc.exists) {
        const userData = doc.data();
        document.getElementById("authStatus").textContent =
          `مرحبًا ${userData.displayName || ''}، رصيدك: ${userData.balance} ريال`;
      } else {
        document.getElementById("authStatus").textContent = "لم يتم العثور على بيانات المستخدم.";
      }
    })
    .catch((error) => {
      console.error("Firestore error:", error);
      document.getElementById("authStatus").textContent = "حدث خطأ أثناء جلب الرصيد.";
    });
}

auth.onAuthStateChanged(user => {
  if (user) {
    getUserBalance(user.uid);
  }
});