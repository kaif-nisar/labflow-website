const form = document.getElementById('resetForm');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm-password');
const submitBtn = document.getElementById('submitBtn');
const successMessage = document.getElementById('successMessage');
const submissionError = document.getElementById('submission-error');
const errorMessages = {
    confirm: document.getElementById('confirm-error')
};
const requirementElements = {
    length: document.getElementById('length'),
    uppercase: document.getElementById('uppercase'),
    lowercase: document.getElementById('lowercase'),
    number: document.getElementById('number'),
    special: document.getElementById('special')
};

let isConfirmValid = false;

passwordInput.addEventListener('input', function () {
    const password = this.value;
    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*]/.test(password);

    // Just show warnings or suggestions, no blocking
    requirementElements.length.classList.toggle('valid', hasMinLength);
    requirementElements.uppercase.classList.toggle('valid', hasUpperCase);
    requirementElements.lowercase.classList.toggle('valid', hasLowerCase);
    requirementElements.number.classList.toggle('valid', hasNumber);
    requirementElements.special.classList.toggle('valid', hasSpecialChar);

    // If confirm is filled, re-validate match
    if (confirmInput.value) {
        validatePasswordMatch();
    } else {
        updateSubmitButton();
    }
});

confirmInput.addEventListener('input', validatePasswordMatch);

function validatePasswordMatch() {
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    isConfirmValid = password === confirm && password !== '';
    errorMessages.confirm.style.display = isConfirmValid ? 'none' : 'block';
    updateSubmitButton();
}

function updateSubmitButton() {
    // Enable if confirm password is valid (passwords match and not empty)
    submitBtn.disabled = !isConfirmValid;
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    submissionError.style.display = 'none';
    submissionError.textContent = '';
    if (isConfirmValid) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        const password = passwordInput.value;

        // Read token from URL
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const BASE_URL = window.location.origin;

        if (!token) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset Password';
            submissionError.textContent = 'Reset token is missing or invalid.';
            submissionError.style.display = 'block';
            return;
        }

        // Send request to backend
        await fetch(`${BASE_URL}/api/v1/user/resetPassword`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: token,
                newPassword: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.message === 'Password reset successful.') {
                form.style.display = 'none';
                successMessage.style.display = 'block';
            } else {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Reset Password';
                submissionError.textContent = data.message || 'An error occurred.';
                submissionError.style.display = 'block';
            }
        })
        .catch(err => {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset Password';
            submissionError.textContent = `Error: ${err.message}`;
            submissionError.style.display = 'block';
        });
    }
});

