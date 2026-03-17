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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
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
