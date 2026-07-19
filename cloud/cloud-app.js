const cfg = window.TGC_CLOUD;
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey);
const login = ($) => document.querySelector($);
const state = {
  profile: null,
  clients: [],
  work: [],
  rules: [],
  users: [],
  notifications: [],
  holidays: [],
  view: "dashboard",
  workFilter: "open",
  workSearch: "",
  automationWarning: "",
};
const today = new Date();
today.setHours(0, 0, 0, 0);

const THEME_KEY = "tgc_display_theme";
function currentTheme() {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}
function applyTheme(theme) {
  const resolved = theme === "dark" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, resolved);
  document.body.dataset.theme = resolved;
  const toggle = login("#themeToggle");
  if (toggle) {
    const next = resolved === "dark" ? "light" : "dark";
    toggle.setAttribute("aria-label", `Switch to ${next} mode`);
    toggle.title = `Switch to ${next} mode`;
  }
  const colourLogo = login(".brand-logo-colour");
  const monoLogo = login(".brand-logo-monochrome");
  if (colourLogo) colourLogo.src = "/assets/tgc-logo-nav.png";
  if (monoLogo) monoLogo.src = "/assets/tgc-logo-monochrome.png";
}
function toggleTheme() {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
}

const SIDEBAR_KEY = "tgc_sidebar_collapsed";
function applySidebarPreference(collapsed) {
  const shell = login("#cloudShell");
  const button = login("#sidebarToggle") || login("#sidebarCollapse");
  if (!shell) return;
  shell.classList.toggle("sidebar-collapsed", Boolean(collapsed));
  localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  if (button) {
    button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    button.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  }
}
function initSidebarPreference() {
  applySidebarPreference(localStorage.getItem(SIDEBAR_KEY) === "1");
}

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const safeHttps = (value) => {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};
const fmt = (d) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const days = (d) => Math.ceil((new Date(d + "T00:00:00") - today) / 86400000);
const statusLabel = (s) =>
  ({
    not_started: "Not started",
    documents_pending: "Documents pending",
    in_progress: "In progress",
    review: "Review",
    ready_to_file: "Ready to file",
    filed: "Filed",
  })[s] || s;
const statusClass = (s) =>
  ({
    not_started: "pending",
    documents_pending: "overdue",
    in_progress: "progress",
    review: "review",
    ready_to_file: "review",
    filed: "complete",
  })[s] || "pending";
const WORKFLOW_STAGES = [
  { key: "documents", label: "Documents", statuses: ["documents_pending"] },
  {
    key: "preparation",
    label: "Preparation",
    statuses: ["not_started", "in_progress"],
  },
  { key: "review", label: "Review", statuses: ["review"] },
  { key: "ready", label: "Ready to file", statuses: ["ready_to_file"] },
  { key: "filed", label: "Filed", statuses: ["filed"] },
];
const workStageIndex = (status) =>
  ({
    documents_pending: 0,
    not_started: 1,
    in_progress: 1,
    review: 2,
    ready_to_file: 3,
    filed: 4,
  })[status] ?? 1;
const workProgress = (status) => [12, 28, 58, 82, 100][workStageIndex(status)];
const nextAction = (item) =>
  ({
    not_started:
      "Start the preparation and confirm the client records required.",
    documents_pending:
      "Follow up with the client and record all missing information before preparation continues.",
    in_progress:
      "Complete the workings, reconcile the figures and submit the job for internal review.",
    review:
      "Reviewer checks the return, supporting workings and outstanding queries.",
    ready_to_file:
      "An authorised reviewer or administrator submits the return before the statutory deadline.",
    filed:
      "Retain the filing acknowledgement and payment evidence in the client file.",
  })[item.status] ||
  "Review the work item and choose the correct control stage.";
const roleCanFinalise = () =>
  ["admin", "reviewer"].includes(state.profile?.role);
const workOwnerName = (item) => {
  const id = item.assigned_to || item.clients?.assigned_to;
  if (!id) return "Unassigned";
  return (
    state.users.find((user) => user.id === id)?.full_name || "Assigned staff"
  );
};
const urgencyRank = (item) => {
  if (item.status === "filed") return 99999;
  const remaining = days(item.statutory_due_date);
  return remaining < 0 ? remaining - 10000 : remaining;
};

const WORK_STATUS_ORDER = {
  documents_pending: 0,
  not_started: 1,
  in_progress: 2,
  review: 3,
  ready_to_file: 4,
  filed: 5,
};
const ROLE_ORDER = { admin: 0, reviewer: 1, preparer: 2, readonly: 3 };
const textCompare = (a, b) =>
  String(a || "").localeCompare(String(b || ""), "en", {
    sensitivity: "base",
    numeric: true,
  });
const workDueTime = (item) => {
  const value = new Date(`${item.statutory_due_date || "9999-12-31"}T00:00:00`).getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};
const compareWorkItems = (a, b) => {
  const aFiled = a.status === "filed",
    bFiled = b.status === "filed";
  if (aFiled !== bFiled) return aFiled ? 1 : -1;
  if (aFiled && bFiled) {
    const filedDifference =
      new Date(b.filed_at || 0).getTime() - new Date(a.filed_at || 0).getTime();
    if (filedDifference) return filedDifference;
  }
  const dueDifference = workDueTime(a) - workDueTime(b);
  if (dueDifference) return dueDifference;
  const stageDifference =
    (WORK_STATUS_ORDER[a.status] ?? 99) - (WORK_STATUS_ORDER[b.status] ?? 99);
  if (stageDifference) return stageDifference;
  return (
    textCompare(a.clients?.legal_name, b.clients?.legal_name) ||
    textCompare(a.return_name, b.return_name) ||
    textCompare(a.period_label, b.period_label)
  );
};
const canDeleteWork = (item) =>
  state.profile?.role === "admin" &&
  item?.work_kind === "one_off" &&
  item?.status !== "filed";

const allowedWorkStatuses = (item) => {
  const role = state.profile?.role;
  if (role === "readonly") return [];
  if (item.status === "filed")
    return role === "admin" ? ["filed", "review"] : ["filed"];
  if (role === "preparer") {
    return ["not_started", "documents_pending", "in_progress", "review"];
  }
  return [
    "not_started",
    "documents_pending",
    "in_progress",
    "review",
    "ready_to_file",
    "filed",
  ];
};
const pageHead = (eyebrow, title, sub, actions = "") =>
  `<div class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${sub}</p></div><div class="head-actions">${actions}</div></div>`;
const stat = (label, value, note, icon, cls = "", filter = "open") =>
  `<button type="button" class="stat-card dashboard-stat" data-dashboard-filter="${filter}" aria-label="View ${label.toLowerCase()} work"><div class="stat-top"><span>${label}</span><i class="stat-icon">${icon}</i></div><strong>${value}</strong><span class="delta ${cls}">${note}</span><span class="stat-action">View work →</span></button>`;
const mauritiusGreeting = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Indian/Mauritius",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
};

const GUARD_KEY = "tgc_login_guard_v1";
const LAST_ACTIVITY_KEY = "tgc_secure_last_activity";
const IDLE_LIMIT = 30 * 60 * 1000;
let sessionWatch,
  activityWritten = 0,
  activityBound = false;
function clearSecuritySession() {
  localStorage.removeItem("tgc_secure_session_started");
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  clearInterval(sessionWatch);
}
function startSecuritySession() {
  const now = Date.now();
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  const active = () => {
    const t = Date.now();
    if (t - activityWritten > 60000) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(t));
      activityWritten = t;
    }
  };
  if (!activityBound) {
    ["pointerdown", "keydown", "scroll", "touchstart"].forEach((name) =>
      addEventListener(name, active, { passive: true }),
    );
    activityBound = true;
  }
  clearInterval(sessionWatch);
  sessionWatch = setInterval(async () => {
    const t = Date.now(),
      last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || t);
    if (t - last > IDLE_LIMIT) {
      clearSecuritySession();
      await sb.auth.signOut();
      location.reload();
    }
  }, 30000);
}
const readGuard = () => {
  try {
    return (
      JSON.parse(localStorage.getItem(GUARD_KEY)) || {
        failures: 0,
        lockUntil: 0,
      }
    );
  } catch {
    return { failures: 0, lockUntil: 0 };
  }
};
const writeGuard = (guard) =>
  localStorage.setItem(GUARD_KEY, JSON.stringify(guard));
