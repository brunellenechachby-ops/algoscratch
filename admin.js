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
  logout: document.querySelector("#admin-logout-button"),
  tableBody: document.querySelector("#progress-table-body"),
  status: document.querySelector("#admin-load-status"),
  empty: document.querySelector("#admin-empty"),
};

let adminState = {users: {}};
let adminUserMap = {};
const adminSupabaseClient = window.supabase && window.ALGO_SUPABASE
  ? window.supabase.createClient(window.ALGO_SUPABASE.url, window.ALGO_SUPABASE.key)
  : null;
const isLocalPreview = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);

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

function createAdminProgressFromRows(progressRows = [], projectRows = []) {
  const progress = normalizeProgress({});
  let latestTime = 0;

  progressRows.forEach((row) => {
    const activityId = row.activity_id;
    if (!adminActivities[activityId]) return;

    if (row.started_at || row.last_opened_at) {
      progress.activityVisits[activityId] = {
        startedAt: row.started_at || row.last_opened_at,
        lastOpenedAt: row.last_opened_at || row.started_at,
      };
    }

    const openedTime = Date.parse(row.last_opened_at || row.started_at || 0);
    if (openedTime > latestTime) {
      latestTime = openedTime;
      progress.lastActivity = activityId;
    }

    if (row.quiz_passed) {
      progress.quizzes[activityId] = true;
    }

    if (row.project_saved) {
      progress.scratchProjects[activityId] = {savedAt: row.updated_at || row.last_opened_at};
    }

    if (row.teacher_validated) {
      progress.validations[activityId] = {
        validated: true,
        validatedAt: row.teacher_validated_at || row.updated_at,
      };
    }
  });

  projectRows.forEach((row) => {
    if (!adminActivities[row.activity_id]) return;
    progress.scratchProjects[row.activity_id] = {
      ...(row.project_data || {}),
      savedAt: row.saved_at || row.project_data?.savedAt,
    };
  });

  return progress;
}

