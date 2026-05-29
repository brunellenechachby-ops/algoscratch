const ADMIN_PROJECT_SIDEBAR_KEY = "algoscratch-admin-sidebar-collapsed";
const SCRATCH_EDITOR_LOCAL_URL = "http://localhost:8601/";
const SCRATCH_EDITOR_PUBLIC_URL = "https://brunellenechachby-ops.github.io/algoscratch-scratch-gui/";
const SCRATCH_EDITOR_BASE_URL = ["localhost", "127.0.0.1", ""].includes(window.location.hostname)
  ? SCRATCH_EDITOR_LOCAL_URL
  : SCRATCH_EDITOR_PUBLIC_URL;
const SCRATCH_PROJECT_TIMEOUT_MS = 60000;
const adminProjectActivities = {
  "activite-1": "Activit\u00e9 1",
  "activite-2": "Activit\u00e9 2",
  "activite-3": "Activit\u00e9 3",
  "activite-4": "Activit\u00e9 4",
  "activite-5": "Activit\u00e9 5",
  "activite-6": "Activit\u00e9 6",
};

const adminProjectEls = {
  layout: document.querySelector(".admin-layout"),
  sidebarToggle: document.querySelector("#admin-sidebar-toggle"),
  logout: document.querySelector("#admin-project-logout"),
  validate: document.querySelector("#admin-project-validate"),
  title: document.querySelector("#admin-project-title"),
  subtitle: document.querySelector("#admin-project-subtitle"),
  status: document.querySelector("#admin-project-status"),
  frame: document.querySelector("#admin-project-frame"),
};

const adminProjectSupabase = window.supabase && window.ALGO_SUPABASE
  ? window.supabase.createClient(window.ALGO_SUPABASE.url, window.ALGO_SUPABASE.key)
  : null;

const params = new URLSearchParams(window.location.search);
const requestedUsername = params.get("username") || "";
const requestedActivityId = params.get("activity") || "";
let pendingImport = null;
let savedProject = null;
let reviewedStudentId = null;

function isLocalPreview() {
  return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
}

function renderAdminProjectSidebar() {
  if (!adminProjectEls.layout || !adminProjectEls.sidebarToggle) return;
  const collapsed = localStorage.getItem(ADMIN_PROJECT_SIDEBAR_KEY) === "true";
  adminProjectEls.layout.classList.toggle("sidebar-collapsed", collapsed);
  adminProjectEls.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  adminProjectEls.sidebarToggle.title = collapsed ? "Afficher l\u2019arborescence" : "Masquer l\u2019arborescence";
}

function setProjectStatus(message, stateName = "") {
  if (!adminProjectEls.status) return;
  adminProjectEls.status.textContent = message;
  adminProjectEls.status.className = ("admin-load-status " + stateName).trim();
}