let guardTimer;
function enforceGuard() {
  clearInterval(guardTimer);
  const button = login("#loginButton"),
    box = login("#loginError");
  const tick = () => {
    const guard = readGuard(),
      left = Math.ceil((guard.lockUntil - Date.now()) / 1000);
    if (left <= 0) {
      button.disabled = false;
      if (box.dataset.guard === "1") box.textContent = "";
      delete box.dataset.guard;
      clearInterval(guardTimer);
      return;
    }
    button.disabled = true;
    box.dataset.guard = "1";
    box.textContent =
      left < 60
        ? `Please wait ${left} seconds before trying again.`
        : `Too many unsuccessful attempts. Try again in ${Math.ceil(left / 60)} minutes.`;
  };
  tick();
  if (button.disabled) guardTimer = setInterval(tick, 1000);
}
function recordFailure() {
  const guard = readGuard();
  guard.failures = (guard.failures || 0) + 1;
  const delays = [0, 0, 2000, 15000, 30000];
  guard.lockUntil =
    guard.failures >= 5
      ? Date.now() + 15 * 60 * 1000
      : Date.now() + (delays[guard.failures] || 0);
  writeGuard(guard);
  enforceGuard();
}
login("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const guard = readGuard();
  if (guard.lockUntil > Date.now()) {
    enforceGuard();
    return;
  }
  const errorBox = login("#loginError"),
    button = login("#loginButton");
  errorBox.textContent = "Signing in…";
  button.disabled = true;
  try {
    const { error } = await sb.auth.signInWithPassword({
      email: login("#loginEmail").value.trim().toLowerCase(),
      password: login("#loginPassword").value,
    });
    if (error) {
      if (
        error.code === "invalid_credentials" ||
        /invalid login credentials/i.test(error.message || "")
      ) {
        recordFailure();
        if (readGuard().lockUntil <= Date.now())
          errorBox.textContent =
            "Unable to sign in. Check your details and try again.";
      } else {
        errorBox.textContent =
          "Sign-in is temporarily unavailable. Please wait and try again.";
      }
      return;
    }
    localStorage.removeItem(GUARD_KEY);
    errorBox.textContent = "Access confirmed. Loading…";
    await start();
  } catch {
    errorBox.textContent =
      "Unable to connect securely. Please try again later.";
  } finally {
    if (readGuard().lockUntil <= Date.now()) button.disabled = false;
  }
};
login("#signOut").onclick = async () => {
  clearSecuritySession();
  await sb.auth.signOut();
  location.reload();
};
const showPasswordScreen = () => {
  login("#loginScreen").classList.add("hidden");
  login("#cloudShell").classList.add("hidden");
  login("#passwordScreen").classList.remove("hidden");
  login("#passwordError").textContent = "";
};
login("#togglePassword").onclick = () => {
  const field = login("#loginPassword"),
    showing = field.type === "text";
  field.type = showing ? "password" : "text";
  login("#togglePassword").textContent = showing ? "Show" : "Hide";
};
login("#forgotPassword").onclick = async () => {
  const email = login("#loginEmail").value.trim(),
    box = login("#loginError"),
    button = login("#forgotPassword"),
    last = Number(localStorage.getItem("tgc_last_recovery") || 0);
  if (!email) {
    box.textContent = "Enter your email address first.";
    return;
  }
  if (Date.now() - last < 60000) {
    box.textContent =
      "A request was already made. Please wait before trying again.";
    return;
  }
  button.disabled = true;
  box.textContent =
    "If the account is authorised, a secure reset email will be sent.";
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/cloud/index.html`,
  });
  if (!error) localStorage.setItem("tgc_last_recovery", String(Date.now()));
  setTimeout(() => {
    button.disabled = false;
  }, 60000);
};

login("#cancelPassword").onclick = () => location.reload();
login("#passwordForm").onsubmit = async (e) => {
  e.preventDefault();
  const password = login("#newPassword").value,
    confirm = login("#confirmPassword").value,
    box = login("#passwordError"),
    button = e.submitter;
  if (password !== confirm) {
    box.textContent = "Passwords do not match.";
    return;
  }
  if (
    !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}/.test(password)
  ) {
    box.textContent =
      "Use 12+ characters with uppercase, lowercase, a number and a symbol.";
    return;
  }
  button.disabled = true;
  box.textContent = "Saving securely…";
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    box.textContent =
      "The password could not be updated. Please request a new recovery link.";
    button.disabled = false;
    return;
  }
  await sb.auth.signOut({ scope: "others" });
  localStorage.removeItem(GUARD_KEY);
  box.style.color = "#137a52";
  box.textContent =
    "Password updated and other sessions revoked. Returning to secure sign-in…";
  setTimeout(
    () => location.assign(`${location.origin}/cloud/index.html`),
    1400,
  );
};
sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showPasswordScreen();
});
enforceGuard();

async function loadPracticeData() {
  const queries = [
    sb
      .from("clients")
      .select("*,client_obligations(obligation_rules(code,name))")
      .order("legal_name"),
    sb
      .from("work_items")
      .select("*,clients(legal_name,brn)")
      .order("statutory_due_date"),
    sb
      .from("obligation_rules")
      .select("*")
      .eq("status", "active")
      .order("category")
      .order("name"),
    sb
      .from("notifications")
      .select("*")
      .is("read_at", null)
      .order("created_at", { ascending: false }),
  ];
  if (state.profile?.role === "admin") {
    queries.push(sb.from("profiles").select("*").order("full_name"));
    queries.push(sb.from("non_working_days").select("*").order("holiday_date"));
  }
  const results = await Promise.all(queries);
  if (results.some((x) => x.error))
    throw new Error("Unable to load authorised practice data.");
  state.clients = results[0].data || [];
  state.work = results[1].data || [];
  state.rules = results[2].data || [];
  state.notifications = results[3].data || [];
  state.users = results[4]?.data || [];
  state.holidays = results[5]?.data || [];
}
let pendingMfa = null;
function showMfaScreen() {
  login("#loginScreen").classList.add("hidden");
  login("#passwordScreen").classList.add("hidden");
  login("#cloudShell").classList.add("hidden");
  login("#mfaScreen").classList.remove("hidden");
}
function showMfaFailure() {
  showMfaScreen();
  pendingMfa = null;
  login("#mfaQr").classList.add("hidden");
  login("#mfaTitle").textContent = "Authenticator setup unavailable";
  login("#mfaText").textContent =
    "Your password was accepted, but two-step verification could not be prepared. Your client data remains locked.";
  login("#mfaCode").disabled = true;
  login("#mfaButton").disabled = true;
  login("#mfaError").textContent =
    "Check that TOTP is enabled in Supabase Authentication → Multi-Factor, then choose Use another account and try again.";
}
async function requireAdminMfa() {
  const { data: aal, error: aalError } =
    await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) throw aalError;
  if (aal?.currentLevel === "aal2") return true;
  const { data: factors, error } = await sb.auth.mfa.listFactors();
  if (error) throw error;
  let factor = factors?.totp?.find((x) => x.status === "verified");
  showMfaScreen();
  login("#mfaCode").disabled = false;
  login("#mfaButton").disabled = false;
  login("#mfaError").textContent = "";
  if (!factor) {
    for (const stale of factors?.all?.filter(
      (x) => x.factor_type === "totp" && x.status !== "verified",
    ) || []) {
      const { error: removeError } = await sb.auth.mfa.unenroll({
        factorId: stale.id,
      });
      if (removeError) throw removeError;
    }
    const { data: enrolled, error: enrolError } = await sb.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "TGC Practice Manager",
    });
    if (enrolError) throw enrolError;
    factor = enrolled;
    login("#mfaTitle").textContent = "Protect your TGC account";
    login("#mfaText").textContent =
      "Scan this QR code with Microsoft Authenticator, Google Authenticator or another TOTP app, then enter the six-digit code. This replaces email codes for routine sign-in.";
    const qr = String(enrolled.totp.qr_code || "");
    login("#mfaQr").classList.remove("hidden");
    login("#mfaQr").innerHTML =
      `${qr.startsWith("data:image/svg+xml") ? `<img src="${esc(qr)}" alt="Authenticator QR code">` : ""}<span class="mfa-secret">Manual key: ${esc(enrolled.totp.secret)}</span>`;
  } else {
    login("#mfaQr").classList.add("hidden");
    login("#mfaTitle").textContent = "Verify your identity";
    login("#mfaText").textContent =
      "Enter the current six-digit code from your authenticator app. No email is required.";
  }
  pendingMfa = factor;
  return false;
}
login("#mfaSignOut").onclick = async () => {
  await sb.auth.signOut();
  location.reload();
};
login("#mfaForm").onsubmit = async (e) => {
  e.preventDefault();
  const code = login("#mfaCode").value.trim(),
    box = login("#mfaError"),
    button = login("#mfaButton");
  if (!pendingMfa) {
    box.textContent =
      "Authenticator setup is not ready. Use another account and try again.";
    return;
  }
  button.disabled = true;
  box.textContent = "Verifying…";
  const { data: challenge, error: challengeError } =
    await sb.auth.mfa.challenge({ factorId: pendingMfa.id });
  if (challengeError) {
    box.textContent =
      "Verification could not start. Use another account, sign in again and retry.";
    button.disabled = false;
    return;
  }
  const { error } = await sb.auth.mfa.verify({
    factorId: pendingMfa.id,
    challengeId: challenge.id,
    code,
  });
  if (error) {
    box.textContent =
      "The code is incorrect or expired. Wait for the newest code and try again.";
    button.disabled = false;
    return;
  }
  login("#mfaScreen").classList.add("hidden");
  await enterPractice();
};
async function enterPractice() {
  startSecuritySession();
  login("#cloudShell").classList.remove("hidden");
  login("#cloudRoot").innerHTML =
    '<div class="loading">Loading secure practice data…</div>';
  state.automationWarning = "";
  if (state.profile.role === "admin" || state.profile.role === "reviewer") {
    try {
      const generated = await sb.rpc("generate_upcoming_work", {
        p_months_ahead: 12,
      });
      const reminded = await sb.rpc("refresh_deadline_notifications");
      if (generated.error || reminded.error)
        state.automationWarning =
          "Automatic deadlines or reminders could not be refreshed. Do not rely on this register until an administrator checks the database migration.";
    } catch {
      state.automationWarning =
        "Automatic deadlines or reminders could not be refreshed. Do not rely on this register until an administrator checks the database migration.";
    }
  }
  try {
    await loadPracticeData();
  } catch {
    login("#cloudRoot").innerHTML =
      '<section class="page"><div class="cloud-error">Unable to load authorised practice data. Confirm that migration v2 and security/automation review v3 have been run.</div></section>';
    return;
  }
  login("#userName").textContent = state.profile.full_name;
  login("#userRole").textContent = state.profile.role;
  const initials = String(state.profile.full_name || "TGC")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  if (login("#userAvatar")) login("#userAvatar").textContent = initials || "TG";
  const notificationCount = login("#notificationCount");
  if (notificationCount) {
    notificationCount.textContent = String(state.notifications.length);
    notificationCount.classList.toggle("hidden", !state.notifications.length);
  }
  if (state.profile.role === "admin") {
    login("#usersNav").classList.remove("hidden");
    login("#quickAdd")?.classList.remove("hidden");
  }
  render("dashboard");
}
async function start() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return;
  const p = await sb
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (p.error || !p.data?.active) {
    await sb.auth.signOut();
    login("#loginError").textContent =
      "This account is not authorised for TGC Practice Manager.";
    return;
  }
  state.profile = p.data;
  try {
    if (!(await requireAdminMfa())) return;
  } catch {
    showMfaFailure();
    return;
  }
  login("#loginScreen").classList.add("hidden");
  await enterPractice();
}
function render(view) {
  if (view === "users" && state.profile?.role !== "admin")
    view = "dashboard";
  state.view = view;
  document
    .querySelectorAll("#cloudNav .nav-item")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  (
    ({ dashboard, clients, work, users, documents, billing, settings })[view] ||
    dashboard
  )();
}
function dashboard() {
  const open = state.work.filter((item) => item.status !== "filed"),
    filed = state.work.filter((item) => item.status === "filed"),
    overdue = open.filter((item) => days(item.statutory_due_date) < 0),
    due7 = open.filter(
      (item) =>
        days(item.statutory_due_date) >= 0 &&
        days(item.statutory_due_date) <= 7,
    ),
    waiting = open.filter((item) => item.status === "documents_pending"),
    review = open.filter((item) => item.status === "review"),
    preparation = open.filter((item) =>
      ["not_started", "in_progress"].includes(item.status),
    ),
    ready = open.filter((item) => item.status === "ready_to_file"),
    firstName = state.profile.full_name?.split(" ")[0] || "there",
    priority = [...open].sort(compareWorkItems),
    upcoming = [...open]
      .filter((item) => days(item.statutory_due_date) >= 0)
      .sort(compareWorkItems),
    completion = state.work.length
      ? Math.round(
          state.work.reduce(
            (total, item) => total + workProgress(item.status),
            0,
          ) / state.work.length,
        )
      : 100,
    dateLabel = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Indian/Mauritius",
    }).format(new Date());

  const attentionByClient = new Map();
  open.forEach((item) => {
    const remaining = days(item.statutory_due_date);
    if (remaining >= 0 && item.status !== "documents_pending") return;
    const name = item.clients?.legal_name || "Client not linked";
    const current = attentionByClient.get(name) || {
      name,
      total: 0,
      overdue: 0,
      documents: 0,
      closest: 99999,
    };
    current.total += 1;
    if (remaining < 0) current.overdue += 1;
    if (item.status === "documents_pending") current.documents += 1;
    current.closest = Math.min(current.closest, remaining);
    attentionByClient.set(name, current);
  });
  const clientAttention = [...attentionByClient.values()].sort(
    (a, b) => b.overdue - a.overdue || b.documents - a.documents || a.closest - b.closest,
  );

  const dateChip = (item) => {
    const date = new Date(`${item.statutory_due_date}T00:00:00`),
      remaining = days(item.statutory_due_date),
      tone = remaining < 0 ? "danger" : remaining <= 7 ? "warning" : "calm";
    return `<span class="date-chip ${tone}"><small>${date.toLocaleDateString("en-GB", { month: "short" })}</small><strong>${date.getDate()}</strong></span>`;
  };
  const dueText = (item) => {
    const remaining = days(item.statutory_due_date);
    return remaining < 0
      ? `${Math.abs(remaining)}d overdue`
      : remaining === 0
        ? "Due today"
        : `Due in ${remaining}d`;
  };
  const priorityRows = priority.length
    ? priority
        .slice(0, 6)
        .map(
          (item) =>
            `<div class="focus-work-row" data-open-work="${item.id}" tabindex="0">${dateChip(item)}<div class="focus-work-main"><strong>${esc(item.clients?.legal_name || "Client")}</strong><span>${esc(item.return_name)} · ${esc(item.period_label)}</span></div><div class="focus-owner"><span>${esc(workOwnerName(item))}</span><small>${esc(dueText(item))}</small></div><span class="status ${statusClass(item.status)}">${esc(statusLabel(item.status))}</span><button type="button" class="row-open" data-open-work-button="${item.id}" aria-label="Open work control">›</button></div>`,
        )
        .join("")
    : '<div class="dashboard-empty"><strong>Your priority queue is clear</strong><span>New and approaching work will appear here automatically.</span></div>';
  const deadlineRows = (upcoming.length ? upcoming : priority)
    .slice(0, 5)
    .map(
      (item) =>
        `<div class="deadline-row" data-open-work="${item.id}" tabindex="0">${dateChip(item)}<div><strong>${esc(item.return_name)}</strong><span>${esc(item.clients?.legal_name || "Client")}</span></div><button type="button" data-open-work-button="${item.id}">${esc(dueText(item))}</button></div>`,
    )
    .join("");
  const attentionRows = clientAttention.length
    ? clientAttention
        .slice(0, 4)
        .map(
          (client) =>
            `<button type="button" class="client-attention-row" data-client-work="${esc(client.name)}"><span class="attention-avatar">${esc(client.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase())}</span><span><strong>${esc(client.name)}</strong><small>${client.overdue ? `${client.overdue} overdue` : "No overdue work"}${client.documents ? ` · ${client.documents} waiting for records` : ""}</small></span><b>›</b></button>`,
        )
        .join("")
    : '<div class="dashboard-empty compact"><strong>No clients need escalation</strong><span>Outstanding records and late work will be surfaced here.</span></div>';

  const adminAction =
    state.profile.role === "admin"
      ? '<button class="secondary-button dashboard-add-client" id="dashboardAddClient">＋ Add client</button>'
      : "";

  login("#cloudRoot").innerHTML =
    `<section class="page dashboard-v5">
      <div class="dashboard-hero">
        <div><span class="dashboard-date">${esc(dateLabel)}</span><h1>${mauritiusGreeting()}, ${esc(firstName)}</h1><p>Here is what needs your attention across the practice.</p></div>
        <div class="dashboard-hero-actions">${adminAction}<button class="primary-button" id="dashboardViewWork">View all work</button></div>
      </div>
      ${state.automationWarning ? `<div class="cloud-error">${esc(state.automationWarning)}</div>` : ""}
      <div class="focus-kpi-grid">
        <button class="focus-kpi danger" data-dashboard-filter="overdue"><span class="kpi-icon">!</span><span><small>Overdue</small><strong>${overdue.length}</strong><em>Requires action now</em></span><b>›</b></button>
        <button class="focus-kpi warning" data-dashboard-filter="due7"><span class="kpi-icon">7</span><span><small>Due within 7 days</small><strong>${due7.length}</strong><em>Upcoming statutory work</em></span><b>›</b></button>
        <button class="focus-kpi client" data-dashboard-filter="documents"><span class="kpi-icon">↗</span><span><small>Waiting on clients</small><strong>${waiting.length}</strong><em>Records still outstanding</em></span><b>›</b></button>
        <button class="focus-kpi review" data-dashboard-filter="review"><span class="kpi-icon">✓</span><span><small>Ready for review</small><strong>${review.length}</strong><em>Needs internal control</em></span><b>›</b></button>
      </div>
      <div class="dashboard-primary-grid">
        <section class="modern-panel priority-work-panel">
          <header><div><span class="panel-kicker">Today&apos;s focus</span><h2>Priority work</h2><p>Only the jobs requiring the closest attention.</p></div><button id="viewAllWork">View all</button></header>
          <div class="focus-work-list">${priorityRows}</div>
        </section>
        <section class="modern-panel deadlines-panel">
          <header><div><span class="panel-kicker">Calendar</span><h2>Upcoming deadlines</h2><p>Your next statutory dates at a glance.</p></div><span class="panel-count">${upcoming.length}</span></header>
          <div class="deadline-list">${deadlineRows || '<div class="dashboard-empty compact"><strong>No upcoming deadlines</strong><span>Nothing is currently scheduled.</span></div>'}</div>
          <button class="panel-footer-action" data-dashboard-filter="upcoming">Open 30-day calendar <span>›</span></button>
        </section>
      </div>
      <div class="dashboard-secondary-grid">
        <section class="modern-panel workflow-panel">
          <header><div><span class="panel-kicker">Practice pulse</span><h2>Workflow completion</h2></div><strong class="completion-number">${completion}%</strong></header>
          <div class="completion-track"><i style="width:${completion}%"></i></div>
          <div class="workflow-stages-mini">
            <button data-dashboard-filter="documents"><span>Documents</span><strong>${waiting.length}</strong></button>
            <button data-dashboard-filter="preparation"><span>Preparation</span><strong>${preparation.length}</strong></button>
            <button data-dashboard-filter="review"><span>Review</span><strong>${review.length}</strong></button>
            <button data-dashboard-filter="ready"><span>Ready to file</span><strong>${ready.length}</strong></button>
            <button data-dashboard-filter="filed"><span>Filed</span><strong>${filed.length}</strong></button>
          </div>
        </section>
        <section class="modern-panel client-attention-panel">
          <header><div><span class="panel-kicker">Client control</span><h2>Clients needing attention</h2></div><span class="panel-count">${clientAttention.length}</span></header>
          <div class="client-attention-list">${attentionRows}</div>
        </section>
      </div>
    </section>`;

  login("#dashboardViewWork").onclick = () => openWorkFilter("open");
  login("#viewAllWork").onclick = () => openWorkFilter("open");
  if (login("#dashboardAddClient"))
    login("#dashboardAddClient").onclick = openClientDrawer;
  document.querySelectorAll("[data-dashboard-filter]").forEach(
    (element) =>
      (element.onclick = () => openWorkFilter(element.dataset.dashboardFilter)),
  );
  document.querySelectorAll("[data-client-work]").forEach(
    (element) =>
      (element.onclick = () => {
        state.workFilter = "open";
        state.workSearch = element.dataset.clientWork || "";
        render("work");
      }),
  );
  bindWorkOpeners();
}
function openWorkFilter(filter) {
  state.workFilter = filter;
  render("work");
}
function clients() {
  const canAdd = state.profile.role === "admin";
  login("#cloudRoot").innerHTML =
    `<section class="page">${pageHead("CLIENT COMPLIANCE REGISTER", "Clients", "One reliable client record drives recurring compliance work.", canAdd ? '<button class="primary-button" id="addClient">+ Add client</button>' : "")}<div class="client-toolbar"><div><strong>${state.clients.length} client${state.clients.length === 1 ? "" : "s"}</strong><span>Active and onboarding records</span></div><div class="client-search"><span>⌕</span><input id="clientSearch" placeholder="Search name, BRN or TAN"></div></div><div class="panel data-panel" id="clientTable">${clientTable(state.clients, canAdd)}</div></section>`;
  document
    .querySelectorAll("#addClient")
    .forEach((b) => (b.onclick = openClientDrawer));
  login("#clientSearch").oninput = (e) => {
    const q = e.target.value.trim().toLowerCase(),
      rows = state.clients.filter((c) =>
        [c.legal_name, c.brn, c.tan, c.email].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        ),
      );
    login("#clientTable").innerHTML = clientTable(rows, canAdd);
  };
}
function clientTable(rows, canAdd) {
  rows = [...rows].sort((a, b) => textCompare(a.legal_name, b.legal_name));
  return rows.length
    ? `<table class="table"><thead><tr><th>Client</th><th>Registration</th><th>Financial year end</th><th>Services</th><th>Status</th></tr></thead><tbody>${rows
        .map((c) => {
          const codes = (c.client_obligations || [])
            .map((o) => o.obligation_rules?.code)
            .filter(Boolean);
          return `<tr><td><strong>${esc(c.legal_name)}</strong><small>${esc(c.entity_type ? entityLabel(c.entity_type) : c.email || "Client")}</small></td><td><strong>${esc(c.brn || "BRN not recorded")}</strong><small>${esc(c.tan ? "TAN " + c.tan : "TAN not recorded")}</small></td><td><strong>${c.year_end_day && c.year_end_month ? esc(`${c.year_end_day} ${monthName(c.year_end_month)}`) : "Not set"}</strong><small>${c.year_end_day && c.year_end_month ? "Used for annual deadlines" : "Complete setup before activation"}</small></td><td><div class="service-chips">${
            codes.length
              ? codes
                  .slice(0, 4)
                  .map((x) => `<span>${esc(x)}</span>`)
                  .join("")
              : "<em>No services selected</em>"
          }${codes.length > 4 ? `<span>+${codes.length - 4}</span>` : ""}</div></td><td><span class="status ${c.status === "active" ? "complete" : "progress"}">${esc(c.status)}</span></td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<div class="cloud-empty"><strong>${state.clients.length ? "No matching clients" : "No clients yet"}</strong><p>${state.clients.length ? "Try a different name or registration number." : "Use the guided setup to record the client and generate applicable filing work."}</p>${canAdd && !state.clients.length ? '<button class="primary-button empty-action" id="addClient">+ Add first client</button>' : ""}</div>`;
}
const monthName = (m) =>
  [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][Number(m)] || "—";
const entityLabel = (v) =>
  ({
    company: "Company",
    individual: "Individual",
    sole_trader: "Sole trader",
    societe: "Société / partnership",
    trust: "Trust",
    foundation: "Foundation",
    association: "Association / NGO",
    other: "Other",
  })[v] || v;
function workRow(x) {
  const remaining = days(x.statutory_due_date),
    owner = workOwnerName(x),
    urgency =
      remaining < 0
        ? `${Math.abs(remaining)} days overdue`
        : remaining === 0
          ? "Due today"
          : `Due in ${remaining} days`;
  return `<tr class="work-row" data-open-work="${x.id}" tabindex="0" aria-label="Open ${esc(x.return_name)} for ${esc(x.clients?.legal_name || "client")}"><td><strong>${esc(x.clients?.legal_name || "Client")}</strong><small>${esc(x.return_name)} · ${esc(x.period_label)}</small></td><td><strong>${fmt(x.statutory_due_date)}</strong><small class="${remaining < 0 ? "text-danger" : ""}">${urgency}</small></td><td class="work-owner"><strong>${esc(owner)}</strong><small>${owner === "Unassigned" ? "Assign responsibility" : "Assigned"}</small></td><td><span class="status ${statusClass(x.status)}">${esc(statusLabel(x.status))}</span><div class="mini-progress"><i style="width:${workProgress(x.status)}%"></i></div></td><td><button type="button" class="mini-button open-work-button" data-open-work-button="${x.id}">Open control</button></td></tr>`;
}
function filteredWorkRows() {
  let rows = [...state.work];
  if (state.workFilter === "open")
    rows = rows.filter((x) => x.status !== "filed");
  if (state.workFilter === "overdue")
    rows = rows.filter(
      (x) => x.status !== "filed" && days(x.statutory_due_date) < 0,
    );
  if (state.workFilter === "due7")
    rows = rows.filter(
      (x) =>
        x.status !== "filed" &&
        days(x.statutory_due_date) >= 0 &&
        days(x.statutory_due_date) <= 7,
    );
  if (state.workFilter === "upcoming")
    rows = rows.filter(
      (x) =>
        x.status !== "filed" &&
        days(x.statutory_due_date) >= 0 &&
        days(x.statutory_due_date) <= 30,
    );
  if (state.workFilter === "documents")
    rows = rows.filter((x) => x.status === "documents_pending");
  if (state.workFilter === "preparation")
    rows = rows.filter((x) =>
      ["not_started", "in_progress"].includes(x.status),
    );
  if (state.workFilter === "review")
    rows = rows.filter((x) => x.status === "review");
  if (state.workFilter === "ready")
    rows = rows.filter((x) => x.status === "ready_to_file");
  if (state.workFilter === "unassigned")
    rows = rows.filter(
      (x) => x.status !== "filed" && !(x.assigned_to || x.clients?.assigned_to),
    );
  if (state.workFilter === "filed")
    rows = rows.filter((x) => x.status === "filed");
  const query = state.workSearch.trim().toLowerCase();
  if (query) {
    rows = rows.filter((x) =>
      [
        x.clients?.legal_name,
        x.clients?.brn,
        x.return_name,
        x.return_code,
        x.period_label,
        workOwnerName(x),
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      ),
    );
  }
  return rows.sort(compareWorkItems);
}
function work() {
  const rows = filteredWorkRows(),
    add =
      state.profile.role === "admin"
        ? '<button class="primary-button" id="addManualWork">+ Create job</button>'
        : "";
  login("#cloudRoot").innerHTML =
    `<section class="page work-control-page">${pageHead("ACCOUNTANT WORK CONTROL", "Work control", "Every filing moves through client records, preparation, review, authorisation and completion.", add)}<div class="work-toolbar"><div class="priority-bar">${[
      ["open", "Open"],
      ["overdue", "Overdue"],
      ["due7", "Due in 7 days"],
      ["documents", "Waiting client"],
      ["preparation", "Preparation"],
      ["review", "Review"],
      ["ready", "Ready to file"],
      ["unassigned", "Unassigned"],
      ["filed", "Filed"],
      ["all", "All"],
    ]
      .map(
        ([k, v]) =>
          `<button data-work-filter="${k}" class="${state.workFilter === k ? "active" : ""}">${v}</button>`,
      )
      .join(
        "",
      )}</div><label class="work-search"><span>⌕</span><input id="workSearch" value="${esc(state.workSearch)}" placeholder="Search client, BRN, return or owner"></label></div><div class="work-count"><strong>${rows.length} job${rows.length === 1 ? "" : "s"}</strong><span>${state.workFilter === "all" ? "in the full register" : `in ${state.workFilter.replaceAll("_", " ")} control`}</span></div><div class="panel data-panel work-register">${rows.length ? `<table class="table"><thead><tr><th>Client / filing</th><th>Statutory deadline</th><th>Owner</th><th>Control stage</th><th></th></tr></thead><tbody>${rows.map(workRow).join("")}</tbody></table>` : `<div class="cloud-empty"><strong>No work in this view</strong><p>Change the control filter or search for another client.</p></div>`}</div></section>`;
  document.querySelectorAll("[data-work-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.workFilter = b.dataset.workFilter;
        work();
      }),
  );
  login("#workSearch").oninput = (event) => {
    state.workSearch = event.target.value;
    work();
    const input = login("#workSearch");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };
  if (login("#addManualWork"))
    login("#addManualWork").onclick = openManualWorkDrawer;
  bindWorkOpeners();
}
function bindWorkOpeners() {
  document.querySelectorAll("[data-open-work]").forEach((row) => {
    row.onclick = (event) => {
      if (event.target.closest("button,select,a,input")) return;
      openWorkControlDrawer(row.dataset.openWork);
    };
    row.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openWorkControlDrawer(row.dataset.openWork);
      }
    };
  });
  document.querySelectorAll("[data-open-work-button]").forEach(
    (button) =>
      (button.onclick = (event) => {
        event.stopPropagation();
        openWorkControlDrawer(button.dataset.openWorkButton);
      }),
  );
}
function controlStageMarkup(item) {
  const active = workStageIndex(item.status);
  return WORKFLOW_STAGES.map((stage, index) => {
    const complete = index < active || item.status === "filed",
      current = index === active && item.status !== "filed";
    return `<div class="control-stage ${complete ? "complete" : ""} ${current ? "current" : ""}"><i>${complete ? "✓" : index + 1}</i><span>${stage.label}</span></div>`;
  }).join("");
}
function openWorkControlDrawer(id) {
  const item = state.work.find((x) => String(x.id) === String(id));
  if (!item) return;
  const existing = document.querySelector(".work-control-drawer");
  if (existing) existing.remove();
  const remaining = days(item.statutory_due_date),
    statuses = allowedWorkStatuses(item),
    canEdit = statuses.length > 0,
    owner = workOwnerName(item),
    wrap = document.createElement("div");
  wrap.className = "drawer work-control-drawer";
  wrap.innerHTML = `<div class="drawer-card work-control-card"><div class="drawer-head"><div><span class="eyebrow">CONTROLLED CLIENT JOB</span><h2>${esc(item.clients?.legal_name || "Client")}</h2><p>${esc(item.return_name)} · ${esc(item.period_label)}</p></div><button class="drawer-close" type="button" aria-label="Close">×</button></div><div class="deadline-banner ${remaining < 0 ? "overdue" : remaining <= 7 ? "urgent" : ""}"><div><span>Statutory deadline</span><strong>${fmt(item.statutory_due_date)}</strong></div><b>${remaining < 0 ? `${Math.abs(remaining)} days overdue` : remaining === 0 ? "Due today" : `${remaining} days remaining`}</b></div><div class="control-progress">${controlStageMarkup(item)}</div><section class="control-section"><div class="section-title"><div><span>Current control stage</span><h3>${esc(statusLabel(item.status))}</h3></div><span class="status ${statusClass(item.status)}">${workProgress(item.status)}%</span></div><div class="next-action"><span>Required next action</span><strong>${esc(nextAction(item))}</strong></div></section><section class="control-section"><div class="section-title"><div><span>Job information</span><h3>Responsibility & deadlines</h3></div></div><div class="control-facts"><div><span>Work owner</span><strong>${esc(owner)}</strong></div><div><span>BRN</span><strong>${esc(item.clients?.brn || "Not recorded")}</strong></div><div><span>Internal target</span><strong>${fmt(item.internal_due_date)}</strong></div><div><span>Return code</span><strong>${esc(item.return_code || "—")}</strong></div></div></section><section class="control-section"><div class="section-title"><div><span>Update workflow</span><h3>Move the job to its verified stage</h3></div></div>${canEdit ? `<div class="status-choice-grid">${statuses.map((status) => `<button type="button" data-control-status="${status}" class="status-choice ${item.status === status ? "selected" : ""}" ${item.status === status ? "disabled" : ""}><span class="status ${statusClass(status)}">${statusLabel(status)}</span><small>${status === "filed" ? "Final controlled completion" : status === "ready_to_file" ? "Reviewer authorisation required" : "Update work stage"}</small></button>`).join("")}</div>` : '<div class="security-note">Your access is read-only. An authorised preparer, reviewer or administrator must update this work.</div>'}<div class="form-message" id="workControlMessage"></div></section><div class="control-rule"><strong>Completion control</strong><span>${roleCanFinalise() ? "You may authorise ready-to-file and filed stages. Mark Filed only after submission is complete." : "Preparers may submit work for review. Only a reviewer or administrator may authorise filing completion."}</span></div>${state.profile?.role === "admin" ? `<div class="job-admin-actions"><div><strong>Job administration</strong><span>${canDeleteWork(item) ? "This open one-off job can be permanently deleted by an administrator." : item.work_kind === "one_off" && item.status === "filed" ? "Filed jobs are retained as audit evidence and cannot be deleted." : "Automatically generated statutory and recurring jobs are protected from individual deletion."}</span></div>${canDeleteWork(item) ? `<button type="button" class="mini-button danger" id="deleteWorkJob">Delete job</button>` : ""}</div>` : ""}</div>`;
  document.body.appendChild(wrap);
  wrap
    .querySelectorAll(".drawer-close")
    .forEach((button) => (button.onclick = () => wrap.remove()));
  wrap.onclick = (event) => {
    if (event.target === wrap) wrap.remove();
  };
  wrap.querySelectorAll("[data-control-status]").forEach(
    (button) =>
      (button.onclick = async () => {
        const status = button.dataset.controlStatus,
          message = wrap.querySelector("#workControlMessage");
        if (status === "filed" && item.status !== "ready_to_file") {
          message.textContent =
            "Move the job to Ready to file after review before recording it as Filed.";
          return;
        }
        message.textContent = "Saving the controlled stage…";
        wrap
          .querySelectorAll("[data-control-status]")
          .forEach((x) => (x.disabled = true));
        const saved = await updateWorkStatus(item.id, status, false);
        if (!saved) {
          message.textContent =
            "The stage could not be saved. No change was made.";
          wrap
            .querySelectorAll("[data-control-status]")
            .forEach((x) => (x.disabled = false));
          return;
        }
        wrap.remove();
        openWorkControlDrawer(item.id);
      }),
  );

const deleteButton = wrap.querySelector("#deleteWorkJob");
if (deleteButton) {
  deleteButton.onclick = () => deleteWorkItem(item.id, wrap);
}

}

