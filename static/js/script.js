// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Alert system
function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer') || createAlertContainer();
  
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} show`;
  alert.innerHTML = `
    <button class="modal-close" onclick="this.parentElement.remove()" style="float: right;">×</button>
    ${escapeHtml(message)}
  `;
  
  alertContainer.appendChild(alert);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    alert.remove();
  }, 5000);
}

function createAlertContainer() {
  const container = document.createElement('div');
  container.id = 'alertContainer';
  container.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 3000; max-width: 400px;';
  document.body.appendChild(container);
  return container;
}

// Username validation
function validateUsername(username) {
  const requirements = {
    length: username.length >= 3,
    lettersOnly: /^[a-zA-Z]*$/.test(username)
  };
  return requirements;
}

function updateUsernameRequirements(requirements) {
  const userLength = document.getElementById('user-length');
  const userLetters = document.getElementById('user-letters');
  
  if (userLength) {
    userLength.innerHTML = requirements.length ? '✓ At least 3 characters' : '✗ At least 3 characters';
    userLength.style.color = requirements.length ? 'var(--success-color)' : 'var(--text-secondary)';
  }
  
  if (userLetters) {
    userLetters.innerHTML = requirements.lettersOnly ? '✓ Letters only (A-Z, a-z)' : '✗ Letters only (A-Z, a-z)';
    userLetters.style.color = requirements.lettersOnly ? 'var(--success-color)' : 'var(--text-secondary)';
  }
}

// Password validation
function validatePassword(password) {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /[0-9]/.test(password)
  };
  return requirements;
}

function updatePasswordRequirements(requirements) {
  const reqLength = document.getElementById('req-length');
  const reqUpper = document.getElementById('req-upper');
  const reqLower = document.getElementById('req-lower');
  const reqDigit = document.getElementById('req-digit');
  
  if (reqLength) {
    reqLength.innerHTML = requirements.length ? '✓ At least 8 characters' : '✗ At least 8 characters';
    reqLength.style.color = requirements.length ? 'var(--success-color)' : 'var(--text-secondary)';
  }
  
  if (reqUpper) {
    reqUpper.innerHTML = requirements.uppercase ? '✓ One uppercase letter' : '✗ One uppercase letter';
    reqUpper.style.color = requirements.uppercase ? 'var(--success-color)' : 'var(--text-secondary)';
  }
  
  if (reqLower) {
    reqLower.innerHTML = requirements.lowercase ? '✓ One lowercase letter' : '✗ One lowercase letter';
    reqLower.style.color = requirements.lowercase ? 'var(--success-color)' : 'var(--text-secondary)';
  }
  
  if (reqDigit) {
    reqDigit.innerHTML = requirements.digit ? '✓ One number' : '✗ One number';
    reqDigit.style.color = requirements.digit ? 'var(--success-color)' : 'var(--text-secondary)';
  }
}

// Toggle between login and register forms
function toggleAuthForm(form) {
  const loginSection = document.getElementById('loginSection');
  const registerSection = document.getElementById('registerSection');
  
  if (form === 'register') {
    loginSection?.classList.remove('active');
    registerSection?.classList.add('active');
  } else {
    loginSection?.classList.add('active');
    registerSection?.classList.remove('active');
  }
}

// Close modal function
function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('active');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const changePasswordForm = document.getElementById('changePasswordForm');
  const changeEmailForm = document.getElementById('changeEmailForm');
  const logoutBtn = document.getElementById('logoutBtn');
  
  // Set form actions and methods
  if (loginForm) {
    loginForm.action = '/api/login';
    loginForm.method = 'POST';
  }
  
  if (registerForm) {
    registerForm.action = '/api/register';
    registerForm.method = 'POST';
  }
  
  // Username validation for registration form
  const registerUsername = document.getElementById('registerUsername');
  if (registerUsername) {
    registerUsername.addEventListener('input', () => {
      const requirements = validateUsername(registerUsername.value);
      updateUsernameRequirements(requirements);
    });
  }
  
  // Password validation for registration form
  const registerPassword = document.getElementById('registerPassword');
  if (registerPassword) {
    registerPassword.addEventListener('input', () => {
      const requirements = validatePassword(registerPassword.value);
      updatePasswordRequirements(requirements);
    });
  }
  
  // Password validation for change password form
  const newPassword = document.getElementById('newPassword');
  if (newPassword) {
    newPassword.addEventListener('input', () => {
      const requirements = validatePassword(newPassword.value);
      updatePasswordRequirements(requirements);
    });
  }
  
  // Validate form submission for registration
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      const username = document.getElementById('registerUsername').value;
      const password = document.getElementById('registerPassword').value;
      const confirmPassword = document.getElementById('registerPasswordConfirm').value;
      
      const usernameReq = validateUsername(username);
      const usernameValid = usernameReq.length && usernameReq.lettersOnly;
      
      if (!usernameValid) {
        e.preventDefault();
        showAlert('Username must be at least 3 characters with letters only (A-Z, a-z)', 'error');
        return;
      }
      
      const requirements = validatePassword(password);
      const isValid = requirements.length && requirements.uppercase && 
                     requirements.lowercase && requirements.digit;
      
      if (!isValid) {
        e.preventDefault();
        showAlert('Password must be at least 8 characters with uppercase, lowercase, and numbers', 'error');
        return;
      }
      
      if (password !== confirmPassword) {
        e.preventDefault();
        showAlert('Passwords do not match', 'error');
        return;
      }
    });
  }
  
  // Validate form submission for change password
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmNewPassword').value;
      const oldPassword = document.getElementById('oldPassword').value;
      
      const requirements = validatePassword(newPassword);
      const isValid = requirements.length && requirements.uppercase && 
                     requirements.lowercase && requirements.digit;
      
      if (!isValid) {
        showAlert('New password must be at least 8 characters with uppercase, lowercase, and numbers', 'error');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        showAlert('New passwords do not match', 'error');
        return;
      }
      
      if (newPassword === oldPassword) {
        showAlert('New password must be different from old password', 'error');
        return;
      }
      
      // Submit via AJAX
      try {
        const formData = new FormData(changePasswordForm);
        const response = await fetch('/api/change-password', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
          showAlert(data.message, 'success');
          changePasswordForm.reset();
          // Reset password requirements display
          document.getElementById('passwordRequirements').innerHTML = `
            <div id="req-length" style="color: var(--text-secondary);">✗ At least 8 characters</div>
            <div id="req-upper" style="color: var(--text-secondary);">✗ One uppercase letter</div>
            <div id="req-lower" style="color: var(--text-secondary);">✗ One lowercase letter</div>
            <div id="req-digit" style="color: var(--text-secondary);">✗ One number</div>
          `;
        } else {
          showAlert(data.message, 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        showAlert('An error occurred. Please try again.', 'error');
      }
    });
  }
  
  // Validate form submission for change email
  if (changeEmailForm) {
    changeEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const newEmail = document.getElementById('newEmail').value;
      const password = document.getElementById('emailPassword').value;
      
      if (!newEmail || !password) {
        showAlert('All fields are required', 'error');
        return;
      }
      
      if (!newEmail.includes('@') || !newEmail.includes('.')) {
        showAlert('Invalid email format', 'error');
        return;
      }
      
      // Submit via AJAX
      try {
        const formData = new FormData(changeEmailForm);
        const response = await fetch('/api/change-email', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
          showAlert(data.message, 'success');
          changeEmailForm.reset();
        } else {
          showAlert(data.message, 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        showAlert('An error occurred. Please try again.', 'error');
      }
    });
  }
  
  // Logout button
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        location.href = '/api/logout';
      }
    });
  }
  
  // Toggle buttons
  document.getElementById('toggleToRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthForm('register');
  });
  
  document.getElementById('toggleToLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthForm('login');
  });
});
