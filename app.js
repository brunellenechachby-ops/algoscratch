const STORAGE_KEY = "algoscratch-prototype";
const SERVER_STATE_ENDPOINT = "/api/state";
const SERVER_STORAGE_ENABLED = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SCRATCH_EDITOR_LOCAL_URL = "http://localhost:8601/";
const SCRATCH_EDITOR_PUBLIC_URL = "https://brunellenechachby-ops.github.io/algoscratch-scratch-gui/";
const SCRATCH_EDITOR_BASE_URL = SERVER_STORAGE_ENABLED ? SCRATCH_EDITOR_LOCAL_URL : SCRATCH_EDITOR_PUBLIC_URL;

const expectedProgram = [
  "quand le drapeau vert est cliqué",
  "aller à x: 0 y: 0",
  "s’orienter à 90°",
  "effacer tout",
  "stylo en position d’écriture",
  "avancer de 50",
  "attendre 1 seconde",
  "avancer de 50",
  "attendre 1 seconde",
  "avancer de 50",
];

const blocks = [
  { label: "quand le drapeau vert est cliqué", type: "event" },
  { label: "aller à x: 0 y: 0", type: "motion" },
  { label: "s’orienter à 90°", type: "motion" },
  { label: "effacer tout", type: "pen" },
  { label: "stylo en position d’écriture", type: "pen" },
  { label: "avancer de 50", type: "motion" },
  { label: "attendre 1 seconde", type: "event" },
];

const activityDestinations = {
  "activite-1": {href: "activite-1.html", number: "1"},
  "activite-2": {href: "activite-2.html", number: "2"},
  "activite-3": {href: "activite-3.html", number: "3"},
  "activite-4": {href: "activite-4.html", number: "4"},
  "activite-5": {href: "activite-5.html", number: "5"},
  "activite-6": {href: "activite-6.html", number: "6"},
  "activite-7": {href: "activite-7.html", number: "7"},
  "activite-8": {href: "activite-8.html", number: "8"},
  "activite-9": {href: "activite-9.html", number: "9"},
  "activite-10": {href: "activite-10.html", number: "10"},
};

const defaultState = {
  currentUser: "",
  sidebarCollapsed: false,
  treeSections: {"premiers-pas": true, repeter: true},
  users: {},
};

