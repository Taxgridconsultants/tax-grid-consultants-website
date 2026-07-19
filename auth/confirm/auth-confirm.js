(() => {
  const status = document.getElementById('activationStatus');
  const intro = document.getElementById('activationIntro');
  const form = document.getElementById('passwordForm');
  const errorBox = document.getElementById('activationError');
  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirmPassword');
  const activateButton = document.getElementById('activateButton');

  const showError = (message) => {
    status.hidden = true;
    form.hidden = true;
    errorBox.hidden = false;
    errorBox.textContent = message;
    intro.textContent = 'We could not complete this invitation.';
  };

  const showForm = () => {
    status.hidden = true;
    errorBox.hidden = true;
    form.hidden = false;
    intro.textContent = 'Your invitation is verified. Create a secure password to finish setting up your staff account.';
    password.focus();
  };

  const config = window.TGC_CLOUD || {};
  if (!config.supabaseUrl || !config.publishableKey || !window.supabase?.createClient) {
    showError('The activation service is not available. Contact your administrator.');
    return;
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.publishableKey);
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash');
  const type = params.get('type') || 'invite';

  async function verifyInvitation() {
    if (!tokenHash) {
      const { data } = await client.auth.getSession();
      if (data?.session) {
        showForm();
        return;
      }
      showError('This invitation link is incomplete or has expired. Request a new invitation from your administrator.');
      return;
    }

    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type
    });

    if (error) {
      showError('This invitation is invalid or has expired. Request a fresh invitation from your administrator.');
      return;
    }

    window.history.replaceState({}, document.title, '/auth/confirm/');
    showForm();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;

    if (password.value.length < 12) {
      errorBox.hidden = false;
      errorBox.textContent = 'Your password must contain at least 12 characters.';
      return;
    }

    if (password.value !== confirmPassword.value) {
      errorBox.hidden = false;
      errorBox.textContent = 'The two passwords do not match.';
      return;
    }

    activateButton.disabled = true;
    activateButton.textContent = 'Activating…';

    const { error } = await client.auth.updateUser({ password: password.value });

    if (error) {
      activateButton.disabled = false;
      activateButton.textContent = 'Activate account';
      errorBox.hidden = false;
      errorBox.textContent = error.message || 'The password could not be saved. Please try again.';
      return;
    }

    intro.textContent = 'Your account is active. Opening Tax Grid Consultants Practice Manager…';
    form.hidden = true;
    status.hidden = false;
    status.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Opening your workspace</span>';
    window.setTimeout(() => {
      window.location.replace('/cloud/index.html?activated=1');
    }, 900);
  });

  verifyInvitation().catch(() => {
    showError('The activation request could not be completed. Contact your administrator.');
  });
})();
