const STORAGE_KEY = "algoscratch-prototype";
const SERVER_STATE_ENDPOINT = "/api/state";
const SERVER_STORAGE_ENABLED = window.location.protocol !== "file:";

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

const defaultState = {
  currentUser: "",
  sidebarCollapsed: false,
  users: {},
};

const els = {
  loginForm: document.querySelector("#login-form"),
  username: document.querySelector("#username"),
  sessionPill: document.querySelector("#session-pill"),
  logoutButton: document.querySelector("#logout-button"),
  blockPalette: document.querySelector("#block-palette"),
  programStack: document.querySelector("#program-stack"),
  activityFeedback: document.querySelector("#activity-feedback"),
  quizOptionsList: [...document.querySelectorAll("[data-quiz-options]")],
  quizFeedbackList: [...document.querySelectorAll("[data-quiz-feedback]")],
  completeLesson: document.querySelector("#complete-lesson"),
  resetBlocks: document.querySelector("#reset-blocks"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  learningLayout: document.querySelector(".learning-layout"),
  editorFrames: [...document.querySelectorAll(".editor-frame")],
  editorStatuses: [...document.querySelectorAll("[data-editor-status]")],
  scratchEditors: [...document.querySelectorAll("[data-scratch-editor]")],
  projectSavePanels: [...document.querySelectorAll("[data-project-save-panel]")],
};

const pendingScratchRequests = new Map();
let serverSaveTimer = null;

let state = loadState();

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
    return {
      programBuilt: false,
      quizPassed: false,
      quizzes: {},
      lessonCompleted: false,
      assembledProgram: [],
    };
  }

  if (!state.users[state.currentUser]) {
    state.users[state.currentUser] = {
      programBuilt: false,
      quizPassed: false,
      quizzes: {},
      scratchProjects: {},
      lessonCompleted: false,
      assembledProgram: [],
    };
    saveState();
  }

  if (!state.users[state.currentUser].quizzes) {
    state.users[state.currentUser].quizzes = state.users[state.currentUser].quizPassed
      ? { "activite-1": true }
      : {};
  }
  state.users[state.currentUser].scratchProjects ||= {};

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
  saveState();
  renderSidebar();
}

function renderSidebar() {
  if (!els.learningLayout || !els.sidebarToggle) return;

  els.learningLayout.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  els.sidebarToggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  els.sidebarToggle.title = state.sidebarCollapsed ? "Afficher l’arborescence" : "Masquer l’arborescence";
}

function promptLogin() {
  els.username?.focus();

  if (els.sessionPill) {
    els.sessionPill.textContent = "Connecte-toi depuis l’accueil pour sauvegarder";
  }
}

async function login(event) {
  event.preventDefault();
  const username = els.username.value.trim();
  if (username.length < 2) return;

  state.currentUser = username;
  await hydrateFromServer();
  getUserProgress();
  saveState();
  hydrateSession();
  hydrateProjectSavePanels();
}

function logout() {
  if (!state.currentUser) return;

  state.currentUser = "";
  saveState({ syncServer: false });
  hydrateSession();
  hydrateProjectSavePanels();
}

function hydrateSession() {
  const progress = getUserProgress();

  if (els.sessionPill) {
    els.sessionPill.textContent = state.currentUser
      ? `Élève : ${state.currentUser}`
      : "Mode découverte";
  }

  if (els.username) {
    els.username.value = state.currentUser;
  }

  if (els.logoutButton) {
    els.logoutButton.disabled = !state.currentUser;
    els.logoutButton.setAttribute("aria-disabled", String(!state.currentUser));
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
      status.textContent = "Si l’éditeur reste vide, il faut d’abord lancer le serveur Scratch local.";
      status.classList.add("warning");
    }, 7000);

    frame.addEventListener("load", () => {
      window.clearTimeout(timeoutId);
      status.textContent = "Éditeur Scratch local chargé.";
      status.classList.remove("warning");
      status.classList.add("ready");
    });
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

function createScratchRequest(type, activityId, payload = {}) {
  const editor = findEditorForActivity(activityId);
  if (!editor?.contentWindow) {
    return Promise.reject(new Error("L’éditeur Scratch n’est pas encore chargé."));
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const request = new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingScratchRequests.delete(requestId);
      reject(new Error("Scratch n’a pas répondu à temps."));
    }, 12000);

    pendingScratchRequests.set(requestId, {resolve, reject, timeoutId});
  });

  editor.contentWindow.postMessage({
    type,
    requestId,
    activityId,
    ...payload,
  }, "http://localhost:8601");

  return request;
}

function handleScratchBridgeMessage(event) {
  const message = event.data || {};
  if (!message.type || !message.type.startsWith("algoscratch:scratch:")) return;

  if (message.type === "algoscratch:scratch:ready") {
    els.projectSavePanels.forEach((panel) => {
      hydrateProjectSavePanel(panel.dataset.activityId);
    });
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

async function loadScratchProject(activityId) {
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
    await createScratchRequest("algoscratch:scratch:import-project", activityId, {projectData});
    setProjectSaveStatus(activityId, "Projet Scratch rechargé.", "success");
  } catch (error) {
    setProjectSaveStatus(activityId, `Impossible de recharger : ${error.message}`, "error");
  }
}

function hydrateProjectSavePanel(activityId) {
  if (!activityId) return;

  if (!state.currentUser) {
    setProjectSaveStatus(activityId, "Connecte-toi depuis l’accueil pour sauvegarder ton projet Scratch.");
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
els.logoutButton?.addEventListener("click", logout);
els.quizOptionsList.forEach((quizOptions) => {
  quizOptions.addEventListener("click", handleQuizClick);
});
els.completeLesson?.addEventListener("click", completeLesson);
els.resetBlocks?.addEventListener("click", resetBlocks);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.projectSavePanels.forEach((panel) => {
  const activityId = panel.dataset.activityId;
  panel.querySelector("[data-project-save]")?.addEventListener("click", () => saveScratchProject(activityId));
  panel.querySelector("[data-project-load]")?.addEventListener("click", () => loadScratchProject(activityId));
});
window.addEventListener("message", handleScratchBridgeMessage);

async function boot() {
  renderBlocks();
  hydrateEditors();
  await hydrateFromServer();
  hydrateSession();
  hydrateProjectSavePanels();
}

boot();
