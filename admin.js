const ADMIN_STATE_ENDPOINT = "/api/state";
const ADMIN_SIDEBAR_KEY = "algoscratch-admin-sidebar-collapsed";
const adminActivities = {
  "activite-1": "Activit\u00e9 1",
  "activite-2": "Activit\u00e9 2",
  "activite-3": "Activit\u00e9 3",
};

const adminEls = {
  layout: document.querySelector(".admin-layout"),
  sidebarToggle: document.querySelector("#admin-sidebar-toggle"),
  refresh: document.querySelector("#refresh-admin"),
  tableBody: document.querySelector("#progress-table-body"),
  status: document.querySelector("#admin-load-status"),
  empty: document.querySelector("#admin-empty"),
};

let adminState = {users: {}};

function renderAdminSidebar() {
  if (!adminEls.layout || !adminEls.sidebarToggle) return;
  const collapsed = localStorage.getItem(ADMIN_SIDEBAR_KEY) === "true";
  adminEls.layout.classList.toggle("sidebar-collapsed", collapsed);
  adminEls.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  adminEls.sidebarToggle.title = collapsed ? "Afficher l\u2019arborescence" : "Masquer l\u2019arborescence";
}

function toggleAdminSidebar() {
  const collapsed = !adminEls.layout.classList.contains("sidebar-collapsed");
  localStorage.setItem(ADMIN_SIDEBAR_KEY, String(collapsed));
  renderAdminSidebar();
}

function normalizeProgress(progress = {}) {
  return {
    ...progress,
    quizzes: progress.quizzes || {},
    scratchProjects: progress.scratchProjects || {},
    activityVisits: progress.activityVisits || {},
    validations: progress.validations || {},
  };
}

function hasStarted(progress, activityId) {
  return Boolean(
    progress.activityVisits[activityId] ||
    progress.lastActivity === activityId ||
    progress.scratchProjects[activityId] ||
    progress.quizzes[activityId] ||
    progress.validations[activityId]?.validated
  );
}

function latestActivityLabel(progress) {
  const activityId = progress.lastActivity;
  if (!adminActivities[activityId]) return "—";
  const date = progress.activityVisits[activityId]?.lastOpenedAt;
  if (!date) return adminActivities[activityId];
  return `${adminActivities[activityId]} — ${formatDate(date)}`;
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(isoDate));
}

function appendChip(container, label, kind) {
  const chip = document.createElement("span");
  chip.className = `status-chip ${kind}`;
  chip.textContent = label;
  container.append(chip);
}

function createActivityCell(username, progress, activityId) {
  const cell = document.createElement("td");
  const statuses = document.createElement("div");
  statuses.className = "cell-statuses";
  const validated = Boolean(progress.validations[activityId]?.validated);

  if (!hasStarted(progress, activityId)) {
    appendChip(statuses, "Non commenc\u00e9e", "empty");
  } else {
    appendChip(statuses, "Commenc\u00e9e", "started");
    if (progress.scratchProjects[activityId]) appendChip(statuses, "Projet sauvegard\u00e9", "project");
    if (progress.quizzes[activityId]) appendChip(statuses, "QCM r\u00e9ussi", "quiz");
    if (validated) appendChip(statuses, "Valid\u00e9e", "validated");
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = `validation-button${validated ? " is-validated" : ""}`;
  button.dataset.action = "validation";
  button.dataset.username = username;
  button.dataset.activityId = activityId;
  button.textContent = validated ? "Annuler validation" : "Valider";
  cell.append(statuses, button);
  return cell;
}

function renderProgressTable() {
  if (!adminEls.tableBody) return;
  adminEls.tableBody.innerHTML = "";
  const students = Object.entries(adminState.users || {}).sort(([first], [second]) => first.localeCompare(second, "fr"));
  adminEls.empty.hidden = students.length !== 0;

  students.forEach(([username, rawProgress]) => {
    const progress = normalizeProgress(rawProgress);
    const row = document.createElement("tr");
    const student = document.createElement("th");
    student.scope = "row";
    student.textContent = username;
    const latest = document.createElement("td");
    latest.className = "latest-activity";
    latest.textContent = latestActivityLabel(progress);
    row.append(student, latest);
    Object.keys(adminActivities).forEach((activityId) => row.append(createActivityCell(username, progress, activityId)));

    const account = document.createElement("td");
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "reset-password-button";
    reset.dataset.action = "reset-password";
    reset.dataset.username = username;
    reset.textContent = progress.passwordHash ? "R\u00e9initialiser le mot de passe" : "Mot de passe \u00e0 cr\u00e9er";
    reset.disabled = !progress.passwordHash;
    account.append(reset);
    row.append(account);
    adminEls.tableBody.append(row);
  });
}

async function persistAdminState() {
  const response = await fetch(ADMIN_STATE_ENDPOINT, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({users: adminState.users}),
  });
  if (!response.ok) throw new Error("Sauvegarde impossible.");
}

async function loadAdminState() {
  if (!adminEls.tableBody) return;
  adminEls.status.textContent = "Chargement des \u00e9l\u00e8ves…";
  try {
    const response = await fetch(ADMIN_STATE_ENDPOINT, {cache: "no-store"});
    if (!response.ok) throw new Error("Serveur non disponible");
    adminState = await response.json();
    renderProgressTable();
    adminEls.status.textContent = "Donn\u00e9es \u00e0 jour";
    adminEls.status.className = "admin-load-status success";
  } catch (error) {
    adminEls.status.textContent = "Suivi disponible uniquement avec le serveur local.";
    adminEls.status.className = "admin-load-status error";
  }
}

async function handleAdminAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const username = button.dataset.username;
  const progress = normalizeProgress(adminState.users[username]);

  if (button.dataset.action === "validation") {
    const activityId = button.dataset.activityId;
    const currentlyValidated = Boolean(progress.validations[activityId]?.validated);
    progress.validations[activityId] = currentlyValidated
      ? {validated: false, updatedAt: new Date().toISOString()}
      : {validated: true, validatedAt: new Date().toISOString()};
  }

  if (button.dataset.action === "reset-password") {
    const confirmed = window.confirm(`R\u00e9initialiser le mot de passe de ${username} ? L\u2019\u00e9l\u00e8ve devra en cr\u00e9er un nouveau lors de sa prochaine connexion.`);
    if (!confirmed) return;
    delete progress.passwordHash;
  }

  adminState.users[username] = progress;
  try {
    await persistAdminState();
    renderProgressTable();
    adminEls.status.textContent = "Modification enregistr\u00e9e";
    adminEls.status.className = "admin-load-status success";
  } catch (error) {
    adminEls.status.textContent = "La modification n\u2019a pas pu \u00eatre enregistr\u00e9e.";
    adminEls.status.className = "admin-load-status error";
  }
}

adminEls.sidebarToggle?.addEventListener("click", toggleAdminSidebar);
adminEls.refresh?.addEventListener("click", loadAdminState);
adminEls.tableBody?.addEventListener("click", handleAdminAction);
renderAdminSidebar();
loadAdminState();