async function deleteWorkItem(id, drawer) {
  const item = state.work.find((workItem) => String(workItem.id) === String(id));
  if (!item || !canDeleteWork(item)) return;
  const confirmed = confirm(
    `Permanently delete “${item.return_name}” for ${item.clients?.legal_name || "this client"}? This cannot be undone.`,
  );
  if (!confirmed) return;
  const button = drawer?.querySelector("#deleteWorkJob"),
    message = drawer?.querySelector("#workControlMessage");
  if (button) button.disabled = true;
  if (message) message.textContent = "Deleting the one-off job…";
  const { error } = await sb
    .from("work_items")
    .delete()
    .eq("id", id)
    .eq("work_kind", "one_off")
    .neq("status", "filed");
  if (error) {
    if (message)
      message.textContent =
        "Deletion was blocked. Only administrators with the database delete policy may remove an open one-off job.";
    if (button) button.disabled = false;
    return;
  }
  await loadPracticeData();
  drawer?.remove();
  work();
}

async function updateWorkStatus(id, status, rerender = true) {
  const item = state.work.find((x) => String(x.id) === String(id));
  if (!item) return false;
  if (!allowedWorkStatuses(item).includes(status)) return false;
  if (["ready_to_file", "filed"].includes(status) && !roleCanFinalise())
    return false;
  if (status === "filed" && item.status !== "ready_to_file") return false;
  const payload = {
    status,
    filed_at: status === "filed" ? new Date().toISOString() : null,
  };
  const { error } = await sb.from("work_items").update(payload).eq("id", id);
  if (error) return false;
  await loadPracticeData();
  if (rerender) work();
  return true;
}