const els = {
  loginForm: document.querySelector("#login-form"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  loginFeedback: document.querySelector("#login-feedback"),
  sessionPill: document.querySelector("#session-pill"),
  logoutButton: document.querySelector("#logout-button"),
  continuationLabel: document.querySelector("#continuation-label"),
  continuationLink: document.querySelector("#continuation-link"),
  blockPalette: document.querySelector("#block-palette"),
  programStack: document.querySelector("#program-stack"),
  activityFeedback: document.querySelector("#activity-feedback"),
  quizOptionsList: [...document.querySelectorAll("[data-quiz-options]")],
  quizFeedbackList: [...document.querySelectorAll("[data-quiz-feedback]")],
  completeLesson: document.querySelector("#complete-lesson"),
  resetBlocks: document.querySelector("#reset-blocks"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  treeSectionToggles: [...document.querySelectorAll("[data-tree-toggle]")],
  treeSectionItems: [...document.querySelectorAll(".tree-subitems")],
  learningLayout: document.querySelector(".learning-layout"),
  editorFrames: [...document.querySelectorAll(".editor-frame")],
  editorStatuses: [...document.querySelectorAll("[data-editor-status]")],
  scratchEditors: [...document.querySelectorAll("[data-scratch-editor]")],
  projectSavePanels: [...document.querySelectorAll("[data-project-save-panel]")],
};

const pendingScratchRequests = new Map();
const autoLoadedScratchProjects = new Set();
const SCRATCH_REQUEST_TIMEOUT_MS = 60000;
const SCRATCH_AUTOLOAD_DELAY_MS = 2500;
let serverSaveTimer = null;
let supabaseSaveTimer = null;
let activityVisitRecorded = false;

let state = loadState();
const supabaseClient = window.supabase && window.ALGO_SUPABASE
  ? window.supabase.createClient(window.ALGO_SUPABASE.url, window.ALGO_SUPABASE.key)
  : null;
let supabaseSession = null;

function loadState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...structuredClone(defaultState),
      ...savedState,
      users: savedState?.users || {},
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState(options = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Sauvegarde locale impossible :", error);
  }

  if (options.syncServer !== false) {
    queueServerStateSave();
    queueSupabaseProgressSave();
  }
}

function queueServerStateSave() {
  if (!SERVER_STORAGE_ENABLED) return;

  window.clearTimeout(serverSaveTimer);
  serverSaveTimer = window.setTimeout(() => {
    persistStateToServer();
  }, 350);
}

async function persistStateToServer() {
  if (!SERVER_STORAGE_ENABLED) return;

  try {
    const response = await fetch(SERVER_STATE_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        users: state.users,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erreur serveur ${response.status}`);
    }
  } catch (error) {
    console.warn("Sauvegarde serveur indisponible :", error);
  }
}

function usernameToEmail(username) {
  const normalizedUsername = username.toLowerCase();
  if (normalizedUsername === "prof") {
    return "prof@algoscratch.local";
  }
  return `${normalizedUsername}@eleves.algoscratch.fr`;
}

function createEmptyProgress() {
  return {
    programBuilt: false,
    quizPassed: false,
    quizzes: {},
    scratchProjects: {},
    lessonCompleted: false,
    assembledProgram: [],
    activityVisits: {},
    validations: {},
  };
}

async function ensureSupabaseSession() {
  if (!supabaseClient) return null;
  const {data, error} = await supabaseClient.auth.getSession();
  if (error) {
    console.warn("Session Supabase indisponible :", error);
    return null;
  }
  supabaseSession = data.session;
  return supabaseSession;
}

function queueSupabaseProgressSave() {
  if (!supabaseClient || !state.currentUser) return;

  window.clearTimeout(supabaseSaveTimer);
  supabaseSaveTimer = window.setTimeout(() => {
    persistProgressToSupabase();
  }, 450);
}

async function persistProgressToSupabase() {
  if (!supabaseClient || !state.currentUser) return;

  const session = supabaseSession || await ensureSupabaseSession();
  if (!session?.user) return;

  const progress = getUserProgress();
  const now = new Date().toISOString();
  const progressRows = Object.keys(activityDestinations).map((activityId) => ({
    user_id: session.user.id,
    activity_id: activityId,
    started_at: progress.activityVisits?.[activityId]?.startedAt || null,
    last_opened_at: progress.activityVisits?.[activityId]?.lastOpenedAt || null,
    quiz_passed: Boolean(progress.quizzes?.[activityId]),
    project_saved: Boolean(progress.scratchProjects?.[activityId]),
    updated_at: now,
  }));

  try {
    await supabaseClient
      .from("activity_progress")
      .upsert(progressRows, {onConflict: "user_id,activity_id"});

    const projectRows = Object.entries(progress.scratchProjects || {}).map(([activityId, project]) => ({
      user_id: session.user.id,
      activity_id: activityId,
      project_data: project,
      saved_at: project.savedAt || now,
    }));

    if (projectRows.length) {
      await supabaseClient
        .from("scratch_projects")
        .upsert(projectRows, {onConflict: "user_id,activity_id"});
    }
  } catch (error) {
    console.warn("Sauvegarde Supabase indisponible :", error);
  }
}

function applySupabaseProgress(username, rows = [], projects = []) {
  const progress = {
    ...createEmptyProgress(),
    ...(state.users[username] || {}),
    quizzes: {},
    scratchProjects: {},
    activityVisits: {},
    validations: {},
  };

  rows.forEach((row) => {
    const activityId = row.activity_id;
    if (!activityDestinations[activityId]) return;

    if (row.started_at || row.last_opened_at) {
      progress.activityVisits[activityId] = {
        startedAt: row.started_at || row.last_opened_at,
        lastOpenedAt: row.last_opened_at || row.started_at,
      };
      if (!progress.lastActivity || Date.parse(row.last_opened_at || 0) > Date.parse(progress.activityVisits[progress.lastActivity]?.lastOpenedAt || 0)) {
        progress.lastActivity = activityId;
      }
    }

    if (row.quiz_passed) {
      progress.quizzes[activityId] = true;
      progress.quizPassed = true;
    }

    if (row.project_saved) {
      progress.scratchProjects[activityId] ||= {
        savedAt: row.updated_at || row.last_opened_at || new Date().toISOString(),
      };
    }

    if (row.teacher_validated) {
      progress.validations[activityId] = {
        validated: true,
        validatedAt: row.teacher_validated_at || row.updated_at,
      };
    }
  });

  projects.forEach((project) => {
    if (!activityDestinations[project.activity_id]) return;
    progress.scratchProjects[project.activity_id] = {
      ...(project.project_data || {}),
      savedAt: project.saved_at || project.project_data?.savedAt || new Date().toISOString(),
    };
  });

  state.users[username] = progress;
  saveState({syncServer: false});
  return progress;
}

async function loadSupabaseProgress(username) {
  if (!supabaseClient) return null;
  const session = supabaseSession || await ensureSupabaseSession();
  if (!session?.user) return null;

  const [{data: progressRows, error: progressError}, {data: projectRows, error: projectError}] = await Promise.all([
    supabaseClient
      .from("activity_progress")
      .select("*")
      .eq("user_id", session.user.id),
    supabaseClient
      .from("scratch_projects")
      .select("*")
      .eq("user_id", session.user.id),
  ]);

  if (progressError) console.warn("Progression Supabase indisponible :", progressError);
  if (projectError) console.warn("Projets Supabase indisponibles :", projectError);
  return applySupabaseProgress(username, progressRows || [], projectRows || []);
}

async function hydrateFromServer() {
  if (!SERVER_STORAGE_ENABLED) return;

  try {
    const response = await fetch(SERVER_STATE_ENDPOINT, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Erreur serveur ${response.status}`);
    }

    const serverState = await response.json();
    state.users = {
      ...state.users,
      ...(serverState.users || {}),
    };
    saveState({syncServer: false});
    hydrateSession();
    hydrateProjectSavePanels();
  } catch (error) {
    console.warn("Chargement serveur indisponible :", error);
  }
}