function getScratchEditorUrl(activityId) {
  const url = new URL(SCRATCH_EDITOR_BASE_URL);
  url.searchParams.set("activity", activityId);
  url.searchParams.set("mode", "full");
  return url.toString();
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function loadProjectFromSessionStorage() {
  try {
    const cached = JSON.parse(sessionStorage.getItem("algoscratch-admin-project-preview") || "null");
    if (cached && cached.username === requestedUsername && cached.activityId === requestedActivityId) {
      return cached.project;
    }
  } catch (error) {
    console.warn("Cache de pr\u00e9visualisation indisponible :", error);
  }
  return null;
}

async function ensureAdminSession() {
  if (!adminProjectSupabase) return null;
  const {data: sessionData} = await adminProjectSupabase.auth.getSession();
  const session = sessionData && sessionData.session;
  if (!session || !session.user) throw new Error("Acc\u00e8s r\u00e9serv\u00e9 : connecte-toi avec le compte prof.");
  const {data: profile, error} = await adminProjectSupabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (error || !profile || profile.role !== "admin") throw new Error("Acc\u00e8s r\u00e9serv\u00e9 : ce compte n\u2019a pas le r\u00f4le admin.");
  return session;
}

async function loadProjectFromSupabase() {
  if (!adminProjectSupabase) return null;
  await ensureAdminSession();
  const {data: profile, error: profileError} = await adminProjectSupabase.from("profiles").select("id, username").eq("username", requestedUsername).single();
  if (profileError || !profile || !profile.id) throw new Error("\u00c9l\u00e8ve introuvable.");
  reviewedStudentId = profile.id;
  const {data: projectRow, error: projectError} = await adminProjectSupabase.from("scratch_projects").select("project_data, saved_at").eq("user_id", profile.id).eq("activity_id", requestedActivityId).single();
  if (projectError || !projectRow || !projectRow.project_data) throw new Error("Aucun projet sauvegard\u00e9 pour cette activit\u00e9.");
  return {...(projectRow.project_data || {}), savedAt: projectRow.saved_at || (projectRow.project_data && projectRow.project_data.savedAt)};
}

function importSavedProject() {
  if (!savedProject || !savedProject.projectBase64 || !adminProjectEls.frame || !adminProjectEls.frame.contentWindow) return;
  const requestId = Date.now() + "-" + Math.random().toString(16).slice(2);
  const projectData = base64ToArrayBuffer(savedProject.projectBase64);
  pendingImport = requestId;
  setProjectStatus("Projet trouv\u00e9 : chargement dans Scratch\u2026");
  window.setTimeout(() => {
    if (pendingImport === requestId) {
      pendingImport = null;
      setProjectStatus("Scratch n\u2019a pas confirm\u00e9 le chargement du projet \u00e0 temps.", "error");
    }
  }, SCRATCH_PROJECT_TIMEOUT_MS);
  adminProjectEls.frame.contentWindow.postMessage({
    type: "algoscratch:scratch:import-project",
    requestId,
    activityId: requestedActivityId,
    projectData,
  }, new URL(SCRATCH_EDITOR_BASE_URL).origin, [projectData]);
}

function handleScratchMessage(event) {
  const message = event.data || {};
  if (!message.type || !message.type.startsWith("algoscratch:scratch:")) return;
  if (message.type === "algoscratch:scratch:ready") {
    window.setTimeout(importSavedProject, 2500);
    return;
  }
  if (!pendingImport || message.requestId !== pendingImport) return;
  pendingImport = null;
  if (message.type.endsWith(":error")) {
    setProjectStatus("Impossible de charger le projet : " + (message.error || "erreur inconnue"), "error");
    return;
  }
  setProjectStatus("Projet Scratch charg\u00e9. Tu peux regarder les blocs et lancer le programme.", "success");
  if (adminProjectEls.validate) adminProjectEls.validate.disabled = false;
}

async function validateReviewedActivity() {
  if (!adminProjectSupabase || !reviewedStudentId) {
    setProjectStatus("Validation impossible : donn\u00e9es enseignant incompl\u00e8tes.", "error");
    return;
  }

  if (adminProjectEls.validate) adminProjectEls.validate.disabled = true;
  setProjectStatus("Validation de l\u2019activit\u00e9 en cours\u2026");

  try {
    await ensureAdminSession();
    const now = new Date().toISOString();
    const {error} = await adminProjectSupabase
      .from("activity_progress")
      .upsert({
        user_id: reviewedStudentId,
        activity_id: requestedActivityId,
        teacher_validated: true,
        teacher_validated_at: now,
        updated_at: now,
      }, {onConflict: "user_id,activity_id"});

    if (error) throw error;
    setProjectStatus("Activit\u00e9 valid\u00e9e. Retour au suivi\u2026", "success");
    window.setTimeout(() => { window.location.href = "admin-premiers-pas.html"; }, 500);
  } catch (error) {
    if (adminProjectEls.validate) adminProjectEls.validate.disabled = false;
    setProjectStatus("Validation impossible : " + (error.message || "erreur inconnue"), "error");
  }
}

async function logoutAdminProject() {
  if (adminProjectSupabase) await adminProjectSupabase.auth.signOut();
  try {
    const savedState = JSON.parse(localStorage.getItem("algoscratch-prototype")) || {};
    savedState.currentUser = "";
    delete savedState.supabaseUserId;
    localStorage.setItem("algoscratch-prototype", JSON.stringify(savedState));
  } catch (error) {
    console.warn("D\u00e9connexion locale incompl\u00e8te :", error);
  }
  window.location.href = "index.html";
}

async function bootAdminProject() {
  renderAdminProjectSidebar();
  if (!requestedUsername || !adminProjectActivities[requestedActivityId]) {
    setProjectStatus("Lien de projet incomplet.", "error");
    return;
  }
  adminProjectEls.title.textContent = "Projet sauvegard\u00e9 \u2014 " + requestedUsername;
  adminProjectEls.subtitle.textContent = adminProjectActivities[requestedActivityId] + " \u2014 consultation enseignant";
  try {
    savedProject = await loadProjectFromSupabase() || loadProjectFromSessionStorage();
    if (!savedProject || !savedProject.projectBase64) throw new Error("Le projet sauvegard\u00e9 ne contient pas encore de fichier Scratch.");
    adminProjectEls.frame.src = getScratchEditorUrl(requestedActivityId);
  } catch (error) {
    setProjectStatus(error.message, "error");
    if (!isLocalPreview()) {
      window.setTimeout(() => { window.location.href = "index.html"; }, 1600);
    }
  }
}

adminProjectEls.sidebarToggle?.addEventListener("click", () => {
  const collapsed = !adminProjectEls.layout.classList.contains("sidebar-collapsed");
  localStorage.setItem(ADMIN_PROJECT_SIDEBAR_KEY, String(collapsed));
  renderAdminProjectSidebar();
});
adminProjectEls.logout?.addEventListener("click", logoutAdminProject);
adminProjectEls.validate?.addEventListener("click", validateReviewedActivity);
window.addEventListener("message", handleScratchMessage);
bootAdminProject();