function openClientDrawer() {
  if (state.profile?.role !== "admin") return;
  const automatic = state.rules.filter((r) => r.due_rule?.type !== "manual"),
    manual = state.rules.filter((r) => r.due_rule?.type === "manual"),
    staff = state.users.filter((u) => u.active && u.role !== "readonly"),
    months = Array.from(
      { length: 12 },
      (_, i) =>
        `<option value="${i + 1}" ${i === 5 ? "selected" : ""}>${monthName(i + 1)}</option>`,
    ).join("");
  const wrap = document.createElement("div");
  wrap.className = "drawer";
  wrap.innerHTML = `<div class="drawer-card client-wizard"><div class="drawer-head"><div><span class="eyebrow">GUIDED CLIENT SETUP</span><h2>Add a client</h2><p>Four short steps. Nothing is saved until you review and confirm.</p></div><button class="drawer-close" type="button" aria-label="Close">×</button></div><div class="wizard-steps">${["Client", "Tax profile", "Services", "Review"].map((x, i) => `<button type="button" data-step-tab="${i + 1}" class="${i === 0 ? "active" : ""}"><span>${i + 1}</span>${x}</button>`).join("")}</div><form id="clientForm" novalidate><section class="wizard-page active" data-step="1"><div class="section-intro"><strong>Who is the client?</strong><span>Business structure controls which information is required.</span></div><div class="entity-grid">${[
    ["company", "Company", "Incorporated entity"],
    ["individual", "Individual", "Personal taxpayer"],
    ["sole_trader", "Sole trader", "Individual trading"],
    ["societe", "Société", "Partnership / société"],
    ["trust", "Trust", "Trust arrangement"],
    ["foundation", "Foundation", "Foundation entity"],
    ["association", "Association / NGO", "Non-profit body"],
    ["other", "Other", "Another legal form"],
  ]
    .map(
      ([v, n, s]) =>
        `<label class="entity-card"><input type="radio" name="entity_type" value="${v}" ${v === "company" ? "checked" : ""}><span><strong>${n}</strong><small>${s}</small></span></label>`,
    )
    .join(
      "",
    )}</div><div class="form-grid"><div class="field full"><label>Legal or registered name *</label><input name="legal_name" required maxlength="180" autocomplete="organization"><small>Use the name shown on official registration documents.</small></div><div class="field"><label>Primary contact name</label><input name="primary_contact_name" maxlength="120" autocomplete="name"></div><div class="field"><label>Contact email</label><input name="email" type="email" maxlength="180" autocomplete="email"></div><div class="field"><label>Phone</label><input name="phone" type="tel" maxlength="30" autocomplete="tel" placeholder="e.g. +230 5xxx xxxx"></div><div class="field"><label>Client stage</label><select name="status"><option value="onboarding" selected>Onboarding — details being confirmed</option><option value="active">Active — generate work immediately</option></select></div></div></section><section class="wizard-page" data-step="2"><div class="section-intro"><strong>Mauritius registration & accounting</strong><span>Enter identifiers carefully. They are used to distinguish clients and prepare filings.</span></div><div class="form-grid"><div class="field"><label>Business Registration Number (BRN)</label><input name="brn" maxlength="40" autocomplete="off"><small>Required for registered businesses.</small></div><div class="field"><label>MRA Tax Account Number (TAN)</label><input name="tan" maxlength="40" autocomplete="off"><small>Required when TGC handles MRA returns.</small></div><div class="field"><label>Employer Registration Number (ERN)</label><input name="ern" maxlength="40" autocomplete="off"><small>Required when payroll services apply.</small></div><div class="field"><label>Assigned preparer / manager</label><select name="assigned_to"><option value="">Assign later</option>${staff.map((u) => `<option value="${u.id}">${esc(u.full_name)}</option>`).join("")}</select></div><div class="field"><label>Financial year-end day</label><select name="year_end_day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${i === 29 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></div><div class="field"><label>Financial year-end month</label><select name="year_end_month">${months}</select></div></div><div class="inline-check" id="identifierCheck"><span>✓</span><div><strong>Duplicate protection</strong><small>BRN and TAN are checked against existing client records before saving.</small></div></div></section><section class="wizard-page" data-step="3"><div class="section-intro"><strong>Which services does TGC provide?</strong><span>Select the work we are responsible for. Recurring deadlines are generated automatically.</span></div><div class="service-presets"><button type="button" data-preset="company">Company compliance</button><button type="button" data-preset="payroll">Payroll employer</button><button type="button" data-preset="clear">Clear selection</button></div><div class="rule-options friendly-rules">${automatic.map((r) => `<label class="rule-option"><input type="checkbox" name="rule" value="${r.id}" data-code="${esc(r.code)}"><span><strong>${esc(r.name)}</strong><small>${esc(r.code)} · ${esc(r.authority)} · ${esc(r.frequency)}</small></span><i>Automatic</i></label>`).join("")}</div>${manual.length ? `<details class="other-returns"><summary>Special or other returns</summary><p>Choose these only when they apply. Their actual due date is entered manually for each filing.</p><div class="rule-options">${manual.map((r) => `<label class="rule-option"><input type="checkbox" name="rule" value="${r.id}" data-code="${esc(r.code)}"><span><strong>${esc(r.name)}</strong><small>${esc(r.code)} · ${esc(r.category)}</small></span></label>`).join("")}</div></details>` : ""}</section><section class="wizard-page" data-step="4"><div class="section-intro"><strong>Review before saving</strong><span>Confirm the official identifiers and services. These choices drive the compliance calendar.</span></div><div id="clientReview" class="review-card"></div><label class="confirm-box"><input type="checkbox" name="confirmed"><span>I have checked the client identity, accounting year end and applicable filing obligations.</span></label><div class="security-note">Saving creates an auditable client record. Active clients generate recurring work immediately; onboarding clients remain clearly marked while details are completed.</div></section><div class="form-message" id="clientMessage" role="alert"></div><div class="form-actions wizard-actions"><button type="button" class="mini-button" id="wizardBack">Back</button><button type="button" class="primary-button" id="wizardNext">Continue</button><button class="primary-button hidden" id="wizardSave" type="submit">Save client & generate work</button></div></form></div>`;
  document.body.appendChild(wrap);
  let step = 1;
  const show = (n) => {
    step = n;
    wrap
      .querySelectorAll(".wizard-page")
      .forEach((p) =>
        p.classList.toggle("active", Number(p.dataset.step) === n),
      );
    wrap
      .querySelectorAll("[data-step-tab]")
      .forEach((b) =>
        b.classList.toggle("active", Number(b.dataset.stepTab) === n),
      );
    wrap.querySelector("#wizardBack").style.visibility =
      n === 1 ? "hidden" : "visible";
    wrap.querySelector("#wizardNext").classList.toggle("hidden", n === 4);
    wrap.querySelector("#wizardSave").classList.toggle("hidden", n !== 4);
    if (n === 4) renderClientReview(wrap);
  };
  const validate = (n) => validateClientStep(wrap, n);
  wrap
    .querySelectorAll(".drawer-close")
    .forEach((x) => (x.onclick = () => wrap.remove()));
  wrap.onclick = (e) => {
    if (e.target === wrap) wrap.remove();
  };
  wrap.querySelector("#wizardBack").onclick = () => show(Math.max(1, step - 1));
  wrap.querySelector("#wizardNext").onclick = () => {
    if (validate(step)) show(Math.min(4, step + 1));
  };
  wrap.querySelectorAll("[data-step-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        const target = Number(b.dataset.stepTab);
        if (target < step || validate(step)) show(target);
      }),
  );
  wrap
    .querySelectorAll("[data-preset]")
    .forEach(
      (b) => (b.onclick = () => applyClientPreset(wrap, b.dataset.preset)),
    );
  wrap.querySelector("#clientForm").onsubmit = (e) => saveClient(e, wrap);
  show(1);
}
function validateClientStep(wrap, step) {
  const form = wrap.querySelector("#clientForm"),
    message = wrap.querySelector("#clientMessage");
  message.textContent = "";
  if (step === 1) {
    const name = form.elements.legal_name.value.trim(),
      email = form.elements.email.value.trim();
    if (!name) {
      message.textContent = "Enter the client’s legal or registered name.";
      form.elements.legal_name.focus();
      return false;
    }
    if (email && !form.elements.email.checkValidity()) {
      message.textContent = "Enter a valid contact email address.";
      form.elements.email.focus();
      return false;
    }
  }
  if (step === 2) {
    const day = Number(form.elements.year_end_day.value),
      month = Number(form.elements.year_end_month.value),
      max = new Date(2024, month, 0).getDate();
    if (day > max) {
      message.textContent = `${monthName(month)} does not have ${day} days. Choose the correct financial year end.`;
      return false;
    }
  }
  if (
    step === 3 &&
    !form.querySelectorAll('input[name="rule"]:checked').length
  ) {
    message.textContent =
      "Select at least one service, or keep the client in onboarding and add services later.";
    if (form.elements.status.value === "active") return false;
  }
  return true;
}
function applyClientPreset(wrap, preset) {
  const checks = [...wrap.querySelectorAll('input[name="rule"]')];
  if (preset === "clear") {
    checks.forEach((x) => (x.checked = false));
    return;
  }
  const patterns =
    preset === "payroll"
      ? ["PAYE", "CSG", "NSF", "PRGF"]
      : ["CTAX", "ANNUAL", "CBRD"];
  checks.forEach((x) => {
    if (patterns.some((p) => String(x.dataset.code).toUpperCase().includes(p)))
      x.checked = true;
  });
}
function renderClientReview(wrap) {
  const f = wrap.querySelector("#clientForm"),
    fd = new FormData(f),
    rules = fd
      .getAll("rule")
      .map((id) => state.rules.find((r) => r.id === id))
      .filter(Boolean),
    assigned = state.users.find((u) => u.id === fd.get("assigned_to"));
  wrap.querySelector("#clientReview").innerHTML =
    `<div><span>Client</span><strong>${esc(fd.get("legal_name"))}</strong><small>${esc(entityLabel(fd.get("entity_type")))} · ${esc(fd.get("status"))}</small></div><div><span>Registration</span><strong>${esc(fd.get("brn") || "BRN not recorded")}</strong><small>${esc(fd.get("tan") ? "TAN " + fd.get("tan") : "TAN not recorded")}${fd.get("ern") ? ` · ERN ${esc(fd.get("ern"))}` : ""}</small></div><div><span>Accounting</span><strong>${esc(fd.get("year_end_day"))} ${esc(monthName(fd.get("year_end_month")))}</strong><small>${esc(assigned?.full_name || "Staff not yet assigned")}</small></div><div class="review-services"><span>Services that will drive work</span>${rules.length ? rules.map((r) => `<p><strong>${esc(r.code)}</strong> ${esc(r.name)} <small>${r.due_rule?.type === "manual" ? "Manual due date" : "Automatic deadline"}</small></p>`).join("") : "<p>No services selected — onboarding record only</p>"}</div>`;
}
async function saveClient(e, wrap) {
  e.preventDefault();
  const form = e.currentTarget,
    button = form.querySelector("#wizardSave"),
    message = form.querySelector("#clientMessage"),
    fd = new FormData(form),
    ruleIds = fd.getAll("rule"),
    assigned = String(fd.get("assigned_to") || "") || null,
    nullable = (v) => String(v || "").trim() || null;
  if (!fd.get("confirmed")) {
    message.textContent =
      "Confirm that you reviewed the client information before saving.";
    return;
  }
  button.disabled = true;
  message.textContent = "Checking identifiers…";
  const brn = nullable(fd.get("brn")),
    tan = nullable(fd.get("tan"));
  for (const [label, value] of [
    ["BRN", brn],
    ["TAN", tan],
  ]) {
    if (!value) continue;
    const { data, error } = await sb
      .from("clients")
      .select("id,legal_name")
      .eq(label.toLowerCase(), value)
      .limit(1);
    if (error) {
      message.textContent =
        "The duplicate check could not be completed. Nothing was saved.";
      button.disabled = false;
      return;
    }
    if (data?.length) {
      message.textContent = `A client already uses this ${label}: ${data[0].legal_name}. Nothing was saved.`;
      button.disabled = false;
      return;
    }
  }
  message.textContent = "Saving the verified client profile…";
  const payload = {
    legal_name: String(fd.get("legal_name")).trim(),
    entity_type: fd.get("entity_type"),
    primary_contact_name: nullable(fd.get("primary_contact_name")),
    phone: nullable(fd.get("phone")),
    brn,
    tan,
    ern: nullable(fd.get("ern")),
    email: nullable(fd.get("email")),
    year_end_month: Number(fd.get("year_end_month")) || null,
    year_end_day: Number(fd.get("year_end_day")) || null,
    assigned_to: assigned,
    status: fd.get("status"),
    created_by: state.profile.id,
    accounts_enabled: false,
    payroll_enabled: false,
    tds_enabled: false,
    prgf_enabled: false,
    secretarial_enabled: false,
    vat_frequency: "none",
  };
  const { data: client, error } = await sb
    .from("clients")
    .insert(payload)
    .select()
    .single();
  if (error) {
    message.textContent =
      error.code === "23505"
        ? "That BRN is already registered. Nothing was saved."
        : error.code === "42703"
          ? "The client-onboarding database update has not been installed yet. Nothing was saved."
          : "Client could not be saved. Nothing was changed.";
    button.disabled = false;
    return;
  }
  if (ruleIds.length) {
    const { error: ruleError } = await sb.from("client_obligations").insert(
      ruleIds.map((rule_id) => ({
        client_id: client.id,
        rule_id,
        assigned_to: assigned,
      })),
    );
    if (ruleError) {
      await sb.from("clients").delete().eq("id", client.id);
      message.textContent =
        "Nothing was saved because the service setup failed. Please try again.";
      button.disabled = false;
      return;
    }
  }
  const generated = await sb.rpc("generate_upcoming_work", {
    p_months_ahead: 12,
  });
  if (generated.error) {
    message.textContent =
      "Client saved, but deadlines were not generated. Keep this client in onboarding and contact the administrator.";
    button.disabled = false;
    return;
  }
  await loadPracticeData();
  wrap.remove();
  clients();
}