async function loadSupabaseAdminState() {
  if (!adminSupabaseClient) return null;

  const {data: sessionData} = await adminSupabaseClient.auth.getSession();
  const session = sessionData?.session;
  if (!session?.user) {
    throw new Error("Accès réservé : connecte-toi avec le compte prof.");
  }

  const {data: currentProfile, error: profileError} = await adminSupabaseClient
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (profileError || currentProfile?.role !== "admin") {
    throw new Error("Accès réservé : ce compte n’a pas le rôle admin.");
  }

  const [{data: profiles, error: profilesError}, {data: progressRows, error: progressError}, {data: projectRows, error: projectError}] = await Promise.all([
    adminSupabaseClient.from("profiles").select("id, username, role").order("username"),
    adminSupabaseClient.from("activity_progress").select("*"),
    adminSupabaseClient.from("scratch_projects").select("*"),
  ]);

  if (profilesError) throw profilesError;
  if (progressError) throw progressError;
  if (projectError) throw projectError;

  adminUserMap = {};
  const users = {};
  (profiles || [])
    .filter((profile) => profile.role !== "admin")
    .forEach((profile) => {
      adminUserMap[profile.username] = profile.id;
      const userProgressRows = (progressRows || []).filter((row) => row.user_id === profile.id);
      const userProjectRows = (projectRows || []).filter((row) => row.user_id === profile.id);
      users[profile.username] = createAdminProgressFromRows(userProgressRows, userProjectRows);
    });

  return {users};
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
    reset.textContent = adminUserMap[username]
      ? "Reset serveur \u00e0 venir"
      : (progress.passwordHash ? "R\u00e9initialiser le mot de passe" : "Mot de passe \u00e0 cr\u00e9er");
    reset.disabled = adminUserMap[username] || !progress.passwordHash;
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

async function persistSupabaseValidation(username, activityId, validated) {
  const userId = adminUserMap[username];
  if (!adminSupabaseClient || !userId) return false;

  const now = new Date().toISOString();
  const {error} = await adminSupabaseClient
    .from("activity_progress")
    .upsert({
      user_id: userId,
      activity_id: activityId,
      teacher_validated: validated,
      teacher_validated_at: validated ? now : null,
      updated_at: now,
    }, {onConflict: "user_id,activity_id"});

  if (error) throw error;
  return true;
}

async function loadAdminState() {
  if (!adminEls.tableBody) return;
  adminEls.status.textContent = "Chargement des \u00e9l\u00e8ves…";

  if (adminSupabaseClient) {
    try {
      adminState = await loadSupabaseAdminState();
      renderProgressTable();
      adminEls.status.textContent = "Donn\u00e9es Supabase \u00e0 jour";
      adminEls.status.className = "admin-load-status success";
      return;
    } catch (error) {
      adminEls.status.textContent = error.message;
      adminEls.status.className = "admin-load-status error";
      if (!isLocalPreview) {
        window.setTimeout(() => {
          window.location.href = "index.html";
        }, 1200);
        return;
      }
    }
  }

  try {
    const response = await fetch(ADMIN_STATE_ENDPOINT, {cache: "no-store"});
    if (!response.ok) throw new Error("Serveur non disponible");
    adminState = await response.json();
    renderProgressTable();
    adminEls.status.textContent = "Donn\u00e9es \u00e0 jour";
    adminEls.status.className = "admin-load-status success";
  } catch (error) {
    adminEls.status.textContent = `Suivi indisponible : ${error.message}`;
    adminEls.status.className = "admin-load-status error";
  }
}

async function guardAdminLandingPage() {
  if (adminEls.tableBody || !adminSupabaseClient || isLocalPreview) return;

  try {
    await loadSupabaseAdminState();
  } catch (error) {
    window.location.href = "index.html";
  }
}

async function handleAdminAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const username = button.dataset.username;
  const progress = normalizeProgress(adminState.users[username]);
  let handledBySupabase = false;

  try {
    if (button.dataset.action === "validation") {
      const activityId = button.dataset.activityId;
      const currentlyValidated = Boolean(progress.validations[activityId]?.validated);
      progress.validations[activityId] = currentlyValidated
        ? {validated: false, updatedAt: new Date().toISOString()}
        : {validated: true, validatedAt: new Date().toISOString()};
      handledBySupabase = await persistSupabaseValidation(username, activityId, !currentlyValidated);
    }

    if (button.dataset.action === "reset-password") {
      const confirmed = window.confirm(`R\u00e9initialiser le mot de passe de ${username} ? L\u2019\u00e9l\u00e8ve devra en cr\u00e9er un nouveau lors de sa prochaine connexion.`);
      if (!confirmed) return;
      delete progress.passwordHash;
    }

    adminState.users[username] = progress;
    if (!handledBySupabase) {
      await persistAdminState();
    }
    renderProgressTable();
    adminEls.status.textContent = "Modification enregistr\u00e9e";
    adminEls.status.className = "admin-load-status success";
  } catch (error) {
    adminEls.status.textContent = `La modification n\u2019a pas pu \u00eatre enregistr\u00e9e : ${error.message}`;
    adminEls.status.className = "admin-load-status error";
  }
}

async function logoutAdmin() {
  if (adminSupabaseClient) {
    await adminSupabaseClient.auth.signOut();
  }

  try {
    const savedState = JSON.parse(localStorage.getItem("algoscratch-prototype")) || {};
    savedState.currentUser = "";
    delete savedState.supabaseUserId;
    localStorage.setItem("algoscratch-prototype", JSON.stringify(savedState));
  } catch (error) {
    console.warn("Déconnexion locale incomplète :", error);
  }

  window.location.href = "index.html";
}

adminEls.sidebarToggle?.addEventListener("click", toggleAdminSidebar);
adminEls.refresh?.addEventListener("click", loadAdminState);
adminEls.logout?.addEventListener("click", logoutAdmin);
adminEls.tableBody?.addEventListener("click", handleAdminAction);
renderAdminSidebar();
guardAdminLandingPage();
loadAdminState();
