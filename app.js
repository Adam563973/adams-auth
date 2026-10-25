import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CONFIG = window.ADAMS_AUTH_CONFIG || {};
const OWNER_EMAIL = String(CONFIG.OWNER_EMAIL || 'adamshahid153@gmail.com').toLowerCase();
const SUPABASE_URL = String(CONFIG.SUPABASE_URL || '');
const SUPABASE_ANON_KEY = String(CONFIG.SUPABASE_ANON_KEY || '');
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) && !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

const $ = (id) => document.getElementById(id);
const state = { user: null, session: null, profile: null, request: null, isOwner: false, activeSection: 'overview', requests: [], pendingModalAction: null };
const STATUS_LABELS = { pending: 'PENDING', approved: 'APPROVED', active: 'BETA ACTIVE', declined: 'OFFER DECLINED' };
const STATUS_CLASS = { pending: 'status-pending', approved: 'status-approved', active: 'status-active', declined: 'status-declined' };

$('year-now').textContent = new Date().getFullYear();
if (!configured) $('setup-note').classList.remove('hidden');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function getInitials(name = 'A') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}
function displayName() {
  return state.profile?.display_name || state.user?.user_metadata?.display_name || state.user?.user_metadata?.full_name || state.user?.user_metadata?.name || (state.user?.email || 'Account').split('@')[0];
}
function providerLabel() {
  const provider = state.user?.app_metadata?.provider || state.user?.identities?.[0]?.provider || 'email';
  if (provider === 'google') return 'Google';
  if (provider === 'azure') return 'Microsoft';
  if (provider === 'email') return 'Email & password';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
function showToast(title, message = '', type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === 'error' ? '!' : type === 'success' ? '✓' : 'i'}</span><div><b>${escapeHtml(title)}</b>${message ? `<p>${escapeHtml(message)}</p>` : ''}</div>`;
  $('toast-region').appendChild(toast);
  window.setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(6px)'; window.setTimeout(() => toast.remove(), 240); }, 4400);
}
function setupRequired() {
  showToast('Connect your backend first', 'Set up Supabase and fill in config.js. This preview does not save passwords or create fake accounts.', 'error');
}
function setBusy(button, busy, label = 'Please wait…') {
  if (!button) return;
  if (busy) {
    button.dataset.oldHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${label}`;
  } else {
    button.disabled = false;
    if (button.dataset.oldHtml) button.innerHTML = button.dataset.oldHtml;
    delete button.dataset.oldHtml;
  }
}
function setAuthMode(mode) {
  const signup = mode === 'signup';
  $('tab-login').classList.toggle('active', !signup);
  $('tab-signup').classList.toggle('active', signup);
  $('tab-login').setAttribute('aria-selected', String(!signup));
  $('tab-signup').setAttribute('aria-selected', String(signup));
  $('auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
  $('auth-subtitle').textContent = signup ? 'A few details and you’ll be ready to go.' : 'Sign in to continue to Adams Auth.';
  $('auth-submit').querySelector('span').textContent = signup ? 'Create account' : 'Sign in';
  $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  $('auth-name').required = signup;
  $('name-wrap').hidden = !signup;
  $('name-label').hidden = !signup;
  $('forgot-password').hidden = signup;
  $('auth-form-note').classList.add('hidden');
}
function setAuthNote(message, type = 'info') {
  const note = $('auth-form-note');
  note.textContent = message;
  note.classList.remove('hidden');
  note.style.color = type === 'error' ? '#b43f4f' : type === 'success' ? '#287a5c' : '#6f7d94';
}
function navigate(section) {
  if (section === 'admin' && !state.isOwner) section = 'overview';
  state.activeSection = section;
  document.querySelectorAll('.side-link[data-section]').forEach((button) => button.classList.toggle('active', button.dataset.section === section));
  document.querySelectorAll('.content-section').forEach((element) => element.classList.add('hidden'));
  const current = $(`section-${section}`);
  if (current) current.classList.remove('hidden');
  const title = section === 'beta' ? 'Beta programme' : section === 'admin' ? 'Beta requests' : 'Your account';
  $('page-title').textContent = title;
  $('breadcrumb-current').textContent = title;
  $('account-menu').classList.add('hidden');
  if (section === 'admin') refreshRequests();
  if (section === 'beta') renderBetaSection();
}
function openAccountMenu() {
  if (!state.user) return;
  $('account-menu').classList.toggle('hidden');
}
function showLoggedOut() {
  state.user = null; state.session = null; state.profile = null; state.request = null; state.isOwner = false; state.requests = [];
  $('auth-view').classList.remove('hidden');
  $('dashboard-view').classList.add('hidden');
  $('header-account').classList.add('hidden');
  $('admin-nav').classList.add('hidden');
  $('account-menu').classList.add('hidden');
  closeModal();
}
async function handleSession(session) {
  if (!session?.user) { showLoggedOut(); return; }
  state.session = session;
  state.user = session.user;
  state.isOwner = String(session.user.email || '').toLowerCase() === OWNER_EMAIL && Boolean(session.user.email_confirmed_at || session.user.confirmed_at);
  $('auth-view').classList.add('hidden');
  $('dashboard-view').classList.remove('hidden');
  $('header-account').classList.remove('hidden');
  $('admin-nav').classList.toggle('hidden', !state.isOwner);
  await loadProfileAndRequest();
  renderAccount();
  renderDashboard();
  navigate(state.activeSection === 'admin' && state.isOwner ? 'admin' : state.activeSection || 'overview');
}
async function loadProfileAndRequest() {
  if (!supabase || !state.user) return;
  let { data: profile, error } = await supabase.from('profiles').select('id,email,display_name,beta_access,created_at').eq('id', state.user.id).maybeSingle();
  if (error) console.warn('Could not load profile', error.message);
  if (!profile) {
    // The database trigger normally creates the profile. Give it a moment after first OAuth sign-in.
    await new Promise((resolve) => setTimeout(resolve, 350));
    const retry = await supabase.from('profiles').select('id,email,display_name,beta_access,created_at').eq('id', state.user.id).maybeSingle();
    profile = retry.data;
    if (retry.error) console.warn('Profile retry failed', retry.error.message);
  }
  state.profile = profile || { id: state.user.id, email: state.user.email, display_name: state.user.user_metadata?.display_name || state.user.user_metadata?.full_name || state.user.user_metadata?.name || '', beta_access: false, created_at: state.user.created_at };
  const requestResult = await supabase.from('beta_requests').select('id,user_id,status,created_at,updated_at').eq('user_id', state.user.id).maybeSingle();
  if (requestResult.error) console.warn('Could not load beta request', requestResult.error.message);
  state.request = requestResult.data || null;
}
function renderAccount() {
  const name = displayName();
  const initials = getInitials(name);
  $('header-name').textContent = name;
  $('header-avatar-initials').textContent = initials;
  $('header-avatar-beta-mark').classList.toggle('hidden', !state.profile?.beta_access);
  $('menu-name').textContent = name;
  $('menu-email').textContent = state.user?.email || '';
  $('menu-avatar').textContent = initials;
  $('welcome-name').textContent = name.split(' ')[0] || name;
  $('profile-display-name').childNodes[0].textContent = name;
  $('profile-email').textContent = state.user?.email || '';
  $('profile-avatar-initials').textContent = initials;
  $('profile-avatar-beta-mark').classList.toggle('hidden', !state.profile?.beta_access);
  $('detail-name').textContent = name;
  $('detail-email').textContent = state.user?.email || '';
  $('detail-created').textContent = state.user?.created_at ? new Date(state.user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Available after setup';
  $('provider-value').textContent = providerLabel();
  $('email-verification').textContent = state.user?.email_confirmed_at || state.user?.confirmed_at || providerLabel() !== 'Email & password' ? 'Identity verified' : 'Check your email to verify';
  $('profile-beta-badge').classList.toggle('hidden', !state.profile?.beta_access);
  const profileStatus = $('profile-status-label');
  const reqStatus = state.profile?.beta_access ? 'active' : state.request?.status || 'none';
  profileStatus.classList.toggle('hidden', reqStatus === 'none');
  profileStatus.className = `profile-status-label ${reqStatus === 'none' ? 'hidden' : `profile-status-${reqStatus}`}`;
  profileStatus.textContent = reqStatus === 'declined' ? 'Offer declined' : reqStatus === 'pending' ? 'Beta application pending' : reqStatus === 'approved' ? 'Approved · code required' : reqStatus === 'active' ? 'Beta access active' : '';
  if (state.isOwner) {
    const badge = document.createElement('span'); badge.className = 'beta-badge'; badge.textContent = 'OWNER';
    if (!$('profile-display-name').querySelector('.owner-inline')) { badge.classList.add('owner-inline'); $('profile-display-name').appendChild(badge); }
  } else $('profile-display-name').querySelector('.owner-inline')?.remove();
  $('account-status-value').textContent = 'Active';
  $('account-status-caption').textContent = state.user?.email_confirmed_at || state.user?.confirmed_at || providerLabel() !== 'Email & password' ? 'Your account is ready to use.' : 'Check your inbox to confirm your email.';
}
function statusLabel(status) { return STATUS_LABELS[status] || 'NOT APPLIED'; }
function statusClass(status) { return STATUS_CLASS[status] || 'status-neutral'; }
function renderDashboard() {
  const request = state.request;
  const betaOn = !!state.profile?.beta_access || request?.status === 'active';
  const status = betaOn ? 'active' : request?.status || 'none';
  $('beta-status-value').textContent = betaOn ? 'Active' : status === 'pending' ? 'In review' : status === 'approved' ? 'Approved' : status === 'declined' ? 'Declined' : 'Not enrolled';
  $('beta-status-caption').textContent = betaOn ? 'You have beta access.' : status === 'pending' ? 'Your application is awaiting review.' : status === 'approved' ? 'Enter your invitation code to activate access.' : status === 'declined' ? 'Offer declined.' : 'Apply to request early access.';
  const overviewStatus = $('overview-beta-status');
  const statusText = betaOn ? 'Beta access is active' : status === 'pending' ? 'Your application is under review' : status === 'approved' ? 'Invitation approved — code required' : status === 'declined' ? 'Offer declined' : 'No application submitted';
  overviewStatus.innerHTML = `<span class="status-indicator ${status === 'none' ? 'neutral' : escapeHtml(status)}"></span><span>${escapeHtml(statusText)}</span>`;
  $('overview-apply').classList.toggle('hidden', status !== 'none' && status !== 'declined');
  $('overview-manage').classList.toggle('hidden', status === 'none');
  $('sidebar-beta-dot').classList.toggle('hidden', !request || request.status === 'active');
  $('admin-count').classList.toggle('hidden', !state.isOwner);
  if (state.isOwner) refreshAdminCount();
  renderBetaSection();
}
function renderBetaSection() {
  const req = state.request;
  const betaOn = !!state.profile?.beta_access || req?.status === 'active';
  const status = betaOn ? 'active' : req?.status || 'none';
  const chip = $('beta-status-chip');
  chip.textContent = statusLabel(status);
  chip.className = `status-chip ${statusClass(status)}`;
  const titles = {
    none: ['Your next step starts here.', 'Apply to join the beta. If your request is accepted, you’ll receive a personal six-digit code to enter here.'],
    pending: ['Your request is in review.', 'Your application has been sent. You’ll see an update here when Adams has made a decision.'],
    approved: ['You’ve been approved.', 'Enter the six-digit code you received by email to activate beta access for this account.'],
    declined: ['Offer declined.', 'Your beta application was declined. The status is saved here so you can see the decision any time.'],
    active: ['You’re in the beta programme.', 'Beta access is active for this account. Your profile will show a beta badge while access is enabled.']
  };
  $('beta-panel-title').textContent = titles[status][0];
  $('beta-panel-description').textContent = titles[status][1];
  const steps = document.querySelectorAll('.timeline-step');
  steps.forEach((step, index) => { step.classList.remove('current', 'complete'); if ((status === 'pending' && index === 1) || (status === 'approved' && index === 2) || status === 'active') step.classList.add(status === 'active' || index < (status === 'pending' ? 1 : status === 'approved' ? 2 : 3) ? 'complete' : 'current'); else if (status === 'none' && index === 0) step.classList.add('current'); else if (status === 'declined' && index === 1) step.classList.add('current'); });
  $('apply-beta').classList.toggle('hidden', status !== 'none' && status !== 'declined');
  $('apply-beta').innerHTML = status === 'declined' ? 'Apply again <svg viewBox="0 0 20 20"><path d="M3.5 10h12m-4.5-4.5L15.5 10 11 14.5"/></svg>' : 'Apply for beta <svg viewBox="0 0 20 20"><path d="M3.5 10h12m-4.5-4.5L15.5 10 11 14.5"/></svg>';
  $('redeem-area').classList.toggle('hidden', status !== 'approved');
  $('beta-user-message').classList.add('hidden');
  if (status === 'declined') showBetaMessage('Offer declined', 'Your application decision is saved to this account.', 'error');
  if (status === 'active') showBetaMessage('Beta access active', 'You are verified for beta access on this account.', 'success');
}
function showBetaMessage(title, message, type = 'info') {
  const box = $('beta-user-message');
  box.className = `inline-message ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  box.innerHTML = `<b>${escapeHtml(title)}</b><br>${escapeHtml(message)}`;
  box.classList.remove('hidden');
}
function navigateToBeta() { navigate('beta'); }
async function refreshAdminCount() {
  if (!state.isOwner || !supabase) return;
  const result = await supabase.from('beta_requests').select('status');
  if (result.error) return;
  $('admin-count').textContent = result.data.filter((r) => r.status === 'pending').length;
  $('admin-count').classList.toggle('hidden', result.data.filter((r) => r.status === 'pending').length === 0);
}
async function refreshRequests() {
  if (!state.isOwner || !supabase) return;
  $('requests-list').innerHTML = '<div class="empty-state"><div class="empty-icon">✦</div><b>Loading applications</b><p>Fetching the latest beta requests.</p></div>';
  const { data, error } = await supabase.from('beta_requests').select('id,user_id,status,created_at,updated_at,profiles(display_name,email,beta_access)').order('created_at', { ascending: false });
  if (error) {
    $('requests-list').innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><b>Could not load requests</b><p>${escapeHtml(error.message)}. Check the database setup and row-level security policies.</p></div>`;
    return;
  }
  state.requests = data || [];
  $('pending-count').textContent = state.requests.filter((r) => r.status === 'pending').length;
  $('approved-count').textContent = state.requests.filter((r) => r.status === 'approved').length;
  $('active-count').textContent = state.requests.filter((r) => r.status === 'active').length;
  $('declined-count').textContent = state.requests.filter((r) => r.status === 'declined').length;
  const pending = state.requests.filter((r) => r.status === 'pending').length;
  $('admin-count').textContent = pending;
  $('admin-count').classList.toggle('hidden', pending === 0);
  if (!state.requests.length) {
    $('requests-list').innerHTML = '<div class="empty-state"><div class="empty-icon">✦</div><b>No beta applications yet</b><p>New applications will appear here when someone requests access.</p></div>';
    return;
  }
  $('requests-list').innerHTML = state.requests.map((request) => {
    const profile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles;
    const name = profile?.display_name || (profile?.email || 'Account').split('@')[0];
    const email = profile?.email || 'Email unavailable';
    const status = request.status || 'pending';
    const date = request.created_at ? new Date(request.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable';
    let actions = '';
    if (status === 'pending') actions = `<button class="mini-button approve" type="button" data-action="approve" data-id="${escapeHtml(request.id)}" data-email="${escapeHtml(email)}">Approve &amp; generate code</button><button class="mini-button decline" type="button" data-action="decline" data-id="${escapeHtml(request.id)}">Decline</button>`;
    else if (status === 'approved') actions = `<button class="mini-button approve" type="button" data-action="regenerate" data-id="${escapeHtml(request.id)}" data-email="${escapeHtml(email)}">Regenerate code</button><button class="mini-button decline" type="button" data-action="decline" data-id="${escapeHtml(request.id)}">Revoke offer</button>`;
    else if (status === 'declined') actions = `<span class="request-status status-declined">OFFER DECLINED</span>`;
    else actions = `<span class="request-status status-active">BETA ACTIVE</span>`;
    return `<article class="request-item"><div class="request-user"><span class="avatar">${escapeHtml(getInitials(name))}</span><div class="request-user-info"><h4>${escapeHtml(name)} <span class="request-status ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span></h4><p>${escapeHtml(email)}</p><div class="request-meta">Applied ${escapeHtml(date)}</div></div></div><div class="request-actions">${actions}</div></article>`;
  }).join('');
}
function showModal({ kicker = 'ACCOUNT', title, description = '', icon = 'info', formHtml = '', actions = [] }) {
  $('modal-kicker').textContent = kicker;
  $('modal-title').textContent = title;
  $('modal-description').textContent = description;
  const icons = {
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.4-4.2 3-6.5 7.5-6.5s7.1 2.3 7.5 6.5"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 3 3m-6 0 3 3"/></svg>',
    beta: '<svg viewBox="0 0 24 24"><path d="m12 2.5 2.8 6 6.5.8-4.8 4.4 1.3 6.4-5.8-3.3-5.8 3.3 1.3-6.4-4.8-4.4 6.5-.8 2.8-6Z"/></svg>'
  };
  $('modal-icon').innerHTML = icons[icon] || icons.info;
  $('modal-form').innerHTML = formHtml;
  const actionHtml = actions.map((a, index) => `<button type="button" class="${a.kind === 'primary' ? 'primary-button' : 'secondary-button'}" data-modal-action="${index}">${a.label}</button>`).join('');
  $('modal-actions').innerHTML = actionHtml;
  state.pendingModalAction = actions;
  $('modal-backdrop').classList.remove('hidden');
  window.setTimeout(() => $('modal-card').focus(), 20);
  $('modal-actions').querySelectorAll('[data-modal-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = actions[Number(button.dataset.modalAction)];
    if (action?.run) await action.run();
  }));
}
function closeModal() {
  $('modal-backdrop').classList.add('hidden');
  $('modal-form').innerHTML = '';
  $('modal-actions').innerHTML = '';
  state.pendingModalAction = null;
}
function openProfileModal() {
  const current = displayName();
  showModal({
    kicker: 'PROFILE SETTINGS', title: 'Edit your profile', description: 'Choose the name shown on your Adams Auth profile. This does not change your Google/Microsoft identity or any school records.', icon: 'user',
    formHtml: `<label class="field-label" for="edit-display-name">Display name</label><input id="edit-display-name" type="text" maxlength="60" autocomplete="nickname" value="${escapeHtml(current)}" required><p class="modal-field-note">Your account email stays the same. Your password is never displayed or stored in this profile.</p>`,
    actions: [{ label: 'Cancel', kind: 'secondary', run: closeModal }, { label: 'Save changes', kind: 'primary', run: saveProfileName }]
  });
}
async function saveProfileName() {
  const input = $('edit-display-name');
  const name = input?.value.trim();
  if (!name || name.length > 60) { showToast('Check the display name', 'Enter a name between 1 and 60 characters.', 'error'); input?.focus(); return; }
  if (!supabase || !state.user) return setupRequired();
  const button = $('modal-actions').querySelector('.primary-button'); setBusy(button, true, 'Saving…');
  const { data, error } = await supabase.from('profiles').update({ display_name: name }).eq('id', state.user.id).select('id,email,display_name,beta_access,created_at').maybeSingle();
  if (error) { setBusy(button, false); showToast('Could not save profile', error.message, 'error'); return; }
  state.profile = data || { ...state.profile, display_name: name };
  closeModal(); renderAccount(); renderDashboard(); showToast('Profile updated', 'Your Adams Auth display name has been saved.', 'success');
}
function openCodeModal(email, code, expiresAt) {
  const expiry = expiresAt ? new Date(expiresAt).toLocaleString() : 'in 72 hours';
  showModal({
    kicker: 'BETA INVITATION', title: 'Invitation code created', description: 'Copy this code and email it to the approved applicant. The full code is shown only now; the database stores a hash of it.', icon: 'beta',
    formHtml: `<div class="generated-code" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border:1px solid #dce8fb;border-radius:13px;background:#f5f9ff"><strong style="font:800 29px Manrope,sans-serif;letter-spacing:7px;color:#183768">${escapeHtml(code)}</strong><button id="copy-generated-code" type="button" class="quiet-button">Copy code</button></div><p class="modal-field-note" style="margin-top:10px">Applicant: <b>${escapeHtml(email)}</b><br>Expires: ${escapeHtml(expiry)}<br>One-time use · linked to this applicant’s account.</p>`,
    actions: [{ label: 'Close', kind: 'secondary', run: closeModal }, { label: 'Draft email', kind: 'primary', run: () => { const subject = encodeURIComponent('Your Adams Auth beta invitation'); const body = encodeURIComponent(`Hi,\n\nYour Adams Auth beta application has been approved.\n\nYour six-digit invitation code is: ${code}\n\nPlease sign in to Adams Auth with the account you used to apply and enter the code under Beta programme. It expires ${expiry} and can only be used once.\n\nThanks,\nAdam`); window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`; } }]
  });
  $('copy-generated-code')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); showToast('Code copied', 'Send the code to the applicant privately.', 'success'); } catch { showToast('Copy unavailable', `Select and copy ${code} manually.`, 'error'); } });
}
async function callWorkflow(action, payload = {}) {
  if (!supabase) { setupRequired(); throw new Error('Supabase has not been configured.'); }
  const { data, error } = await supabase.functions.invoke('beta-workflow', { body: { action, ...payload } });
  if (error) {
    let message = error.message || 'The server could not complete that action.';
    try { const body = error.context ? await error.context.json() : null; if (body?.error) message = body.error; } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
async function applyForBeta(button) {
  if (!state.user) return;
  setBusy(button, true, 'Submitting…');
  try {
    const result = await callWorkflow('apply');
    await loadProfileAndRequest(); renderDashboard();
    showToast('Application saved', result.message || 'Your beta request is now in the queue.', 'success');
  } catch (error) { showToast('Could not apply', error.message, 'error'); }
  finally { setBusy(button, false); }
}
async function redeemBetaCode() {
  const input = $('beta-code');
  const code = input.value.trim();
  if (!/^\d{6}$/.test(code)) { showBetaMessage('Enter a valid code', 'Your invitation code must contain exactly six digits.', 'error'); input.focus(); return; }
  const button = $('redeem-code'); setBusy(button, true, 'Checking…');
  try {
    const result = await callWorkflow('redeem', { code });
    await loadProfileAndRequest(); renderAccount(); renderDashboard();
    showToast('Beta access activated', result.message || 'Your account now has beta access.', 'success');
  } catch (error) { showBetaMessage('Code could not be redeemed', error.message, 'error'); }
  finally { setBusy(button, false); }
}
async function adminAction(action, requestId, email = '') {
  const labels = { approve: 'Approving…', regenerate: 'Generating…', decline: 'Updating…' };
  const button = document.querySelector(`[data-action="${action}"][data-id="${CSS.escape(requestId)}"]`);
  setBusy(button, true, labels[action] || 'Please wait…');
  try {
    if (action === 'decline') {
      const result = await callWorkflow('decline', { requestId });
      showToast('Offer declined', result.message || `${email || 'The applicant'} will see “Offer declined”.`, 'success');
      await refreshRequests(); await refreshAdminCount();
      if (state.user && state.request?.id === requestId) { await loadProfileAndRequest(); renderDashboard(); }
      return;
    }
    const result = await callWorkflow(action, { requestId });
    await refreshRequests(); await refreshAdminCount();
    openCodeModal(email, result.code, result.expiresAt);
  } catch (error) {
    showToast('Action failed', error.message, 'error');
    if (state.isOwner) await refreshRequests();
  } finally { if (button?.isConnected) setBusy(button, false); }
}
async function resetPassword() {
  if (!supabase || !state.user?.email) return setupRequired();
  const { error } = await supabase.auth.resetPasswordForEmail(state.user.email, { redirectTo: window.location.href.split('#')[0] });
  if (error) showToast('Could not send reset email', error.message, 'error');
  else showToast('Password reset email sent', `Check ${state.user.email} for a secure reset link.`, 'success');
}
function openPasswordRecoveryModal() {
  showModal({ kicker: 'ACCOUNT SECURITY', title: 'Set a new password', description: 'Choose a new password for your email-and-password sign-in.', icon: 'key', formHtml: `<label class="field-label" for="new-password">New password</label><input id="new-password" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" required><label class="field-label" for="confirm-password">Confirm new password</label><input id="confirm-password" type="password" minlength="8" autocomplete="new-password" placeholder="Enter it again" required>`, actions: [{ label: 'Cancel', kind: 'secondary', run: closeModal }, { label: 'Update password', kind: 'primary', run: updatePassword }] });
}
async function updatePassword() {
  const password = $('new-password')?.value || '';
  const confirm = $('confirm-password')?.value || '';
  if (password.length < 8) return showToast('Password too short', 'Use at least 8 characters.', 'error');
  if (password !== confirm) return showToast('Passwords do not match', 'Enter the same password in both fields.', 'error');
  const button = $('modal-actions').querySelector('.primary-button'); setBusy(button, true, 'Updating…');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) { setBusy(button, false); showToast('Could not update password', error.message, 'error'); return; }
  closeModal(); showToast('Password updated', 'Your new password is saved securely by the authentication provider.', 'success');
}
async function signOut() {
  if (!supabase) return setupRequired();
  const { error } = await supabase.auth.signOut();
  if (error) showToast('Could not sign out', error.message, 'error');
  else { showLoggedOut(); setAuthMode('login'); showToast('Signed out', 'You have safely signed out of Adams Auth.', 'success'); }
}

$('tab-login').addEventListener('click', () => setAuthMode('login'));
$('tab-signup').addEventListener('click', () => setAuthMode('signup'));
$('toggle-password').addEventListener('click', () => {
  const input = $('auth-password'); const reveal = input.type === 'password'; input.type = reveal ? 'text' : 'password'; $('toggle-password').setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
});
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return setupRequired();
  const signup = $('tab-signup').classList.contains('active');
  const email = $('auth-email').value.trim().toLowerCase(); const password = $('auth-password').value; const name = $('auth-name').value.trim();
  if (!email || !password || (signup && !name)) return setAuthNote('Fill in all required fields.', 'error');
  if (signup && password.length < 8) return setAuthNote('Use a password with at least 8 characters.', 'error');
  const button = $('auth-submit'); setBusy(button, true, signup ? 'Creating…' : 'Signing in…');
  try {
    if (signup) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: window.location.href.split('#')[0] } });
      if (error) throw error;
      if (data.session) await handleSession(data.session);
      else setAuthNote('Account created. Check your email to verify the address, then sign in.', 'success');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await handleSession(data.session);
    }
  } catch (error) { setAuthNote(error.message || 'Sign-in failed. Check your details and try again.', 'error'); }
  finally { setBusy(button, false); }
});
$('google-login').addEventListener('click', async () => {
  if (!supabase) return setupRequired();
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href.split('#')[0] } });
  if (error) showToast('Google sign-in failed', error.message, 'error');
});
$('microsoft-login').addEventListener('click', async () => {
  if (!supabase) return setupRequired();
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email', redirectTo: window.location.href.split('#')[0] } });
  if (error) showToast('Microsoft sign-in failed', error.message, 'error');
});
$('forgot-password').addEventListener('click', async () => {
  if (!supabase) return setupRequired();
  const email = $('auth-email').value.trim().toLowerCase();
  if (!email) { setAuthNote('Enter your email address first, then choose “Forgot password?”.'); $('auth-email').focus(); return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split('#')[0] });
  if (error) setAuthNote(error.message, 'error'); else setAuthNote('If this email has an account, a password-reset link will arrive shortly.', 'success');
});
$('header-account').addEventListener('click', openAccountMenu);
$('menu-profile').addEventListener('click', () => { $('account-menu').classList.add('hidden'); openProfileModal(); });
$('menu-beta').addEventListener('click', navigateToBeta);
$('menu-signout').addEventListener('click', signOut);
$('sign-out').addEventListener('click', signOut);
$('edit-profile').addEventListener('click', openProfileModal);
$('reset-password').addEventListener('click', resetPassword);
$('overview-apply').addEventListener('click', navigateToBeta);
$('overview-manage').addEventListener('click', navigateToBeta);
$('apply-beta').addEventListener('click', (event) => applyForBeta(event.currentTarget));
$('redeem-code').addEventListener('click', redeemBetaCode);
$('beta-code').addEventListener('input', () => { $('beta-code').value = $('beta-code').value.replace(/\D/g, '').slice(0, 6); });
$('beta-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') redeemBetaCode(); });
$('refresh-requests').addEventListener('click', refreshRequests);
$('requests-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  await adminAction(button.dataset.action, button.dataset.id, button.dataset.email || '');
});
document.querySelectorAll('.side-link[data-section]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.section)));
$('modal-form').addEventListener('submit', (event) => { event.preventDefault(); $('modal-actions').querySelector('.primary-button')?.click(); });
$('modal-close').addEventListener('click', closeModal);
$('modal-backdrop').addEventListener('click', (event) => { if (event.target === $('modal-backdrop')) closeModal(); });
document.addEventListener('click', (event) => {
  if (!$('account-menu').classList.contains('hidden') && !event.target.closest('#account-menu') && !event.target.closest('#header-account')) $('account-menu').classList.add('hidden');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeModal(); $('account-menu').classList.add('hidden'); }
});

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { if (session) { state.session = session; state.user = session.user; openPasswordRecoveryModal(); } return; }
    if (event === 'SIGNED_OUT') { showLoggedOut(); return; }
    if (session?.user && (!state.user || state.user.id !== session.user.id)) { queueMicrotask(() => handleSession(session)); }
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) console.warn('Could not read session', error.message);
    if (data?.session) handleSession(data.session);
  }).catch((error) => console.warn('Session setup failed', error));
}
