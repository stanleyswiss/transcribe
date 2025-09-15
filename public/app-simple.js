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
            } else {
                // Show user info
                document.getElementById('userInfo').style.display = 'flex';
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

    handleFile(file) {
        console.log('File selected:', file.name, file.type, file.size);
        
        if (!this.isValidFile(file)) {
            this.showError('Please select a valid video or audio file (MP4, AVI, MOV, MP3, WAV, M4A, etc.)');
            return;
        }

        if (file.size > 1500 * 1024 * 1024) {
            this.showError('File too large. Please select a file smaller than 1.5GB.');
            return;
        }

        this.selectedFile = file;
        this.selectedServerFile = null; // Clear server file selection
        this.clearServerFileSelection();
        this.showFileInfo(file);
    }

    async loadServerFiles() {
        const loadBtn = document.getElementById('loadFilesBtn');
        const filesList = document.getElementById('serverFilesList');
        const filesGrid = document.getElementById('filesGrid');
        
        // Show loading state
        loadBtn.innerHTML = '<span class="loading"></span> Loading...';
        loadBtn.disabled = true;
        
        try {
            const authHeaders = this.getAuthHeaders();
            const response = await fetch('/api/server-files', {
                headers: authHeaders
            });
            const data = await response.json();
            
            this.serverFiles = data.files || [];
            
            if (this.serverFiles.length === 0) {
                filesGrid.innerHTML = '<div class="no-files-message">📁 No files found in uploads folder.<br><small>Upload files to your server uploads folder first.</small></div>';
            } else {
                this.renderServerFiles();
            }
            
            filesList.style.display = 'block';
            
        } catch (error) {
            console.error('Error loading server files:', error);
            this.showError('Failed to load server files: ' + error.message);
        } finally {
            loadBtn.innerHTML = '🔄 Refresh Files';
            loadBtn.disabled = false;
        }
    }

    renderServerFiles() {
        const filesGrid = document.getElementById('filesGrid');
        
        filesGrid.innerHTML = this.serverFiles.map((file, index) => {
            const isVideo = /\.(mp4|avi|mov|wmv|mkv|webm)$/i.test(file.name);
            const icon = isVideo ? '🎬' : (file.isTranscription ? '📝' : '🎵');
            const date = new Date(file.modified).toLocaleDateString();
            const time = new Date(file.modified).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            return `
                <div class="file-card${file.isTranscription ? ' transcription-file' : ''}" onclick="app.selectServerFile(${index})" id="serverFile${index}">
                    <div class="selected-indicator">✓</div>
                    <div class="file-card-header">
                        <div class="file-icon">${icon}</div>
                        <div class="file-name">${this.escapeHtml(file.name)}</div>
                    </div>
                    <div class="file-details">
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                        <div class="file-date">${date} at ${time}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectServerFile(index) {
        if (index < 0 || index >= this.serverFiles.length) return;
        
        const file = this.serverFiles[index];
        
        // Don't allow selection of transcription files for processing
        if (file.isTranscription) {
            this.showError('This is a transcription file. Please select a video or audio file to transcribe.');
            return;
        }
        
        // Clear previous selections
        this.clearServerFileSelection();
        this.selectedFile = null; // Clear local file selection
        
        // Select new file
        this.selectedServerFile = this.serverFiles[index];
        const card = document.getElementById(`serverFile${index}`);
        if (card) {
            card.classList.add('selected');
        }
        
        // Show file info
        this.showServerFileInfo(this.selectedServerFile);
    }

    clearServerFileSelection() {
        document.querySelectorAll('.file-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
    }

    showServerFileInfo(file) {
        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');

        fileName.textContent = file.name + ' (From Server)';
        fileSize.textContent = this.formatFileSize(file.size);
        
        const isVideo = /\.(mp4|avi|mov|wmv|mkv|webm)$/i.test(file.name);
        const sizeMB = Math.round(file.size / 1024 / 1024);
        
        if (isVideo) {
            fileName.textContent += ' (Video - will extract audio)';
        } else {
            fileName.textContent += ' (Audio - ready for transcription)';
        }
        
        // Add processing time estimate
        const estimatedTime = this.estimateProcessingTime(file.size, isVideo);
        if (estimatedTime > 0) {
            const timeNote = document.createElement('div');
            timeNote.style.fontSize = '0.9em';
            timeNote.style.color = '#666';
            timeNote.style.marginTop = '5px';
            timeNote.textContent = `⏱️ Estimated processing time: ${estimatedTime} minutes`;
            fileName.parentNode.appendChild(timeNote);
        }
        
        // Add server processing note
        const serverNote = document.createElement('div');
        serverNote.style.fontSize = '0.9em';
        serverNote.style.color = '#28a745';
        serverNote.style.marginTop = '5px';
        serverNote.textContent = '🚀 Server file - no upload needed!';
        fileName.parentNode.appendChild(serverNote);
        
        fileInfo.style.display = 'block';
        this.hideOtherSections(['fileInfo']);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    isValidFile(file) {
        const validTypes = [
            'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/mkv', 'video/webm',
            'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/aac'
        ];
        
        return validTypes.some(type => file.type.includes(type.split('/')[1])) || 
               file.name.match(/\.(mp4|avi|mov|wmv|mkv|webm|mp3|wav|m4a|aac)$/i);
    }

    showFileInfo(file) {
        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');

        fileName.textContent = file.name;
        fileSize.textContent = this.formatFileSize(file.size);
        
        const isVideo = file.type.startsWith('video/');
        const sizeMB = Math.round(file.size / 1024 / 1024);
        
        if (isVideo) {
            fileName.textContent += ' (Video - will extract audio)';
        } else {
            fileName.textContent += ' (Audio - ready for transcription)';
        }
        
        // Add processing time estimate
        const estimatedTime = this.estimateProcessingTime(file.size, isVideo);
        if (estimatedTime > 0) {
            const timeNote = document.createElement('div');
            timeNote.style.fontSize = '0.9em';
            timeNote.style.color = '#666';
            timeNote.style.marginTop = '5px';
            timeNote.textContent = `⏱️ Estimated processing time: ${estimatedTime} minutes`;
            fileName.parentNode.appendChild(timeNote);
        }
        
        // Add chunking info for large files
        if (sizeMB > 100) {
            const chunkNote = document.createElement('div');
            chunkNote.style.fontSize = '0.9em';
            chunkNote.style.color = '#666';
            chunkNote.style.marginTop = '5px';
            chunkNote.textContent = '📝 Large file will be processed in chunks for best accuracy';
            fileName.parentNode.appendChild(chunkNote);
        }
        
        fileInfo.style.display = 'block';
        this.hideOtherSections(['fileInfo']);
    }

    estimateProcessingTime(fileSize, isVideo) {
        const sizeMB = fileSize / (1024 * 1024);
        
        if (isVideo) {
            // Video files: ~1-2 minutes per 100MB + transcription time
            const extractionTime = Math.max(1, sizeMB / 100);
            const estimatedAudioSize = sizeMB * 0.05; // Rough estimate: audio is ~5% of video size
            const transcriptionTime = Math.max(2, estimatedAudioSize / 10); // ~1 minute per 10MB of audio
            return Math.ceil(extractionTime + transcriptionTime);
        } else {
            // Audio files: mainly transcription time
            const transcriptionTime = Math.max(2, sizeMB / 10);
            return Math.ceil(transcriptionTime);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async processFile() {
        if (!this.selectedFile && !this.selectedServerFile) {
            this.showError('No file selected');
            return;
        }

        try {
            this.startTime = Date.now();
            this.showProgress();
            
            let transcription;
            
            if (this.selectedServerFile) {
                // Process server file
                const isVideo = /\.(mp4|avi|mov|wmv|mkv|webm)$/i.test(this.selectedServerFile.name);
                const sizeMB = Math.round(this.selectedServerFile.size / 1024 / 1024);
                
                this.updateProgress(1, 'Processing server file...', `Processing ${sizeMB}MB ${isVideo ? 'video' : 'audio'} file from server`);
                transcription = await this.transcribeServerFile(this.selectedServerFile);
                
            } else {
                // Process uploaded file
                const isVideo = this.selectedFile.type.startsWith('video/');
                const sizeMB = Math.round(this.selectedFile.size / 1024 / 1024);
                
                this.updateProgress(1, 'Initializing upload...', `Preparing ${sizeMB}MB ${isVideo ? 'video' : 'audio'} file`);
                transcription = await this.transcribeFile(this.selectedFile);
            }
            
            this.updateProgress(100, 'Transcription complete!', 'Processing finished successfully');
            setTimeout(() => this.showResult(transcription), 500);

        } catch (error) {
            console.error('Processing error:', error);
            this.showError(error.message || 'Failed to process file');
        }
    }

    async transcribeServerFile(serverFile) {
        const isVideo = /\.(mp4|avi|mov|wmv|mkv|webm)$/i.test(serverFile.name);
        const sizeMB = Math.round(serverFile.size / 1024 / 1024);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Immediately start processing progress simulation (no upload needed)
            this.updateProgress(10, 'Server file located', 'File found on server, starting processing...');
            this.startProcessingProgressSimulation(isVideo, sizeMB, 15); // Start from 15%

            xhr.addEventListener('load', () => {
                // STOP progress simulation immediately when response arrives
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }
                
                if (xhr.status === 200) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        console.log('Server response:', result); // Debug logging
                        if (result.success) {
                            resolve(result);
                        } else {
                            reject(new Error(result.error || 'Transcription failed'));
                        }
                    } catch (e) {
                        console.error('JSON parse error:', e, 'Response:', xhr.responseText);
                        reject(new Error('Invalid response from server'));
                    }
                } else {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        reject(new Error(errorData.error || `HTTP ${xhr.status}`));
                    } catch (e) {
                        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                    }
                }
            });

            xhr.addEventListener('error', () => {
                // Stop progress simulation on error too
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }
                reject(new Error('Network error occurred'));
            });

            xhr.open('POST', '/api/transcribe-server-file');
            xhr.setRequestHeader('Content-Type', 'application/json');
            
            // Add auth headers
            const authHeaders = this.getAuthHeaders();
            Object.entries(authHeaders).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
            });
            
            xhr.send(JSON.stringify({ filename: serverFile.name }));
        });
    }

    async transcribeFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const isVideo = file.type.startsWith('video/');
        const sizeMB = Math.round(file.size / 1024 / 1024);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Track upload progress (0-20%)
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const uploadPercent = Math.round((e.loaded / e.total) * 20); // Upload is 20% of total
                    const uploadedMB = Math.round(e.loaded / 1024 / 1024);
                    this.updateProgress(
                        uploadPercent, 
                        'Uploading file...', 
                        `Uploaded ${uploadedMB}MB of ${sizeMB}MB`
                    );
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        if (result.success) {
                            resolve(result);
                        } else {
                            reject(new Error(result.error || 'Transcription failed'));
                        }
                    } catch (e) {
                        reject(new Error('Invalid response from server'));
                    }
                } else {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        reject(new Error(errorData.error || `HTTP ${xhr.status}`));
                    } catch (e) {
                        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                    }
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Network error occurred'));
            });

            // Start processing progress simulation after upload
            xhr.addEventListener('readystatechange', () => {
                if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
                    this.updateProgress(25, 'Upload complete', 'Server received file, starting processing...');
                    this.startProcessingProgressSimulation(isVideo, sizeMB);
                }
            });

            xhr.open('POST', '/api/transcribe');
            
            // Add auth headers
            const authHeaders = this.getAuthHeaders();
            Object.entries(authHeaders).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
            });
            
            xhr.send(formData);
        });
    }

    startProcessingProgressSimulation(isVideo, sizeMB, startProgress = 25) {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }

        let currentProgress = startProgress;
        let stage = 0;
        
        const stages = isVideo ? [
            { end: 35, duration: 3000, message: 'Analyzing video file...', detail: 'Reading video metadata and streams' },
            { end: 55, duration: Math.max(8000, sizeMB * 50), message: 'Extracting audio from video...', detail: 'Converting video to high-quality audio' },
            { end: 65, duration: 2000, message: 'Audio extraction complete', detail: 'Checking audio file size for chunking' },
            { end: 75, duration: 3000, message: 'Preparing for transcription...', detail: 'Splitting large audio into optimal chunks' },
            { end: 85, duration: Math.max(10000, sizeMB * 200), message: 'Transcribing with AI...', detail: 'Processing audio chunks with OpenAI Whisper' },
            { end: 95, duration: 2000, message: 'Combining results...', detail: 'Merging chunk transcriptions into final text' },
            { end: 99, duration: 1000, message: 'Saving transcription...', detail: 'Writing final transcription to file' }
        ] : [
            { end: 35, duration: 2000, message: 'Analyzing audio file...', detail: 'Reading audio metadata and format' },
            { end: 50, duration: 3000, message: 'Preparing for transcription...', detail: 'Checking file size and splitting if needed' },
            { end: 85, duration: Math.max(8000, sizeMB * 150), message: 'Transcribing with AI...', detail: 'Processing audio with OpenAI Whisper' },
            { end: 95, duration: 2000, message: 'Combining results...', detail: 'Finalizing transcription text' },
            { end: 99, duration: 1000, message: 'Saving transcription...', detail: 'Writing transcription to file' }
        ];

        const progressStage = () => {
            if (stage >= stages.length) return;

            const currentStage = stages[stage];
            const progressPerStep = (currentStage.end - currentProgress) / (currentStage.duration / 500);
            
            const stepInterval = setInterval(() => {
                currentProgress = Math.min(currentProgress + progressPerStep, currentStage.end);
                
                this.updateProgress(
                    Math.round(currentProgress), 
                    currentStage.message, 
                    currentStage.detail
                );

                if (currentProgress >= currentStage.end) {
                    clearInterval(stepInterval);
                    stage++;
                    
                    if (stage < stages.length) {
                        setTimeout(progressStage, 500);
                    }
                }
            }, 500);
            
            this.progressInterval = stepInterval;
        };

        progressStage();
    }

    showProgress() {
        this.hideOtherSections(['progressSection']);
        document.getElementById('progressSection').style.display = 'block';
    }

    updateProgress(percentage, text, details = '') {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressPercentage = document.getElementById('progressPercentage');
        const progressDetails = document.getElementById('progressDetails');
        
        if (progressFill) progressFill.style.width = Math.min(percentage, 100) + '%';
        if (progressText) progressText.textContent = text;
        if (progressPercentage) progressPercentage.textContent = Math.min(percentage, 100) + '%';
        if (progressDetails) progressDetails.textContent = details;

        // Add elapsed time
        if (this.startTime && progressDetails) {
            const elapsed = Math.round((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            progressDetails.textContent = `${details} • Elapsed: ${timeStr}`;
        }
    }

    showResult(result) {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        this.currentTranscription = result;
        
        const resultSection = document.getElementById('resultSection');
        const transcriptionFile = document.getElementById('transcriptionFile');
        const transcriptionText = document.getElementById('transcriptionText');

        let fileInfo = result.transcriptionFile || 'transcription.txt';
        
        const totalTime = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        if (totalTime > 0) {
            const minutes = Math.floor(totalTime / 60);
            const seconds = totalTime % 60;
            const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            fileInfo += ` • Processing time: ${timeStr}`;
        }

        transcriptionFile.textContent = fileInfo;
        transcriptionText.textContent = result.transcription;

        this.hideOtherSections(['resultSection']);
        resultSection.style.display = 'block';
    }

    showError(message) {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        const errorSection = document.getElementById('errorSection');
        const errorMessage = document.getElementById('errorMessage');

        errorMessage.textContent = message;
        
        this.hideOtherSections(['errorSection']);
        errorSection.style.display = 'block';
    }

    hideOtherSections(except = []) {
        const sections = ['fileInfo', 'progressSection', 'resultSection', 'errorSection'];
        sections.forEach(section => {
            if (!except.includes(section)) {
                const element = document.getElementById(section);
                if (element) {
                    element.style.display = 'none';
                    // Clear any child elements that were dynamically added
                    const fileDetails = element.querySelector('.file-details');
                    if (fileDetails) {
                        const extraElements = fileDetails.querySelectorAll('div');
                        extraElements.forEach(el => el.remove());
                    }
                }
            }
        });
    }

    copyTranscription() {
        if (!this.currentTranscription) return;

        navigator.clipboard.writeText(this.currentTranscription.transcription).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard');
        });
    }

    async downloadTranscription() {
        if (!this.currentTranscription) return;

        const filename = this.currentTranscription.transcriptionFile || 'transcription.txt';
        
        try {
            const authHeaders = this.getAuthHeaders();
            const response = await fetch(`/api/download/${encodeURIComponent(filename)}`, {
                headers: authHeaders
            });
            
            if (!response.ok) {
                throw new Error('Download failed');
            }
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            // Fallback to downloading from memory if API fails
            const text = this.currentTranscription.transcription;
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    resetApp() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        this.selectedFile = null;
        this.selectedServerFile = null;
        this.currentTranscription = null;
        this.startTime = null;
        document.getElementById('fileInput').value = '';
        this.clearServerFileSelection();
        this.hideOtherSections();
    }
}

// Global functions for HTML onclick handlers
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