// Simple authentication version that uses JWT tokens instead of Clerk

class TranscriptionApp {
    constructor() {
        this.selectedFile = null;
        this.selectedServerFile = null;
        this.serverFiles = [];
        this.currentTranscription = null;
        this.progressInterval = null;
        this.currentStage = null;
        this.startTime = null;
        this.authToken = localStorage.getItem('authToken');
        this.init();
    }

    init() {
        // Check authentication first
        if (!this.authToken) {
            window.location.href = '/auth.html';
            return;
        }
        
        this.checkAuth();
        this.setupEventListeners();
        console.log('Teams Transcription App ready - with chunking support');
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/auth/check', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            if (!response.ok) {
                localStorage.removeItem('authToken');
                window.location.href = '/auth.html';
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.removeItem('authToken');
            window.location.href = '/auth.html';
        }
    }

    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.authToken}`
        };
    }

    setupEventListeners() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        dropZone.addEventListener('click', () => {
            fileInput.click();
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    // Copy all the other methods from the original app.js
    // but use this.getAuthHeaders() instead of this.getAuthHeaders() promise

    // ... rest of the methods remain the same ...
}

// Global functions
function signOut() {
    localStorage.removeItem('authToken');
    window.location.href = '/auth.html';
}

function processFile() {
    app.processFile();
}

function copyTranscription() {
    app.copyTranscription();
}

function downloadTranscription() {
    app.downloadTranscription();
}

function resetApp() {
    app.resetApp();
}

// Initialize app when page loads
const app = new TranscriptionApp();

// Health check
fetch('/health')
    .then(response => response.json())
    .then(data => console.log('Server health:', data))
    .catch(error => console.error('Health check failed:', error));