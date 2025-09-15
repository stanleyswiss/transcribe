class TranscriptionApp {
    constructor() {
        this.selectedFile = null;
        this.currentTranscription = null;
        this.progressInterval = null;
        this.currentStage = null;
        this.startTime = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        console.log('Teams Transcription App ready - with chunking support');
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
        this.showFileInfo(file);
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
        if (!this.selectedFile) {
            this.showError('No file selected');
            return;
        }

        try {
            this.startTime = Date.now();
            this.showProgress();
            
            const isVideo = this.selectedFile.type.startsWith('video/');
            const sizeMB = Math.round(this.selectedFile.size / 1024 / 1024);
            
            this.updateProgress(1, 'Initializing upload...', `Preparing ${sizeMB}MB ${isVideo ? 'video' : 'audio'} file`);

            const transcription = await this.transcribeFile(this.selectedFile);
            
            this.updateProgress(100, 'Transcription complete!', 'Processing finished successfully');
            setTimeout(() => this.showResult(transcription), 500);

        } catch (error) {
            console.error('Processing error:', error);
            this.showError(error.message || 'Failed to process file');
        }
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
            xhr.send(formData);
        });
    }

    startProcessingProgressSimulation(isVideo, sizeMB) {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }

        let currentProgress = 25;
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

        let fileInfo = `${result.filename} (${result.fileType})`;
        
        if (result.chunksProcessed > 1) {
            fileInfo += ` • Processed in ${result.chunksProcessed} chunks`;
        }
        
        if (result.savedToFile) {
            fileInfo += ` • Saved as ${result.transcriptionFile}`;
        }

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

    downloadTranscription() {
        if (!this.currentTranscription) return;

        const filename = this.currentTranscription.filename || 'transcription';
        const text = this.currentTranscription.transcription;
        
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace(/\.[^/.]+$/, '') + '_transcription.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    resetApp() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        this.selectedFile = null;
        this.currentTranscription = null;
        this.startTime = null;
        document.getElementById('fileInput').value = '';
        this.hideOtherSections();
    }
}

// Global functions for HTML onclick handlers
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
    .catch(err => console.warn('Server health check failed:', err));
