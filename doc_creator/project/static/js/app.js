class DocGenerator {
    constructor() {
        this.form = document.getElementById('generatorForm');
        this.resultContainer = document.getElementById('resultContainer');
        this.statusMessage = document.getElementById('statusMessage');
        this.downloadLink = document.getElementById('downloadLink');
        this.spinner = this.form.querySelector('.spinner'); // Spinner is inside the button now
        this.submitButton = this.form.querySelector('button[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('.btn-content');
        // Get the CSRF token from the hidden input field
        this.csrfToken = document.querySelector('input[name="csrf_token"]').value;

        this.initializeEventListeners();
        console.debug('DocGenerator Initialized.');
    }

    initializeEventListeners() {
        if (!this.form) {
            console.error('Generator form not found!');
            return;
        }
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    async handleSubmit(e) {
        e.preventDefault(); // Prevent default form submission
        const promptInput = document.getElementById('promptInput');
        const prompt = promptInput.value.trim();

        if (!prompt) {
            this.showErrorState('Please enter a prompt.');
            promptInput.focus();
            return;
        }

        console.debug('Submission started. Prompt length:', prompt.length);
        this.showLoadingState('Generating...');
        this.clearPreviousResults();

        try {
            const response = await fetch('/generate-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Include the CSRF token in the request header
                    'X-CSRFToken': this.csrfToken
                    // REMOVED: 'Authorization': `Bearer ${await this.getApiKey()}` - Auth handled server-side now
                },
                body: JSON.stringify({ prompt: prompt }) // Send prompt in JSON body
            });

            // Try parsing JSON regardless of response.ok to get error details
            let data;
            try {
                 data = await response.json();
            } catch (jsonError) {
                // Handle cases where response is not valid JSON (e.g., server crash, network error)
                console.error('Failed to parse JSON response:', jsonError);
                // Throw a new error with info from the original response if possible
                throw new Error(`Server returned non-JSON response: ${response.status} ${response.statusText}`);
            }


            if (!response.ok) {
                // Use error message from server JSON if available, otherwise use status text
                const errorMessage = data?.error || data?.message || `Request failed with status ${response.status}`;
                throw new Error(errorMessage);
            }

            // --- Success ---
            if (!data.download_url || !data.filename) {
                console.error('Successful response missing download_url or filename:', data);
                throw new Error('Received invalid success response from server.');
            }

            console.info('Document generated successfully:', data.filename);
            this.showSuccessState(data.download_url, data.filename);

        } catch (error) {
            console.error('API Request Error:', error);
            // Display the error message caught (could be from fetch, JSON parse, or thrown above)
            this.showErrorState(error.message || 'An unknown error occurred.');
        } finally {
            this.hideLoadingState(); // Ensure loading state is always hidden
        }
    }

    // --- Helper methods ---
    showLoadingState(message = 'Loading...') {
        this.spinner.classList.remove('hidden');
        if (this.submitButtonText) this.submitButtonText.textContent = message;
        if (this.submitButton) this.submitButton.disabled = true;
    }

    hideLoadingState() {
        this.spinner.classList.add('hidden');
         if (this.submitButtonText) this.submitButtonText.textContent = 'Generate Document'; // Reset button text
        if (this.submitButton) this.submitButton.disabled = false;
    }

    showSuccessState(url, filename) {
        this.resultContainer.classList.remove('hidden');
        this.statusMessage.textContent = `Document '${filename}' generated successfully!`;
        this.statusMessage.style.color = 'var(--success-color)'; // Use CSS variable for color
        this.downloadLink.href = url;
        this.downloadLink.textContent = `Download ${filename}`;
        // Optional: Add download attribute to suggest filename to browser
        this.downloadLink.setAttribute('download', filename);
        this.downloadLink.classList.remove('hidden');
        this.downloadLink.focus(); // Focus link for accessibility
    }

    showErrorState(message) {
        this.resultContainer.classList.remove('hidden');
        this.statusMessage.textContent = `Error: ${message}`;
        this.statusMessage.style.color = 'var(--error-color)'; // Use CSS variable for color
        this.downloadLink.classList.add('hidden'); // Hide download link on error
        this.downloadLink.href = '#'; // Clear href
    }

    clearPreviousResults() {
        this.resultContainer.classList.add('hidden'); // Hide the whole container initially
        this.statusMessage.textContent = '';
        this.statusMessage.style.color = ''; // Reset color
        this.downloadLink.classList.add('hidden');
        this.downloadLink.href = '#';
        this.downloadLink.removeAttribute('download');
    }

    // REMOVED getApiKey() - No longer needed client-side
    // async getApiKey() {
    //     // THIS IS INSECURE - DO NOT HARDCODE KEYS HERE
    //     return 'test-api-key-1234abcd';
    // }
}

// Initialize application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        new DocGenerator();
    } catch (error) {
        console.error("Failed to initialize DocGenerator:", error);
        // Optionally display an error to the user if init fails critically
        const body = document.querySelector('body');
        if (body) {
            const errorMsg = document.createElement('p');
            errorMsg.textContent = 'Error initializing the application. Please check the console or contact support.';
            errorMsg.style.color = 'red';
            errorMsg.style.textAlign = 'center';
            body.prepend(errorMsg); // Add error at the top
        }
    }
});