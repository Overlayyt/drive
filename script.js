// Configuration - REPLACE THESE WITH YOUR DRIVE FOLDER IDs
const DRIVE_FOLDER_IDS = {
  earrings: '1yWsTeNK2dNQHDQW8kmVmQi9HYt2KS31R',  // Replace with your earrings folder ID
  necklaces: '18eo7br_goagjXem99wQ27EgpdlcQ9aG7' // Replace with your necklaces folder ID
};

// DOM Elements
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

// App State
let currentMode = null;
let currentEarring = null;
let currentNecklace = null;
let jewelryCache = { earrings: [], necklaces: [] };

// Face Mesh Landmark Positions
let leftEarPositions = [];
let rightEarPositions = [];
let chinPositions = [];

// Initialize Face Mesh
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

// Smoothing function for landmarks
function smooth(positions) {
  if (positions.length === 0) return null;
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
    
    while ((match = regex.exec(html)) {
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

// Show/hide loading indicator
function showLoading(show) {
  document.getElementById('loading-indicator').style.display = show ? 'block' : 'none';
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

// Face Mesh results handler
faceMesh.onResults((results) => {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks.length > 0) {
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

// Initialize camera
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await faceMesh.send({ image: videoElement });
  },
  width: 1280,
  height: 720,
});
camera.start();

// Set canvas size when video loads
videoElement.addEventListener('loadedmetadata', () => {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
});

// Auto-refresh jewelry options every 5 minutes
setInterval(() => {
  if (currentMode) {
    fetchDriveFolder(currentMode);
  }
}, 300000);