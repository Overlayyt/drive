// Configuration - Updated with your Drive folders
const DRIVE_FOLDER_IDS = {
  earrings: '1yWsTeNK2dNQHDQW8kmVmQi9HYt2KS31R',
  necklaces: '18eo7br_goagjXem99wQ27EgpdlcQ9aG7'
};

// DOM Elements
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const loadingIndicator = document.getElementById('loading-indicator');

// App State
let currentMode = null;
let currentEarring = null;
let currentNecklace = null;
let jewelryCache = { earrings: [], necklaces: [] };
let faceMesh = null;
let camera = null;

// Face Mesh Landmark Positions
let leftEarPositions = [];
let rightEarPositions = [];
let chinPositions = [];

// Utility Functions
function showLoading(show) {
  loadingIndicator.style.display = show ? 'block' : 'none';
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.position = 'fixed';
  errorDiv.style.bottom = '20px';
  errorDiv.style.left = '50%';
  errorDiv.style.transform = 'translateX(-50%)';
  errorDiv.style.backgroundColor = 'rgba(255,0,0,0.7)';
  errorDiv.style.color = 'white';
  errorDiv.style.padding = '10px 20px';
  errorDiv.style.borderRadius = '5px';
  errorDiv.style.zIndex = '1000';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}

// Smoothing function for landmarks
function smooth(positions) {
  if (!positions || positions.length === 0) return null;
  const sum = positions.reduce((acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }), { x: 0, y: 0 });
  return { x: sum.x / positions.length, y: sum.y / positions.length };
}

// Load image with error handling
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.error("Failed to load image:", src);
      resolve(null);
    };
    img.src = src;
  });
}

// Fetch images from Google Drive folder
async function fetchDriveFolder(folderType) {
  showLoading(true);
  
  try {
    const folderId = DRIVE_FOLDER_IDS[folderType];
    const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`);
    const html = await response.text();
    
    // Parse HTML to extract file IDs
    const regex = /\["https:\/\/drive\.google\.com\/open\?id=([^"]+)"/g;
    const fileIds = new Set();
    let match;
    
    while ((match = regex.exec(html))) {
      fileIds.add(match[1]);
    }
    
    // Update cache with direct image URLs
    jewelryCache[folderType] = Array.from(fileIds).map(id => ({
      id,
      url: `https://drive.google.com/uc?export=view&id=${id}`
    }));
    
    // Refresh UI options
    refreshJewelryOptions(folderType);
  } catch (error) {
    console.error(`Error loading ${folderType}:`, error);
    showError(`Failed to load ${folderType}. Please check your internet connection.`);
  } finally {
    showLoading(false);
  }
}

// Refresh jewelry options UI
function refreshJewelryOptions(folderType) {
  const container = document.getElementById(`${folderType}-options`);
  container.innerHTML = '';
  
  jewelryCache[folderType].forEach(async (file, index) => {
    const button = document.createElement('button');
    const img = document.createElement('img');
    
    img.src = file.url;
    img.alt = `${folderType} ${index + 1}`;
    img.style.width = '60px';
    img.style.height = '60px';
    img.style.borderRadius = '12px';
    img.style.transition = 'border 0.2s ease, transform 0.2s ease';
    
    button.appendChild(img);
    button.onclick = async () => {
      const loadedImg = await loadImage(file.url);
      if (folderType === 'earrings') {
        currentEarring = loadedImg;
      } else {
        currentNecklace = loadedImg;
      }
    };
    
    container.appendChild(button);
  });
}

// Select jewelry mode
function selectMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.options-group').forEach(g => g.style.display = 'none');
  document.getElementById(`${mode}-options`).style.display = 'flex';
  
  // Load images if not cached
  if (jewelryCache[mode].length === 0) {
    fetchDriveFolder(mode);
  }
}