function openManualWorkDrawer() {
  if (state.profile?.role !== "admin") return;
  const manual = state.rules
      .filter((rule) => rule.due_rule?.type === "manual")
      .sort((a, b) => textCompare(a.name, b.name)),
    clients = [...state.clients].sort((a, b) => textCompare(a.legal_name, b.legal_name)),
    wrap = document.createElement("div");
  wrap.className = "drawer";
  wrap.innerHTML = `<div class="drawer-card"><div class="drawer-head"><div><span class="eyebrow">CREATE CLIENT JOB</span><h2>Create a job</h2><p>Create either a special filing or another one-off assignment.</p></div><button class="drawer-close" type="button">×</button></div><form id="manualWorkForm"><div class="form-grid"><div class="field full"><label>Job purpose</label><select name="job_purpose" id="jobPurpose" required><option value="special_filing">Special filing</option><option value="one_off_job">Other one-off job</option></select><small class="field-help">Special filings use a controlled filing type. Other one-off jobs use a clear custom job title.</small></div><div class="field full"><label>Client</label><select name="client_id" required><option value="">Choose client</option>${clients.map((client) => `<option value="${client.id}">${esc(client.legal_name)}</option>`).join("")}</select></div><div class="field full conditional-job-field" id="specialFilingField"><label>Filing type</label><select name="rule_id" id="jobRule"><option value="">Choose filing type</option>${manual.map((rule) => `<option value="${rule.id}">${esc(rule.code)} — ${esc(rule.name)}</option>`).join("")}</select></div><div class="field full conditional-job-field hidden" id="oneOffTitleField"><label>Job title</label><input name="job_title" id="oneOffJobTitle" maxlength="160" placeholder="e.g. Reconstruct accounting records"></div><div class="field"><label id="jobDescriptionLabel">Period or filing description</label><input name="period_label" placeholder="e.g. Amended VAT return — May 2026" required maxlength="180"></div><div class="field"><label>Due date</label><input name="due_date" type="date" required></div></div><div class="form-message"></div><div class="form-actions drawer-form-actions"><button type="button" class="mini-button drawer-close">Cancel</button><button class="primary-button" type="submit">Create job</button></div></form></div>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector("#manualWorkForm"),
    purposeField = wrap.querySelector("#jobPurpose"),
    specialField = wrap.querySelector("#specialFilingField"),
    oneOffField = wrap.querySelector("#oneOffTitleField"),
    ruleField = wrap.querySelector("#jobRule"),
    titleField = wrap.querySelector("#oneOffJobTitle"),
    descriptionLabel = wrap.querySelector("#jobDescriptionLabel");
  const syncPurposeFields = () => {
    const special = purposeField.value === "special_filing";
    specialField.classList.toggle("hidden", !special);
    oneOffField.classList.toggle("hidden", special);
    ruleField.required = special;
    titleField.required = !special;
    descriptionLabel.textContent = special
      ? "Period or filing description"
      : "Job description or period";
  };
  syncPurposeFields();
  purposeField.onchange = syncPurposeFields;
  wrap
    .querySelectorAll(".drawer-close")
    .forEach((button) => (button.onclick = () => wrap.remove()));
  form.onsubmit = async (event) => {
    event.preventDefault();
    const fd = new FormData(form),
      purpose = String(fd.get("job_purpose") || "one_off_job"),
      special = purpose === "special_filing",
      rule = special
        ? state.rules.find((item) => String(item.id) === String(fd.get("rule_id")))
        : null,
      title = String(fd.get("job_title") || "").trim(),
      due = String(fd.get("due_date") || ""),
      label = String(fd.get("period_label") || "").trim(),
      message = form.querySelector(".form-message"),
      submit = form.querySelector('[type="submit"]');
    if (special && !rule) {
      message.textContent = "Choose a valid filing type.";
      return;
    }
    if (!special && !title) {
      message.textContent = "Enter a clear title for the one-off job.";
      titleField.focus();
      return;
    }
    const returnCode = special ? rule.code : "ONEOFF",
      returnName = special ? `Special filing — ${rule.name}` : title,
      keySource = `${returnCode}-${due}-${returnName}-${label}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      periodKey = `${special ? "special-filing" : "one-off"}-${keySource}`;
    submit.disabled = true;
    message.textContent = "Creating the job…";
    const { error } = await sb.from("work_items").insert({
      client_id: fd.get("client_id"),
      return_code: returnCode,
      return_name: returnName,
      work_kind: "one_off",
      period_key: periodKey,
      period_label: label,
      statutory_due_date: due,
      internal_due_date: due,
      created_by: state.profile.id,
    });
    if (error) {
      message.textContent =
        "This job could not be created. Check whether the same job already exists.";
      submit.disabled = false;
      return;
    }
    await loadPracticeData();
    wrap.remove();
    work();
  };
}