function getUserProgress() {
  if (!state.currentUser) {
    return createEmptyProgress();
  }

  if (!state.users[state.currentUser]) {
    state.users[state.currentUser] = createEmptyProgress();
    saveState();
  }

  if (!state.users[state.currentUser].quizzes) {
    state.users[state.currentUser].quizzes = state.users[state.currentUser].quizPassed
      ? { "activite-1": true }
      : {};
  }
  state.users[state.currentUser].scratchProjects ||= {};
  state.users[state.currentUser].activityVisits ||= {};
  state.users[state.currentUser].validations ||= {};

  return state.users[state.currentUser];
}

function renderBlocks() {
  if (!els.blockPalette) return;

  els.blockPalette.innerHTML = "";

  blocks.forEach((block) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scratch-block ${block.type}`;
    button.textContent = block.label;
    button.addEventListener("click", () => addBlock(block.label));
    els.blockPalette.append(button);
  });
}

function addBlock(label) {
  if (!state.currentUser) {
    promptLogin();
    return;
  }

  const progress = getUserProgress();
  if (progress.assembledProgram.length >= expectedProgram.length) {
    return;
  }

  progress.assembledProgram.push(label);
  saveState();
  renderProgram();
  evaluateProgram();
}

function renderProgram() {
  if (!els.programStack) return;

  const progress = getUserProgress();
  els.programStack.innerHTML = "";

  progress.assembledProgram.forEach((block) => {
    const item = document.createElement("li");
    item.textContent = block;
    els.programStack.append(item);
  });
}

function evaluateProgram() {
  if (!els.activityFeedback) return;

  const progress = getUserProgress();
  const assembled = progress.assembledProgram;
  const prefixIsCorrect = assembled.every((block, index) => block === expectedProgram[index]);
  const isComplete = assembled.length === expectedProgram.length && prefixIsCorrect;

  if (!assembled.length) {
    els.activityFeedback.className = "activity-feedback";
    els.activityFeedback.innerHTML = 'Commence par le bloc <strong>quand le drapeau vert est cliqué</strong>.';
  } else if (!prefixIsCorrect) {
    els.activityFeedback.className = "activity-feedback error";
    els.activityFeedback.textContent = "Un bloc n’est pas au bon endroit. Réinitialise puis essaie de suivre l’ordre du programme.";
  } else if (!isComplete) {
    els.activityFeedback.className = "activity-feedback";
    els.activityFeedback.textContent = "Bon début. Continue la séquence.";
  } else {
    progress.programBuilt = true;
    els.activityFeedback.className = "activity-feedback success";
    els.activityFeedback.textContent = "Programme correct : la séquence est complète.";
    saveState();
  }
}

function handleQuizClick(event) {
  const button = event.target.closest("button");
  if (!button) return;

  if (!state.currentUser) {
    promptLogin();
    return;
  }

  const quizOptions = event.currentTarget;
  const quizId = quizOptions.dataset.quizId || "default";
  const quizFeedback = getQuizFeedback(quizId);
  const isCorrect = button.dataset.answer === "true";
  const buttons = [...quizOptions.querySelectorAll("button")];
  buttons.forEach((option) => option.classList.remove("selected-correct", "selected-wrong"));
  button.classList.add(isCorrect ? "selected-correct" : "selected-wrong");

  const progress = getUserProgress();
  progress.quizPassed = isCorrect;
  progress.quizzes ||= {};
  progress.quizzes[quizId] = isCorrect;

  if (quizFeedback) {
    quizFeedback.className = `quiz-feedback ${isCorrect ? "success" : "error"}`;
    quizFeedback.textContent = isCorrect
      ? "Exactement, c’est la bonne réponse."
      : "Pas tout à fait. Essaie une autre réponse.";
  }

  saveState();
}

function getQuizFeedback(quizId) {
  return els.quizFeedbackList.find((feedback) => feedback.dataset.quizId === quizId);
}

function completeLesson() {
  if (!state.currentUser) {
    promptLogin();
    return;
  }

  const progress = getUserProgress();
  progress.lessonCompleted = true;
  saveState();
  updateCompletionAction();
}

function updateCompletionAction() {
  if (!els.completeLesson) return;

  const progress = getUserProgress();
  els.completeLesson.textContent = progress.lessonCompleted
    ? "Leçon terminée"
    : "Marquer la leçon comme terminée";
}

function resetBlocks() {
  if (!els.programStack) return;

  if (!state.currentUser) {
    promptLogin();
    return;
  }

  const progress = getUserProgress();
  progress.programBuilt = false;
  progress.assembledProgram = [];
  saveState();
  renderProgram();
  evaluateProgram();
}

function resetQuizVisuals() {
  if (!els.quizOptionsList.length) return;

  els.quizOptionsList.forEach((quizOptions) => {
    [...quizOptions.querySelectorAll("button")].forEach((button) => {
      button.classList.remove("selected-correct", "selected-wrong");
    });
  });

  els.quizFeedbackList.forEach((feedback) => {
    feedback.className = "quiz-feedback";
    feedback.textContent = "Choisis une réponse.";
  });
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  saveState({ syncServer: false });
  renderSidebar();
}

function toggleTreeSection(event) {
  const sectionId = event.currentTarget.dataset.treeToggle;
  if (!sectionId) return;

  state.treeSections ||= {"premiers-pas": true, repeter: true};
  state.treeSections[sectionId] = state.treeSections[sectionId] === false;
  saveState({ syncServer: false });
  renderSidebar();
}

function renderSidebarValidationChecks(progress = getUserProgress()) {
  if (!els.treeSectionItems.length) return;

  els.treeSectionItems.forEach((section) => {
    section.querySelectorAll(".tree-subitem[data-activity-id]").forEach((link) => {
      link.querySelector(".validation-check")?.remove();

      const activityId = link.dataset.activityId;
      const isValidated = Boolean(progress.validations?.[activityId]?.validated);
      link.classList.toggle("is-validated", isValidated);

      if (isValidated) {
        const check = document.createElement("span");
        check.className = "validation-check";
        check.textContent = "\u2713";
        check.title = "Activit\u00e9 valid\u00e9e";
        check.setAttribute("aria-label", "activit\u00e9 valid\u00e9e");
        link.append(check);
      }
    });
  });
}

function renderSidebar() {
  if (!els.learningLayout || !els.sidebarToggle) return;

  els.learningLayout.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  els.sidebarToggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  els.sidebarToggle.title = state.sidebarCollapsed ? "Afficher l’arborescence" : "Masquer l’arborescence";

  if (els.treeSectionToggles.length && els.treeSectionItems.length) {
    state.treeSections ||= {"premiers-pas": true, repeter: true};

    els.treeSectionToggles.forEach((toggle) => {
      const sectionId = toggle.dataset.treeToggle;
      const items = document.querySelector("#" + sectionId + "-items");
      if (!sectionId || !items) return;

      const expanded = state.treeSections[sectionId] !== false;
      toggle.setAttribute("aria-expanded", String(expanded));
      items.hidden = !expanded;
    });

    renderSidebarValidationChecks();
  }
}

function promptLogin() {
  els.username?.focus();

  if (els.sessionPill) {
    els.sessionPill.textContent = "Connecte-toi pour sauvegarder";
  }
}

function setLoginFeedback(message = "", tone = "") {
  if (!els.loginFeedback) return;

  els.loginFeedback.textContent = message;
  els.loginFeedback.className = `login-feedback${tone ? ` ${tone}` : ""}`;
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loginWithSupabase(username, password) {
  if (!supabaseClient) return null;

  const email = usernameToEmail(username);
  let authResult = await supabaseClient.auth.signInWithPassword({email, password});
  let isNewAccount = false;

  if (authResult.error) {
    authResult = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {username},
      },
    });
    isNewAccount = true;
  }

  if (authResult.error) {
    throw authResult.error;
  }

  supabaseSession = authResult.data.session || (await ensureSupabaseSession());
  if (!supabaseSession?.user) {
    throw new Error("Compte créé, mais la session n’est pas active. Dans Supabase, désactive la confirmation email pour les comptes de test.");
  }

  await supabaseClient
    .from("profiles")
    .upsert(
      {id: supabaseSession.user.id, username, role: username === "prof" ? "admin" : "student"},
      {onConflict: "id", ignoreDuplicates: true},
    );

  const {data: profile} = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", supabaseSession.user.id)
    .single();

  return {isNewAccount, role: profile?.role || "student"};
}

async function login(event) {
  event.preventDefault();
  const username = els.username.value.trim();
  const password = els.password?.value || "";

  if (username.length < 2) return;
  if (!/^[A-Za-z0-9]{6}$/.test(password)) {
    setLoginFeedback("Le mot de passe doit contenir exactement 6 lettres ou chiffres.", "error");
    return;
  }

  await hydrateFromServer();
  let supabaseLogin = null;
  try {
    supabaseLogin = await loginWithSupabase(username, password);
  } catch (error) {
    if (supabaseClient) {
      setLoginFeedback(`Connexion Supabase impossible : ${error.message}`, "error");
      return;
    }
  }

  const passwordHash = await hashPassword(password);
  const knownUser = state.users[username];

  if (!supabaseLogin && knownUser?.passwordHash && knownUser.passwordHash !== passwordHash) {
    setLoginFeedback("Mot de passe incorrect pour cet identifiant.", "error");
    return;
  }

  state.currentUser = username;
  if (supabaseSession?.user) {
    state.supabaseUserId = supabaseSession.user.id;
    await loadSupabaseProgress(username);
  }
  const progress = getUserProgress();
  const isNewPassword = !progress.passwordHash;
  progress.passwordHash ||= passwordHash;
  saveState();
  hydrateSession();
  hydrateProjectSavePanels();
  els.password.value = "";
  setLoginFeedback(
    supabaseLogin
      ? (supabaseLogin.isNewAccount ? "Compte Supabase créé. Ta progression sera sauvegardée en ligne." : "Connexion Supabase réussie.")
      : (isNewPassword ? "Identifiant enregistré. Ta progression pourra être retrouvée." : "Connexion réussie."),
    "success",
  );

  if (supabaseLogin?.role === "admin") {
    window.location.href = "admin.html";
  }
}

async function handleAuthButton() {
  if (!state.currentUser) {
    window.location.href = "index.html";
    return;
  }

  await logout();
}

async function logout() {
  if (!state.currentUser) {
    window.location.href = "index.html";
    return;
  }

  if (supabaseClient) {
    await supabaseClient.auth.signOut();
    supabaseSession = null;
  }

  state.currentUser = "";
  delete state.supabaseUserId;
  saveState({ syncServer: false });
  hydrateSession();
  hydrateProjectSavePanels();
  if (els.password) els.password.value = "";
  setLoginFeedback("Tu es déconnecté.", "success");

  if (!window.location.pathname.endsWith("/index.html") && window.location.pathname !== "/") {
    window.location.href = "index.html";
  }
}

function inferLastActivity(progress) {
  if (activityDestinations[progress.lastActivity]) {
    return progress.lastActivity;
  }

  const savedProjects = Object.entries(progress.scratchProjects || {})
    .filter(([activityId]) => activityDestinations[activityId])
    .sort(([, first], [, second]) => Date.parse(second.savedAt || 0) - Date.parse(first.savedAt || 0));
  if (savedProjects.length) {
    return savedProjects[0][0];
  }

  if (progress.lessonCompleted) return "activite-10";
  if (progress.quizzes?.["activite-3"]) return "activite-3";
  if (progress.quizzes?.["activite-2"]) return "activite-2";
  return "activite-1";
}

function rememberCurrentActivity(progress) {
  if (!state.currentUser || activityVisitRecorded) return;

  const activityId = els.projectSavePanels[0]?.dataset.activityId;
  if (!activityDestinations[activityId]) return;

  const now = new Date().toISOString();
  progress.activityVisits ||= {};
  progress.activityVisits[activityId] ||= {startedAt: now};
  progress.activityVisits[activityId].lastOpenedAt = now;
  progress.lastActivity = activityId;
  activityVisitRecorded = true;
  saveState();
}

function updateContinuationAction(progress) {
  if (!els.continuationLabel || !els.continuationLink) return;

  if (!state.currentUser) {
    els.continuationLabel.textContent = "Commencer";
    els.continuationLink.href = "activite-1.html";
    els.continuationLink.textContent = "Ouvrir l’activité 1";
    return;
  }

  const activityId = inferLastActivity(progress);
  const destination = activityDestinations[activityId];
  els.continuationLabel.textContent = "Reprendre";
  els.continuationLink.href = destination.href;
  els.continuationLink.textContent = `Reprendre l’activité ${destination.number}`;
}

function hydrateSession() {
  const progress = getUserProgress();
  rememberCurrentActivity(progress);
  updateContinuationAction(progress);

  if (els.sessionPill) {
    els.sessionPill.textContent = state.currentUser
      ? `Élève : ${state.currentUser}`
      : "Mode découverte";
  }

  if (els.username) {
    els.username.value = state.currentUser;
  }

  if (els.logoutButton) {
    els.logoutButton.disabled = false;
    els.logoutButton.removeAttribute("aria-disabled");
    els.logoutButton.textContent = state.currentUser ? "Se d\u00e9connecter" : "Se connecter";
  }

  renderProgram();
  evaluateProgram();
  updateCompletionAction();
  renderSidebar();

  hydrateQuizzes(progress);
}

function hydrateQuizzes(progress) {
  resetQuizVisuals();

  els.quizOptionsList.forEach((quizOptions) => {
    const quizId = quizOptions.dataset.quizId || "default";
    const wasPassed = progress.quizzes?.[quizId] || (!progress.quizzes && progress.quizPassed);
    if (!wasPassed) return;

    const correctButton = quizOptions.querySelector('[data-answer="true"]');
    const quizFeedback = getQuizFeedback(quizId);
    correctButton?.classList.add("selected-correct");

    if (quizFeedback) {
      quizFeedback.className = "quiz-feedback success";
      quizFeedback.textContent = "Exactement, c’est la bonne réponse.";
    }
  });
}

function hydrateEditors() {
  if (!els.editorFrames.length || !els.editorStatuses.length) return;

  els.editorFrames.forEach((frame, index) => {
    const status = els.editorStatuses[index];
    if (!status) return;

    const timeoutId = window.setTimeout(() => {
      status.textContent = SERVER_STORAGE_ENABLED
        ? "Si l\u2019\u00e9diteur reste vide, v\u00e9rifie que le serveur Scratch local est lanc\u00e9."
        : "L\u2019\u00e9diteur Scratch met un peu de temps \u00e0 charger. Si la zone reste vide, actualise la page.";
      status.classList.add("warning");
    }, 15000);

    frame.addEventListener("load", () => {
      window.clearTimeout(timeoutId);
      status.textContent = "\u00c9diteur Scratch charg\u00e9.";
      status.classList.remove("warning");
      status.classList.add("ready");
    });
  });
}

function getScratchEditorUrl(activityId, mode = "simple") {
  const url = new URL(SCRATCH_EDITOR_BASE_URL);
  url.searchParams.set("activity", activityId);
  url.searchParams.set("mode", mode);
  return url.toString();
}

function hydrateScratchModeControls() {
  els.scratchEditors.forEach((editor) => {
    const activityId = editor.dataset.activityId;
    if (!activityDestinations[activityId] || editor.dataset.modeControlsReady) return;

    const wrapper = editor.closest(".editor-frame-wrap");
    if (!wrapper) return;

    const controls = document.createElement("div");
    controls.className = "scratch-mode-controls";
    controls.innerHTML = `
      <div>
        <strong>Éditeur Scratch</strong>
        <span data-scratch-mode-label>Mode guidé : blocs utiles uniquement</span>
      </div>
      <button class="secondary-button compact" type="button" data-scratch-mode-toggle>Mode complet</button>
    `;
    wrapper.after(controls);

    const label = controls.querySelector("[data-scratch-mode-label]");
    const button = controls.querySelector("[data-scratch-mode-toggle]");
    let mode = "simple";
    editor.src = getScratchEditorUrl(activityId, mode);

    button.addEventListener("click", () => {
      mode = mode === "simple" ? "full" : "simple";
      autoLoadedScratchProjects.delete(activityId);
      editor.src = getScratchEditorUrl(activityId, mode);
      label.textContent = mode === "simple"
        ? "Mode guidé : blocs utiles uniquement"
        : "Mode complet : tous les blocs Scratch";
      button.textContent = mode === "simple" ? "Mode complet" : "Mode guidé";
    });

    editor.dataset.modeControlsReady = "true";
  });
}

function findEditorForActivity(activityId) {
  return els.scratchEditors.find((editor) => editor.dataset.activityId === activityId);
}

function findProjectPanelElement(activityId, selector) {
  const panel = els.projectSavePanels.find((item) => item.dataset.activityId === activityId);
  return panel?.querySelector(selector);
}

function setProjectSaveStatus(activityId, message, stateName = "") {
  const status = findProjectPanelElement(activityId, "[data-project-save-status]");
  if (!status) return;

  status.className = `project-save-status ${stateName}`.trim();
  status.textContent = message;
}

function createScratchRequest(type, activityId, payload = {}, options = {}) {
  const editor = findEditorForActivity(activityId);
  if (!editor?.contentWindow) {
    return Promise.reject(new Error("L’éditeur Scratch n’est pas encore chargé."));
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const request = new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingScratchRequests.delete(requestId);
      reject(new Error("Scratch n’a pas répondu à temps."));
    }, options.timeoutMs || SCRATCH_REQUEST_TIMEOUT_MS);

    pendingScratchRequests.set(requestId, {resolve, reject, timeoutId});
  });

  const message = {
    type,
    requestId,
    activityId,
    ...payload,
  };
  const transfer = payload.projectData instanceof ArrayBuffer ? [payload.projectData] : undefined;
  editor.contentWindow.postMessage(message, new URL(SCRATCH_EDITOR_BASE_URL).origin, transfer);

  return request;
}

function handleScratchBridgeMessage(event) {
  const message = event.data || {};
  if (!message.type || !message.type.startsWith("algoscratch:scratch:")) return;

  if (message.type === "algoscratch:scratch:ready") {
    els.projectSavePanels.forEach((panel) => {
      hydrateProjectSavePanel(panel.dataset.activityId);
    });
    const readyEditor = els.scratchEditors.find((editor) => editor.contentWindow === event.source);
    if (readyEditor?.dataset.activityId) {
      autoLoadScratchProject(readyEditor.dataset.activityId);
    }
    return;
  }

  if (!message.requestId || !pendingScratchRequests.has(message.requestId)) return;

  const request = pendingScratchRequests.get(message.requestId);
  window.clearTimeout(request.timeoutId);
  pendingScratchRequests.delete(message.requestId);

  if (message.type.endsWith(":error")) {
    request.reject(new Error(message.error || "Action Scratch impossible."));
  } else {
    request.resolve(message);
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function autoLoadScratchProject(activityId) {
  if (!state.currentUser || autoLoadedScratchProjects.has(activityId)) return;

  const savedProject = getUserProgress().scratchProjects?.[activityId];
  if (!savedProject?.projectBase64) return;

  autoLoadedScratchProjects.add(activityId);
  try {
    setProjectSaveStatus(activityId, "Projet sauvegard\u00e9 trouv\u00e9 : rechargement automatique\u2026");
    await wait(SCRATCH_AUTOLOAD_DELAY_MS);
    await loadScratchProject(activityId, {automatic: true});
  } catch (error) {
    autoLoadedScratchProjects.delete(activityId);
    console.warn("Rechargement automatique Scratch impossible :", error);
  }
}

async function saveScratchProject(activityId) {
  if (!state.currentUser) {
    promptLogin();
    return;
  }

  try {
    setProjectSaveStatus(activityId, "Sauvegarde du projet Scratch…");
    const response = await createScratchRequest("algoscratch:scratch:export-project", activityId);
    const projectBase64 = await blobToBase64(response.projectBlob);
    const progress = getUserProgress();
    progress.scratchProjects ||= {};
    progress.scratchProjects[activityId] = {
      projectBase64,
      savedAt: new Date().toISOString(),
    };
    saveState();
    hydrateProjectSavePanel(activityId);
  } catch (error) {
    setProjectSaveStatus(activityId, `Impossible de sauvegarder : ${error.message}`, "error");
  }
}

async function loadScratchProject(activityId, options = {}) {
  if (!state.currentUser) {
    promptLogin();
    return;
  }

  const savedProject = getUserProgress().scratchProjects?.[activityId];
  if (!savedProject) {
    setProjectSaveStatus(activityId, "Aucun projet sauvegardé pour cette activité.", "error");
    return;
  }

  try {
    setProjectSaveStatus(activityId, "Chargement du projet sauvegardé…");
    const projectData = base64ToArrayBuffer(savedProject.projectBase64);
    await createScratchRequest("algoscratch:scratch:import-project", activityId, {projectData}, {timeoutMs: SCRATCH_REQUEST_TIMEOUT_MS});
    setProjectSaveStatus(activityId, options.automatic ? "Projet Scratch restaur\u00e9 automatiquement." : "Projet Scratch recharg\u00e9.", "success");
  } catch (error) {
    setProjectSaveStatus(activityId, `Impossible de recharger : ${error.message}`, "error");
  }
}

function hydrateProjectSavePanel(activityId) {
  if (!activityId) return;

  if (!state.currentUser) {
    setProjectSaveStatus(activityId, "Connecte-toi pour sauvegarder ton projet Scratch.");
    return;
  }

  const savedProject = getUserProgress().scratchProjects?.[activityId];
  if (!savedProject) {
    setProjectSaveStatus(activityId, "Aucun projet sauvegardé pour cette activité.");
    return;
  }

  const savedDate = new Date(savedProject.savedAt);
  const savedLabel = Number.isNaN(savedDate.getTime())
    ? "Projet Scratch sauvegardé."
    : `Projet Scratch sauvegardé le ${savedDate.toLocaleDateString("fr-FR")} à ${savedDate.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    })}.`;

  setProjectSaveStatus(activityId, savedLabel, "success");
}

function hydrateProjectSavePanels() {
  els.projectSavePanels.forEach((panel) => hydrateProjectSavePanel(panel.dataset.activityId));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Lecture du projet exporté impossible."));
    reader.readAsDataURL(blob);
  });
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

els.loginForm?.addEventListener("submit", login);
els.logoutButton?.addEventListener("click", handleAuthButton);
els.quizOptionsList.forEach((quizOptions) => {
  quizOptions.addEventListener("click", handleQuizClick);
});
els.completeLesson?.addEventListener("click", completeLesson);
els.resetBlocks?.addEventListener("click", resetBlocks);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.treeSectionToggles.forEach((toggle) => toggle.addEventListener("click", toggleTreeSection));
els.projectSavePanels.forEach((panel) => {
  const activityId = panel.dataset.activityId;
  panel.querySelector("[data-project-save]")?.addEventListener("click", () => saveScratchProject(activityId));
  panel.querySelector("[data-project-load]")?.addEventListener("click", () => loadScratchProject(activityId));
});
window.addEventListener("message", handleScratchBridgeMessage);

async function boot() {
  renderBlocks();
  hydrateScratchModeControls();
  hydrateEditors();
  await ensureSupabaseSession();
  await hydrateFromServer();
  if (state.currentUser && supabaseSession?.user) {
    state.supabaseUserId = supabaseSession.user.id;
    await loadSupabaseProgress(state.currentUser);
  }
  if (state.currentUser && !state.users[state.currentUser]?.passwordHash) {
    state.currentUser = "";
    saveState({ syncServer: false });
  }
  hydrateSession();
  hydrateProjectSavePanels();
  els.scratchEditors.forEach((editor) => autoLoadScratchProject(editor.dataset.activityId));
}

boot();