// Take snapshot function
function takeSnapshot() {
  if (!videoElement.videoWidth) {
    showError("Camera not ready. Please wait and try again.");
    return;
  }

  const snapshotCanvas = document.createElement('canvas');
  const ctx = snapshotCanvas.getContext('2d');

  snapshotCanvas.width = videoElement.videoWidth;
  snapshotCanvas.height = videoElement.videoHeight;

  // Draw video frame
  ctx.drawImage(videoElement, 0, 0, snapshotCanvas.width, snapshotCanvas.height);

  // Draw selected jewelry
  if (currentMode === 'earrings' && currentEarring) {
    const leftSmooth = smooth(leftEarPositions);
    const rightSmooth = smooth(rightEarPositions);
    if (leftSmooth) ctx.drawImage(currentEarring, leftSmooth.x - 60, leftSmooth.y, 100, 100);
    if (rightSmooth) ctx.drawImage(currentEarring, rightSmooth.x - 20, rightSmooth.y, 100, 100);
  } else if (currentMode === 'necklaces' && currentNecklace) {
    const chinSmooth = smooth(chinPositions);
    if (chinSmooth) ctx.drawImage(currentNecklace, chinSmooth.x - 100, chinSmooth.y, 200, 100);
  }

  // Download the image
  const dataURL = snapshotCanvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = `jewelry-tryon-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Initialize Face Mesh
async function initFaceMesh() {
  try {
    faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // Get ear and chin positions
        const left = {
          x: landmarks[132].x * canvasElement.width,
          y: landmarks[132].y * canvasElement.height - 20,
        };

        const right = {
          x: landmarks[361].x * canvasElement.width,
          y: landmarks[361].y * canvasElement.height - 20,
        };

        const chin = {
          x: landmarks[152].x * canvasElement.width,
          y: landmarks[152].y * canvasElement.height + 10,
        };

        // Add to smoothing buffers
        leftEarPositions.push(left);
        rightEarPositions.push(right);
        chinPositions.push(chin);
        if (leftEarPositions.length > 5) leftEarPositions.shift();
        if (rightEarPositions.length > 5) rightEarPositions.shift();
        if (chinPositions.length > 5) chinPositions.shift();

        // Get smoothed positions
        const leftSmooth = smooth(leftEarPositions);
        const rightSmooth = smooth(rightEarPositions);
        const chinSmooth = smooth(chinPositions);

        // Draw selected jewelry
        if (currentMode === 'earrings' && currentEarring) {
          if (leftSmooth) canvasCtx.drawImage(currentEarring, leftSmooth.x - 60, leftSmooth.y, 100, 100);
          if (rightSmooth) canvasCtx.drawImage(currentEarring, rightSmooth.x - 20, rightSmooth.y, 100, 100);
        } else if (currentMode === 'necklaces' && currentNecklace && chinSmooth) {
          canvasCtx.drawImage(currentNecklace, chinSmooth.x - 100, chinSmooth.y, 200, 100);
        }
      }
    });
  } catch (error) {
    console.error("FaceMesh initialization failed:", error);
    showError("Failed to initialize AR features. Please try refreshing the page.");
  }
}

// Initialize Camera
async function initCamera() {
  try {
    // First check if browser supports mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera API not supported in this browser");
    }
    
    // Try to get camera stream
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    
    // Connect stream to video element
    videoElement.srcObject = stream;
    
    // Wait for video to be ready
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = resolve;
    });
    
    // Set canvas size
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    // Start face mesh processing
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (faceMesh) {
          await faceMesh.send({ image: videoElement });
        }
      },
      width: videoElement.videoWidth,
      height: videoElement.videoHeight,
    });
    await camera.start();
    
    console.log("Camera started successfully");
    return true;
    
  } catch (error) {
    console.error("Camera initialization failed:", error);
    
    let errorMessage;
    if (error.name === 'NotAllowedError') {
      errorMessage = "Camera access was denied. Please allow camera permissions to use this feature.";
    } else if (error.name === 'NotFoundError') {
      errorMessage = "No camera found on this device.";
    } else if (error.name === 'NotReadableError') {
      errorMessage = "Camera is already in use by another application.";
    } else {
      errorMessage = "Failed to access camera: " + error.message;
    }
    
    showError(errorMessage);
    return false;
  }
}

// Initialize the application
async function initApp() {
  showLoading(true);
  try {
    await initFaceMesh();
    const cameraSuccess = await initCamera();
    
    if (cameraSuccess) {
      // Auto-refresh jewelry options every 5 minutes
      setInterval(() => {
        if (currentMode) {
          fetchDriveFolder(currentMode);
        }
      }, 300000);
    }
  } catch (error) {
    console.error("App initialization failed:", error);
    showError("Failed to initialize application. Please try refreshing the page.");
  } finally {
    showLoading(false);
  }
}

// Start the app when page loads
document.addEventListener('DOMContentLoaded', initApp);