function users() {
  const rows = [...state.users].sort(
    (a, b) =>
      Number(Boolean(b.active)) - Number(Boolean(a.active)) ||
      (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99) ||
      textCompare(a.full_name, b.full_name),
  );
  const roleGuide = `<div class="role-guide-grid"><div class="role-guide-card"><strong>Administrator</strong><span>Creates clients and jobs, manages users, changes roles and may delete eligible one-off jobs.</span></div><div class="role-guide-card"><strong>Reviewer</strong><span>Reviews work and may authorise Ready to file and Filed. Cannot manage users or delete jobs.</span></div><div class="role-guide-card"><strong>Preparer</strong><span>Normal staff access. Updates assigned jobs up to Review. Cannot finalise, create clients or manage users.</span></div><div class="role-guide-card"><strong>Read only</strong><span>Can view authorised records but cannot change workflow or practice data.</span></div></div>`;
  login("#cloudRoot").innerHTML =
    `<section class="page">${pageHead("ACCESS CONTROL", "Team", "Invite staff, test normal-user access and keep every role limited to what it needs.", '<button class="primary-button" id="inviteUser">+ Invite user</button>')}<div class="user-test-banner"><div><strong>Recommended normal-user test</strong><span>Invite a second email address as a Preparer. Then sign in separately and confirm that Team, Create and deletion controls are hidden.</span></div><button class="secondary-button" id="inviteTestPreparer" type="button">Invite test preparer</button></div>${roleGuide}<div class="panel data-panel"><table class="table"><thead><tr><th>User</th><th>Role</th><th>Access</th><th>Change</th></tr></thead><tbody>${rows.map((user) => `<tr><td><strong>${esc(user.full_name)}</strong><small>${esc(user.email || "")}</small></td><td><span class="role-pill">${esc(user.role)}</span></td><td><span class="status ${user.active ? "complete" : "overdue"}">${user.active ? "Active" : "Disabled"}</span></td><td><select data-user-role="${user.id}" ${user.id === state.profile.id ? "disabled" : ""}>${["admin", "reviewer", "preparer", "readonly"].map((role) => `<option value="${role}" ${user.role === role ? "selected" : ""}>${role}</option>`).join("")}</select> <button class="mini-button ${user.active ? "danger" : ""}" data-user-active="${user.id}" ${user.id === state.profile.id ? "disabled" : ""}>${user.active ? "Disable" : "Enable"}</button></td></tr>`).join("")}</tbody></table></div></section>`;
  login("#inviteUser").onclick = () => openInviteDrawer("preparer");
  login("#inviteTestPreparer").onclick = () => openInviteDrawer("preparer");
  document
    .querySelectorAll("[data-user-role]")
    .forEach(
      (select) =>
        (select.onchange = () =>
          updateUser(select.dataset.userRole, { role: select.value })),
    );
  document.querySelectorAll("[data-user-active]").forEach(
    (button) =>
      (button.onclick = () => {
        const user = state.users.find(
          (item) => String(item.id) === String(button.dataset.userActive),
        );
        if (user) updateUser(user.id, { active: !user.active });
      }),
  );
}

