(async function () {
  const status = document.getElementById("status");
  const app = document.getElementById("app");

  try {
    const res = await fetch("./questions.json");
    const questions = await res.json();
    status.textContent = `Loaded ${questions.length} question(s).`;
    app.textContent = "Next: build UI";
  } catch (e) {
    status.textContent = "Failed to load questions.json";
    console.error(e);
  }
})();