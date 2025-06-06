class PhotoApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.stream = null;
        this.currentPhotoBlob = null;
        
        this.initializeElements();
        this.bindEvents();
        this.loadPhotos();
    }

    initializeElements() {
        this.startCameraBtn = document.getElementById('startCameraBtn');
        this.stopCameraBtn = document.getElementById('stopCameraBtn');
        this.captureBtn = document.getElementById('captureBtn');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.fileInput = document.getElementById('fileInput');
        this.previewSection = document.getElementById('previewSection');
        this.previewImage = document.getElementById('previewImage');
        this.savePhotoBtn = document.getElementById('savePhotoBtn');
        this.retakeBtn = document.getElementById('retakeBtn');
        this.loadingSection = document.getElementById('loadingSection');
        this.photosList = document.getElementById('photosList');
        this.emptyState = document.getElementById('emptyState');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.photoModal = document.getElementById('photoModal');
        this.modalImage = document.getElementById('modalImage');
        this.modalDescription = document.getElementById('modalDescription');
        this.modalMetadata = document.getElementById('modalMetadata');
        this.deletePhotoBtn = document.getElementById('deletePhotoBtn');
        this.closeModal = document.querySelector('.close');
        
        this.currentPhotoId = null;
    }

    bindEvents() {
        this.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
        this.captureBtn.addEventListener('click', () => this.capturePhoto());
        this.uploadBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        this.savePhotoBtn.addEventListener('click', () => this.savePhoto());
        this.retakeBtn.addEventListener('click', () => this.retakePhoto());
        this.refreshBtn.addEventListener('click', () => this.loadPhotos());
        this.deletePhotoBtn.addEventListener('click', () => this.deletePhoto());
        this.closeModal.addEventListener('click', () => this.closePhotoModal());
        
        // Close modal when clicking outside
        this.photoModal.addEventListener('click', (e) => {
            if (e.target === this.photoModal) {
                this.closePhotoModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closePhotoModal();
            }
            if (e.key === ' ' && this.stream) {
                e.preventDefault();
                this.capturePhoto();
            }
        });
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment' // Use back camera on mobile
                } 
            });
            
            this.video.srcObject = this.stream;
            this.startCameraBtn.style.display = 'none';
            this.stopCameraBtn.style.display = 'inline-block';
            this.captureBtn.style.display = 'block';
            
            this.showNotification('Camera started successfully!', 'success');
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.showNotification('Error accessing camera. Please check permissions.', 'error');
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
        }
        
        this.startCameraBtn.style.display = 'inline-block';
        this.stopCameraBtn.style.display = 'none';
        this.captureBtn.style.display = 'none';
        this.hidePreview();
    }

    capturePhoto() {
        if (!this.stream) return;

        // Set canvas dimensions to match video
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        // Draw video frame to canvas
        this.ctx.drawImage(this.video, 0, 0);
        
        // Convert to blob
        this.canvas.toBlob((blob) => {
            this.currentPhotoBlob = blob;
            this.showPreview(URL.createObjectURL(blob));
        }, 'image/jpeg', 0.8);
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            this.currentPhotoBlob = file;
            this.showPreview(URL.createObjectURL(file));
        }
    }

    showPreview(imageUrl) {
        this.previewImage.src = imageUrl;
        this.previewSection.style.display = 'block';
        this.previewSection.scrollIntoView({ behavior: 'smooth' });
    }

    hidePreview() {
        this.previewSection.style.display = 'none';
        this.currentPhotoBlob = null;
    }

    retakePhoto() {
        this.hidePreview();
        if (this.previewImage.src) {
            URL.revokeObjectURL(this.previewImage.src);
        }
    }

    async savePhoto() {
        if (!this.currentPhotoBlob) return;

        this.showLoading(true);
        try {
            const formData = new FormData();
            formData.append('photo', this.currentPhotoBlob, 'photo.jpg');

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            let result, text;
            try {
                text = await response.text();
                result = JSON.parse(text);
            } catch (jsonErr) {
                this.showNotification('Server error: ' + (text || 'Invalid JSON'), 'error');
                throw new Error('Invalid JSON: ' + (text || 'No response body'));
            }

            if (result.success) {
                this.showNotification('Photo saved successfully!', 'success');
                this.hidePreview();
                this.loadPhotos();
                if (this.previewImage.src) {
                    URL.revokeObjectURL(this.previewImage.src);
                }
            } else {
                throw new Error(result.error || 'Failed to save photo');
            }
        } catch (error) {
            console.error('Error saving photo:', error);
            this.showNotification('Error saving photo: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadPhotos() {
        try {
            const response = await fetch('/api/photos');
            const photos = await response.json();

            this.displayPhotos(photos);
        } catch (error) {
            console.error('Error loading photos:', error);
            this.showNotification('Error loading photos', 'error');
        }
    }

    displayPhotos(photos) {
        this.photosList.innerHTML = '';

        if (!Array.isArray(photos) || photos.length === 0) {
            this.emptyState.style.display = 'block';
            return;
        }

        this.emptyState.style.display = 'none';

        photos.forEach(photo => {
            // Defensive: skip photos without expected structure
            if (!photo || (!photo.metadata && (!photo.detectedObjects || !photo.filename))) return;
            // If photo.metadata is missing, synthesize it from root fields (for backward compatibility)
            if (!photo.metadata) {
                photo.metadata = {
                    detectedObjects: photo.detectedObjects || [],
                    size: photo.size,
                    mimetype: photo.mimetype,
                    filename: photo.filename
                };
            }
            const photoCard = this.createPhotoCard(photo);
            this.photosList.appendChild(photoCard);
        });
    }

    createPhotoCard(photo) {
        const card = document.createElement('div');
        card.className = 'photo-card';
        card.addEventListener('click', () => this.openPhotoModal(photo));

        const date = new Date(photo.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Create objects list
        let objectsList = '';
        if (photo.metadata.detectedObjects && photo.metadata.detectedObjects.length > 0) {
            const objectNames = photo.metadata.detectedObjects.map(obj => obj.name).slice(0, 5);
            objectsList = `
                <div class="objects-list">
                    <strong>Objects:</strong> ${objectNames.join(', ')}
                    ${photo.metadata.detectedObjects.length > 5 ? ` +${photo.metadata.detectedObjects.length - 5} more` : ''}
                </div>
            `;
        }

        card.innerHTML = `
            <img src="/uploads/${photo.filename}" alt="${photo.description}" loading="lazy">
            <div class="photo-info">
                <h3>📷 Photo Analysis</h3>
                ${objectsList}
                <div class="photo-meta">
                    Size: ${this.formatFileSize(photo.metadata.size)} | 
                    Type: ${photo.metadata.mimetype}
                </div>
                <div class="photo-date">${date}</div>
            </div>
        `;

        return card;
    }

    openPhotoModal(photo) {
        this.currentPhotoId = photo.id;
        this.modalImage.src = `/uploads/${photo.filename}`;
        
        // Create a better display for detected objects
        if (photo.metadata.detectedObjects && photo.metadata.detectedObjects.length > 0) {
            this.modalDescription.innerHTML = `
                <div class="detected-objects">
                    <h4>🔍 Detected Objects:</h4>
                    <div class="objects-grid">
                        ${photo.metadata.detectedObjects.map(obj => `
                            <div class="object-item">
                                <span class="object-name">${obj.name}</span>
                                <span class="object-confidence">${Math.round(obj.confidence * 100)}%</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            this.modalDescription.textContent = 'No objects detected in this image';
        }
        
        const metadataText = JSON.stringify(photo.metadata, null, 2);
        this.modalMetadata.textContent = metadataText;
        
        this.photoModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    closePhotoModal() {
        this.photoModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        this.currentPhotoId = null;
    }

    async deletePhoto() {
        if (!this.currentPhotoId) return;

        if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/photos/${this.currentPhotoId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('Photo deleted successfully!', 'success');
                this.closePhotoModal();
                this.loadPhotos();
            } else {
                throw new Error(result.error || 'Failed to delete photo');
            }
        } catch (error) {
            console.error('Error deleting photo:', error);
            this.showNotification('Error deleting photo: ' + error.message, 'error');
        }
    }

    showLoading(show) {
        this.loadingSection.style.display = show ? 'block' : 'none';
        if (show) {
            this.loadingSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '10000',
            maxWidth: '300px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease'
        });

        // Set background color based on type
        const colors = {
            success: '#2ed573',
            error: '#ff4757',
            info: '#5352ed',
            warning: '#ffa502'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        // Add to page
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after delay
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PhotoApp();
});

// Service Worker registration for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
