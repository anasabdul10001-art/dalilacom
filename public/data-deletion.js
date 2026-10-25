
  // Facebook sends people here with ?code=... after an automatic deletion request.
  const code = new URLSearchParams(location.search).get("code");
  if (code) {
    const box = document.getElementById("status");
    box.style.display = "block";
    box.textContent = "تم استلام طلب الحذف ✅ رمز التأكيد: " + code + "  |  Deletion request received ✅ Confirmation code: " + code;
  }