async function updateUser(id, changes) {
  const { error } = await sb.from("profiles").update(changes).eq("id", id);
  if (error) {
    alert("Access could not be changed.");
    return;
  }
  await loadPracticeData();
  users();
}

function openInviteDrawer(defaultRole = "preparer") {
  const wrap = document.createElement("div");
  wrap.className = "drawer";
  wrap.innerHTML = `<div class="drawer-card"><div class="drawer-head"><div><span class="eyebrow">STAFF ACCESS</span><h2>Invite a user</h2><p>Use a separate email address the user can access. Supabase sends the secure invitation.</p></div><button class="drawer-close" type="button">×</button></div><form id="inviteForm"><div class="form-grid"><div class="field full"><label>Full name</label><input name="full_name" required maxlength="120"></div><div class="field full"><label>Work email</label><input name="email" type="email" required maxlength="180"></div><div class="field full"><label>Role</label><select name="role"><option value="preparer">Preparer — normal staff user</option><option value="reviewer">Reviewer — review and finalise</option><option value="readonly">Read only — view without changes</option><option value="admin">Administrator — full practice control</option></select></div></div><div class="security-note">For the first permissions test, use Preparer. Only administrators can invite users, change roles, disable access or delete eligible one-off jobs.</div><div class="form-message"></div><div class="form-actions drawer-form-actions"><button type="button" class="mini-button drawer-close">Cancel</button><button class="primary-button" type="submit">Send invitation</button></div></form></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[name="role"]').value = defaultRole;
  wrap
    .querySelectorAll(".drawer-close")
    .forEach((button) => (button.onclick = () => wrap.remove()));
  wrap.querySelector("#inviteForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      button = form.querySelector('[type="submit"]'),
      message = form.querySelector(".form-message"),
      fd = new FormData(form);
    button.disabled = true;
    message.textContent = "Sending secure invitation…";
    const { data, error } = await sb.functions.invoke("invite-user", {
      body: {
        email: String(fd.get("email")).trim().toLowerCase(),
        full_name: String(fd.get("full_name")).trim(),
        role: fd.get("role"),
      },
    });
    if (error || !data?.ok) {
      message.textContent =
        data?.error ||
        "The invitation could not be sent. Confirm that the invite-user Edge Function is deployed.";
      button.disabled = false;
      return;
    }
    await loadPracticeData();
    wrap.remove();
    users();
  };
}

function documents() {
  login("#cloudRoot").innerHTML =
    `<section class="page">${pageHead("SECURE DOCUMENT CONTROL", "Documents", "Document storage will be enabled after access testing.")}<div class="panel cloud-empty"><strong>Protected module reserved</strong><p>No real client files will be uploaded during the test phase.</p></div></section>`;
}
function billing() {
  login("#cloudRoot").innerHTML =
    `<section class="page">${pageHead("PRACTICE FINANCE", "Billing", "Billing integration follows compliance-engine validation.")}<div class="panel cloud-empty"><strong>Module reserved for phase two</strong><p>The live test focuses first on client access, deadlines and shared work.</p></div></section>`;
}

function settings() {
  const isAdmin = state.profile?.role === "admin";
  const verified = isAdmin
    ? state.rules
        .filter((r) => r.last_verified_on)
        .sort((a, b) =>
          String(a.last_verified_on).localeCompare(String(b.last_verified_on)),
        )
    : [];
  const accountPanel = `<section class="panel settings-account-panel"><div class="panel-head"><div><span class="panel-kicker">Your account · Build 5.10</span><h3>Account & security</h3></div></div><div class="panel-body settings-account-body"><div><strong>${esc(state.profile?.full_name || "TGC user")}</strong><p>Change your password or sign out of this browser session.</p></div><div class="settings-account-actions"><button class="secondary-button" id="settingsChangePassword" type="button">Change password</button><button class="mini-button" id="settingsSignOut" type="button">Sign out</button></div></div></section>`;
  const adminPanels = isAdmin
    ? `<div class="security-note">After a public holiday is added or removed, open deadlines are recalculated automatically. Filed records are never changed.</div><div class="grid dashboard-grid"><div class="panel"><div class="panel-head"><h3>Non-working days</h3><span>${state.holidays.length} recorded</span></div><div class="panel-body">${
        state.holidays.length
          ? state.holidays
              .map((h) => {
                const source = safeHttps(h.source_url);
                return `<div class="deadline-item"><div><p>${fmt(h.holiday_date)} — ${esc(h.name)}</p><small>Verified ${fmt(h.verified_on)}${source ? ` · <a href="${esc(source)}" target="_blank" rel="noopener">Source</a>` : ""}</small></div><button class="mini-button danger" data-remove-holiday="${h.holiday_date}">Remove</button></div>`;
              })
              .join("")
          : '<div class="cloud-empty"><strong>No public holidays recorded</strong><p>Add official Mauritius public holidays before relying on working-day adjustments.</p></div>'
      }</div></div><div class="panel"><div class="panel-head"><h3>Filing-rule verification</h3><span>${verified.length} active</span></div><div class="panel-body">${verified
        .slice(0, 12)
        .map(
          (r) =>
            `<div class="deadline-item"><div><p>${esc(r.code)} — ${esc(r.name)}</p><small>${esc(r.authority)} · verified ${fmt(r.last_verified_on)}</small></div></div>`,
        )
        .join("")}</div></div></div>`
    : "";
  const adminAction = isAdmin
    ? '<button class="primary-button" id="addHoliday">+ Add public holiday</button>'
    : "";
  login("#cloudRoot").innerHTML =
    `<section class="page settings-page">${pageHead("PREFERENCES & CONTROL", "Settings", isAdmin ? "Manage your account, working-day calendar and controlled practice configuration." : "Manage your account and security.", adminAction)}${accountPanel}${adminPanels}</section>`;
  login("#settingsChangePassword").onclick = showPasswordScreen;
  login("#settingsSignOut").onclick = async () => {
    clearSecuritySession();
    await sb.auth.signOut();
    location.reload();
  };
  if (isAdmin) {
    login("#addHoliday").onclick = openHolidayDrawer;
    document
      .querySelectorAll("[data-remove-holiday]")
      .forEach((b) => (b.onclick = () => removeHoliday(b.dataset.removeHoliday)));
  }
}
function openHolidayDrawer() {
  const wrap = document.createElement("div");
  wrap.className = "drawer";
  wrap.innerHTML = `<div class="drawer-card"><div class="drawer-head"><div><span class="eyebrow">WORKING-DAY CALENDAR</span><h2>Add a public holiday</h2><p>Use an official Government of Mauritius or MRA source.</p></div><button class="drawer-close" type="button">×</button></div><form id="holidayForm"><div class="form-grid"><div class="field"><label>Date</label><input name="holiday_date" type="date" required></div><div class="field"><label>Name</label><input name="name" required maxlength="120"></div><div class="field full"><label>Official source URL</label><input name="source_url" type="url" placeholder="https://..."></div></div><div class="form-message"></div><div class="form-actions"><button type="button" class="mini-button drawer-close">Cancel</button><button class="primary-button" type="submit">Save and recalculate</button></div></form></div>`;
  document.body.appendChild(wrap);
  wrap
    .querySelectorAll(".drawer-close")
    .forEach((x) => (x.onclick = () => wrap.remove()));
  wrap.querySelector("#holidayForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      fd = new FormData(f),
      button = f.querySelector('[type="submit"]'),
      message = f.querySelector(".form-message"),
      source = String(fd.get("source_url")).trim();
    if (source && !safeHttps(source)) {
      message.textContent = "Use an official HTTPS source link.";
      return;
    }
    button.disabled = true;
    const { error } = await sb.from("non_working_days").insert({
      holiday_date: fd.get("holiday_date"),
      name: String(fd.get("name")).trim(),
      source_url: source || null,
    });
    if (error) {
      message.textContent = "This date could not be saved or already exists.";
      button.disabled = false;
      return;
    }
    await sb.rpc("generate_upcoming_work", { p_months_ahead: 12 });
    await loadPracticeData();
    wrap.remove();
    settings();
  };
}
async function removeHoliday(date) {
  if (
    !confirm("Remove this non-working day and recalculate all open deadlines?")
  )
    return;
  const { error } = await sb
    .from("non_working_days")
    .delete()
    .eq("holiday_date", date);
  if (error) {
    alert("The date could not be removed.");
    return;
  }
  await sb.rpc("generate_upcoming_work", { p_months_ahead: 12 });
  await loadPracticeData();
  settings();
}
function closeTopbarMenus(except = "") {
  if (except !== "create") login("#quickAddMenu")?.classList.add("hidden");
  if (except !== "search") login("#globalSearchResults")?.classList.add("hidden");
  if (except !== "notifications") {
    login("#notificationMenu")?.classList.add("hidden");
    login("#notificationButton")?.setAttribute("aria-expanded", "false");
  }
}
const quickAddButton = login("#quickAdd");
if (quickAddButton) {
  quickAddButton.onclick = (event) => {
    event.stopPropagation();
    closeTopbarMenus("create");
    login("#quickAddMenu")?.classList.toggle("hidden");
  };
}
login("#quickAddClient").onclick = () => {
  closeTopbarMenus();
  openClientDrawer();
};
login("#quickAddWork").onclick = () => {
  closeTopbarMenus();
  openManualWorkDrawer();
};

function notificationTitle(item) {
  return item.title || item.subject || item.notification_type || item.type || "Practice alert";
}
function notificationBody(item) {
  return item.message || item.body || item.description || "A practice item needs your attention.";
}
function notificationWorkId(item) {
  return item.work_item_id || item.work_id || item.metadata?.work_item_id || item.payload?.work_item_id || "";
}
function renderNotificationMenu() {
  const menu = login("#notificationMenu");
  if (!menu) return;
  const alerts = [...state.notifications].slice(0, 8);
  const rows = alerts.length
    ? alerts.map((item) => {
        const workId = notificationWorkId(item);
        const created = item.created_at
          ? new Date(item.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          : "New";
        const target = workId ? `data-notification-work="${esc(workId)}"` : 'data-notification-filter="overdue"';
        return `<button type="button" class="notification-item" ${target}><span class="notification-item-icon">!</span><span><strong>${esc(notificationTitle(item))}</strong><small>${esc(notificationBody(item))}</small><em>${esc(created)}</em></span><b>›</b></button>`;
      }).join("")
    : '<div class="notification-empty"><span>✓</span><strong>You are all caught up</strong><small>No unread practice notifications.</small></div>';
  menu.innerHTML = `<div class="notification-menu-head"><div><span>Practice alerts</span><strong>Notifications</strong></div>${alerts.length ? '<button type="button" id="markNotificationsRead">Mark all read</button>' : ""}</div><div class="notification-list">${rows}</div><div class="notification-menu-footer"><button type="button" data-notification-filter="overdue">Overdue work</button><button type="button" data-notification-filter="due7">Due soon</button></div>`;
  menu.querySelectorAll("[data-notification-work]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.notificationWork;
      closeTopbarMenus();
      if (state.work.some((item) => String(item.id) === String(id))) openWorkControlDrawer(id);
      else openWorkFilter("open");
    };
  });
  menu.querySelectorAll("[data-notification-filter]").forEach((button) => {
    button.onclick = () => {
      closeTopbarMenus();
      openWorkFilter(button.dataset.notificationFilter || "open");
    };
  });
  const markRead = menu.querySelector("#markNotificationsRead");
  if (markRead) markRead.onclick = markAllNotificationsRead;
}
async function markAllNotificationsRead() {
  const button = login("#markNotificationsRead");
  if (button) { button.disabled = true; button.textContent = "Marking…"; }
  const ids = state.notifications.map((item) => item.id).filter(Boolean);
  if (ids.length) {
    const { error } = await sb.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    if (error) {
      if (button) { button.disabled = false; button.textContent = "Try again"; }
      return;
    }
  }
  state.notifications = [];
  const count = login("#notificationCount");
  if (count) { count.textContent = "0"; count.classList.add("hidden"); }
  renderNotificationMenu();
}
login("#notificationButton").onclick = (event) => {
  event.stopPropagation();
  const menu = login("#notificationMenu");
  const opening = Boolean(menu?.classList.contains("hidden"));
  closeTopbarMenus(opening ? "notifications" : "");
  if (opening) {
    renderNotificationMenu();
    menu?.classList.remove("hidden");
    login("#notificationButton")?.setAttribute("aria-expanded", "true");
  }
};

const globalSearch = login("#globalSearch"),
  globalSearchResults = login("#globalSearchResults");
function renderGlobalSearch(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    globalSearchResults.classList.add("hidden");
    globalSearchResults.innerHTML = "";
    return;
  }
  const clientMatches = state.clients
      .filter((client) =>
        [client.legal_name, client.brn, client.tan].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(q),
        ),
      )
      .slice(0, 4),
    workMatches = state.work
      .filter((item) =>
        [
          item.clients?.legal_name,
          item.clients?.brn,
          item.return_name,
          item.return_code,
          item.period_label,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(q),
        ),
      )
      .slice(0, 5);
  const clientMarkup = clientMatches
      .map(
        (client) =>
          `<button type="button" data-search-client="${client.id}"><span class="search-result-icon">C</span><span><strong>${esc(client.legal_name)}</strong><small>${esc(client.brn || client.tan || "Client record")}</small></span><b>Client</b></button>`,
      )
      .join(""),
    workMarkup = workMatches
      .map(
        (item) =>
          `<button type="button" data-search-work="${item.id}"><span class="search-result-icon work">W</span><span><strong>${esc(item.return_name)}</strong><small>${esc(item.clients?.legal_name || "Client")} · ${esc(item.period_label)}</small></span><b>${esc(statusLabel(item.status))}</b></button>`,
      )
      .join("");
  globalSearchResults.innerHTML =
    clientMarkup || workMarkup
      ? `${clientMarkup ? `<div class="search-result-group"><span>Clients</span>${clientMarkup}</div>` : ""}${workMarkup ? `<div class="search-result-group"><span>Work</span>${workMarkup}</div>` : ""}`
      : '<div class="search-no-results"><strong>No matching records</strong><span>Try a client name, BRN, return or period.</span></div>';
  globalSearchResults.classList.remove("hidden");
  globalSearchResults.querySelectorAll("[data-search-work]").forEach(
    (button) =>
      (button.onclick = () => {
        closeTopbarMenus();
        globalSearch.value = "";
        openWorkControlDrawer(button.dataset.searchWork);
      }),
  );
  globalSearchResults.querySelectorAll("[data-search-client]").forEach(
    (button) =>
      (button.onclick = () => {
        const client = state.clients.find(
          (item) => String(item.id) === String(button.dataset.searchClient),
        );
        closeTopbarMenus();
        globalSearch.value = "";
        render("clients");
        const clientSearch = login("#clientSearch");
        if (clientSearch && client) {
          clientSearch.value = client.legal_name;
          clientSearch.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }),
  );
}
if (globalSearch) {
  globalSearch.oninput = (event) => renderGlobalSearch(event.target.value);
  globalSearch.onfocus = () => {
    closeTopbarMenus("search");
    renderGlobalSearch(globalSearch.value);
  };
  globalSearch.onkeydown = (event) => {
    if (event.key === "Escape") closeTopbarMenus();
  };
}
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    globalSearch?.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".quick-add-wrap, .global-search-wrap, .notification-wrap"))
    closeTopbarMenus();
});


function closeDrawerSmoothly(drawer) {
  if (!drawer || drawer.classList.contains("is-closing")) return;
  drawer.classList.add("is-closing");
  window.setTimeout(() => drawer.remove(), 310);
}
document.addEventListener(
  "click",
  (event) => {
    const closeButton = event.target.closest(".drawer-close");
    const drawer = event.target.closest(".drawer");
    if (closeButton && drawer) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDrawerSmoothly(drawer);
      return;
    }
    if (drawer && event.target === drawer) closeDrawerSmoothly(drawer);
  },
  true,
);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const drawers = [...document.querySelectorAll(".drawer")];
  closeDrawerSmoothly(drawers.at(-1));
});

document
  .querySelectorAll("#cloudNav .nav-item")
  .forEach((b) => (b.onclick = () => render(b.dataset.view)));
login("#menuButton").onclick = () =>
  document.querySelector(".sidebar").classList.toggle("open");
[login("#sidebarToggle"), login("#sidebarCollapse")].filter(Boolean).forEach((button) => {
  button.addEventListener("click", () => {
    const collapsed = !login("#cloudShell")?.classList.contains("sidebar-collapsed");
    applySidebarPreference(collapsed);
  });
});
login("#themeToggle")?.addEventListener("click", toggleTheme);
applyTheme(currentTheme());
initSidebarPreference();
start();
