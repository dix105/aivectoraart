document.addEventListener('DOMContentLoaded', () => {
    
    // ==============================================
    // MOBILE MENU TOGGLE
    // ==============================================
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });
        
        // Close menu when clicking a link
        document.querySelectorAll('header nav a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    // ==============================================
    // FAQ ACCORDION
    // ==============================================
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close all others
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
                otherItem.querySelector('.faq-answer').style.maxHeight = null;
            });
            
            // Toggle current
            if (!isActive) {
                item.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });

    // ==============================================
    // MODAL LOGIC (Privacy & Terms)
    // ==============================================
    function openModal(id) {
        const modal = document.getElementById(id + '-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }
    }

    function closeModal(id) {
        const modal = document.getElementById(id + '-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    // Open triggers
    document.querySelectorAll('[data-modal-target]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const id = trigger.getAttribute('data-modal-target');
            openModal(id);
        });
    });

    // Close triggers
    document.querySelectorAll('[data-modal-close]').forEach(trigger => {
        trigger.addEventListener('click', () => {
            const id = trigger.getAttribute('data-modal-close');
            closeModal(id);
        });
    });

    // Close on click outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });

    // ==============================================
    // PLAYGROUND / BACKEND INTEGRATION
    // ==============================================
    
    // --- 1. CORE API & HELPER FUNCTIONS ---

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix unless required)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        // Endpoint: https://api.chromastudio.ai/get-emd-upload-url?fileName=...
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        // Domain: contents.maxstudio.ai
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        return downloadUrl;
    }

    // Store the uploaded URL globally
    let currentUploadedUrl = null;

    // Submit generation job (Image or Video)
    async function submitImageGenJob(imageUrl) {
        const isVideo = 'image-effects' === 'video-effects'; // Config check
        const endpoint = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        
        // Video-specific headers
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        // Construct payload based on type
        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl], // Video API expects array
                effectId: 'photoToVectorArt',
                userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
                removeWatermark: true,
                model: 'video-effects',
                isPrivate: true
            };
        } else {
            body = {
                model: 'image-effects',
                toolType: 'image-effects',
                effectId: 'photoToVectorArt',
                imageUrl: imageUrl, // Image API expects string
                userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
                removeWatermark: true,
                isPrivate: true
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // Poll job status until completed or failed
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const POLL_INTERVAL = 2000; // 2 seconds
    const MAX_POLLS = 60; // Max 2 minutes of polling

    async function pollJobStatus(jobId) {
        const isVideo = 'image-effects' === 'video-effects';
        const baseUrl = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // --- 2. UI HELPER FUNCTIONS ---

    function showLoading() {
        const loader = document.getElementById('loading-state');
        const resultPlaceholder = document.querySelector('.result-placeholder');
        const resultFinal = document.getElementById('result-final');
        
        if (loader) {
            loader.style.display = 'flex';
            loader.classList.remove('hidden');
        }
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        if (resultFinal) resultFinal.classList.add('hidden');
    }

    function hideLoading() {
        const loader = document.getElementById('loading-state');
        if (loader) {
            loader.style.display = 'none';
            loader.classList.add('hidden');
        }
    }

    function updateStatus(text) {
        // Update button text to reflect status
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING')) {
                generateBtn.disabled = true;
                generateBtn.textContent = text;
            } else if (text === 'READY') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Vector Art';
            } else if (text === 'COMPLETE') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Again';
            } else if (text === 'ERROR') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Try Again';
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg); 
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Vector Art';
        }
    }

    function showPreview(url) {
        const img = document.getElementById('preview-image');
        const uploadContent = document.querySelector('.upload-content');
        const resetBtn = document.getElementById('reset-btn');
        
        if (img) {
            img.src = url;
            img.classList.remove('hidden');
            img.style.display = 'block';
        }
        if (uploadContent) uploadContent.classList.add('hidden');
        if (resetBtn) resetBtn.classList.remove('hidden');
    }

    function showResultMedia(url) {
        const resultImg = document.getElementById('result-final');
        const container = resultImg ? resultImg.parentElement : document.querySelector('.result-area');
        
        if (!container) return;
        
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        if (isVideo) {
            // Hide image
            if (resultImg) {
                resultImg.style.display = 'none';
                resultImg.classList.add('hidden');
            }
            
            // Show/Create video
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.className = resultImg ? resultImg.className : '';
                video.style.width = '100%';
                video.style.height = 'auto';
                video.style.borderRadius = '8px';
                video.style.maxWidth = '100%';
                container.appendChild(video);
            }
            video.src = url;
            video.style.display = 'block';
            video.classList.remove('hidden');
        } else {
            // Hide video
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            // Show image
            if (resultImg) {
                resultImg.style.display = 'block';
                resultImg.classList.remove('hidden');
                resultImg.crossOrigin = 'anonymous';
                resultImg.src = url;
                // Remove the demo filter if it existed in CSS/Previous logic
                resultImg.style.filter = 'none';
            }
        }
    }

    function showDownloadButton(url) {
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.classList.remove('disabled');
            downloadBtn.style.display = 'inline-block';
        }
    }

    // --- 3. HANDLERS ---

    // Handler when file is selected - uploads immediately
    async function handleFileSelect(file) {
        if (!file) return;

        try {
            // Show UI immediately that we are working
            document.querySelector('.upload-content').classList.add('hidden');
            const previewImg = document.getElementById('preview-image');
            if (previewImg) {
                // Temporary local preview while uploading (optional, but good UX)
                previewImg.src = URL.createObjectURL(file);
                previewImg.classList.remove('hidden');
                previewImg.style.display = 'block';
            }
            
            const resetBtn = document.getElementById('reset-btn');
            if (resetBtn) resetBtn.classList.remove('hidden');

            updateStatus('UPLOADING...');
            
            // Upload immediately when file is selected
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Confirm preview with CDN URL
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            
        } catch (error) {
            console.error(error);
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // Handler when Generate button is clicked - submits job and polls for result
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert('Please upload an image first.');
            return;
        }
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // Step 1: Submit job to ChromaStudio API
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('JOB QUEUED...');
            
            // Step 2: Poll for completion
            const result = await pollJobStatus(jobData.jobId);
            
            // Step 3: Get the result image URL from response
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                console.error('Response:', result);
                throw new Error('No image URL in response');
            }
            
            // Step 4: Display result
            showResultMedia(resultUrl);
            
            updateStatus('COMPLETE');
            hideLoading();
            showDownloadButton(resultUrl);
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // --- 4. EVENT LISTENERS & DOM WIRING ---

    const fileInput = document.getElementById('file-input');
    const uploadZone = document.getElementById('upload-zone');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');

    // File Input Change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Drag & Drop
    if (uploadZone) {
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.backgroundColor = 'var(--background-alt)';
        });

        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadZone.style.backgroundColor = '';
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.backgroundColor = '';
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        });
        
        // Click to upload
        uploadZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentUploadedUrl = null;
            
            // Reset UI
            if (fileInput) fileInput.value = '';
            
            const previewImage = document.getElementById('preview-image');
            if (previewImage) {
                previewImage.src = '';
                previewImage.classList.add('hidden');
                previewImage.style.display = 'none';
            }
            
            const uploadContent = document.querySelector('.upload-content');
            if (uploadContent) uploadContent.classList.remove('hidden');
            
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generate Vector Art';
            }
            
            if (resetBtn) resetBtn.classList.add('hidden');
            
            const resultFinal = document.getElementById('result-final');
            if (resultFinal) {
                resultFinal.src = '';
                resultFinal.classList.add('hidden');
                resultFinal.style.display = 'none';
            }
            
            const resultVideo = document.getElementById('result-video');
            if (resultVideo) resultVideo.style.display = 'none';
            
            const resultPlaceholder = document.querySelector('.result-placeholder');
            if (resultPlaceholder) resultPlaceholder.classList.remove('hidden');
            
            if (downloadBtn) {
                downloadBtn.classList.add('disabled');
                downloadBtn.style.display = 'none'; // Re-hide depending on CSS
            }
        });
    }

    // Download Button - Force download logic
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            // Prevent default href navigation if it exists
            e.preventDefault();
            
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.style.pointerEvents = 'none'; // Disable clicks
            
            try {
                // Fetch the file as a blob
                const response = await fetch(url, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (!response.ok) {
                    throw new Error('Failed to fetch file: ' + response.statusText);
                }
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                // Determine file extension
                const contentType = response.headers.get('content-type') || '';
                let extension = 'jpg';
                if (contentType.includes('video') || url.match(/\.(mp4|webm)/i)) {
                    extension = 'mp4';
                } else if (contentType.includes('png') || url.match(/\.png/i)) {
                    extension = 'png';
                } else if (contentType.includes('webp') || url.match(/\.webp/i)) {
                    extension = 'webp';
                }
                
                // Create download link
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'vector_art_' + generateNanoId(8) + '.' + extension;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Cleanup
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (err) {
                console.error('Download error:', err);
                
                // Fallback 1: Canvas for images
                try {
                    const img = document.getElementById('result-final');
                    if (img && img.style.display !== 'none' && img.complete && img.naturalWidth > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        canvas.toBlob((blob) => {
                            if (blob) {
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = 'vector_art_' + generateNanoId(8) + '.png';
                                link.click();
                                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
                            } else {
                                throw new Error('Canvas blob failed');
                            }
                        }, 'image/png');
                        return; // Success fallback
                    }
                } catch (canvasErr) {
                    console.error('Canvas fallback error:', canvasErr);
                }
                
                // Fallback 2: Direct open
                alert('Direct download failed. Opening in new tab.');
                window.open(url, '_blank');
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.style.pointerEvents = 'auto';
            }
        });
    }

    // ==============================================
    // SCROLL ANIMATIONS
    // ==============================================
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('section h2, .step-card, .feature-card, .gallery-item').forEach(el => {
        el.style.opacity = '0'; // Initial state
        observer.observe(el);
    });
});