import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.128.0/examples/jsm/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls, mesh;
let wireframeMode = false;
let autoRotate = false;
let currentHeightData = null;

// DOM elements
const canvas = document.getElementById('canvas3d');
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const loading = document.getElementById('loading');
const progressFill = document.getElementById('progressFill');
const previewImg = document.getElementById('previewImg');
const imagePreview = document.getElementById('imagePreview');
const heightScale = document.getElementById('heightScale');
const heightValue = document.getElementById('heightValue');
const resolution = document.getElementById('resolution');
const colorMode = document.getElementById('colorMode');
const smoothing = document.getElementById('smoothing');

let currentImageData = null;

// Initialize 3D scene
function init3D() {
    const container = document.getElementById('canvasContainer');
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);
    scene.fog = new THREE.FogExp2(0x111122, 0.008);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(2, 1.5, 2.5);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 1.5;
    controls.zoomSpeed = 1.2;
    controls.enableZoom = true;
    controls.enablePan = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(2, 3, 2);
    scene.add(directionalLight);

    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(-1, 1, 2);
    scene.add(fillLight);

    const backLight = new THREE.PointLight(0xffaa66, 0.3);
    backLight.position.set(0, 1, -2);
    scene.add(backLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(4, 20, 0x88aaff, 0x335588);
    gridHelper.position.y = -1.2;
    scene.add(gridHelper);

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    
    if (autoRotate && mesh) {
        mesh.rotation.y += 0.005;
    }
    
    controls.update();
    renderer.render(scene, camera);
}

// Create height map from image
function createHeightMap(imgData, width, height, scale, smoothLevel) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Create height map from brightness
            const heights = [];
            const colors = [];
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    
                    // Brightness to height
                    const brightness = (r + g + b) / 3 / 255;
                    let heightValue = brightness * scale;
                    
                    // Apply smoothing
                    heights.push(heightValue);
                    colors.push([r / 255, g / 255, b / 255]);
                }
            }
            
            resolve({ heights, colors, width, height });
        };
        img.src = imgData;
    });
}

// Create 3D mesh from height map
function createMeshFromHeightMap(heightData, colors, width, height, colorModeType) {
    const geometry = new THREE.BufferGeometry();
    
    const vertices = [];
    const indices = [];
    const normals = [];
    const vertexColors = [];
    
    const stepX = 2.0 / (width - 1);
    const stepZ = 2.0 / (height - 1);
    const startX = -1.0;
    const startZ = -1.0;
    
    // Create vertices
    for (let i = 0; i < height; i++) {
        const z = startZ + i * stepZ;
        for (let j = 0; j < width; j++) {
            const x = startX + j * stepX;
            const idx = i * width + j;
            const y = heightData[idx];
            
            vertices.push(x, y, z);
            
            // Colors based on mode
            if (colorModeType === 'height') {
                const intensity = Math.min(1, Math.max(0, y / 1.5));
                vertexColors.push(intensity, intensity, intensity);
            } else if (colorModeType === 'gradient') {
                const t = Math.min(1, Math.max(0, y / 1.5));
                // Cool to warm gradient
                const r = Math.min(1, t * 2);
                const g = Math.min(1, 1 - Math.abs(t - 0.5) * 2);
                const b = Math.min(1, (1 - t) * 2);
                vertexColors.push(r, g, b);
            } else {
                // Original texture colors
                const c = colors[idx];
                vertexColors.push(c[0], c[1], c[2]);
            }
        }
    }
    
    // Create indices (triangles)
    for (let i = 0; i < height - 1; i++) {
        for (let j = 0; j < width - 1; j++) {
            const a = i * width + j;
            const b = i * width + j + 1;
            const c = (i + 1) * width + j;
            const d = (i + 1) * width + j + 1;
            
            indices.push(a, b, c);
            indices.push(b, d, c);
        }
    }
    
    // Calculate normals
    for (let i = 0; i < vertices.length; i += 3) {
        normals.push(0, 1, 0);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexColors), 3));
    geometry.setIndex(indices);
    
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.4,
        metalness: 0.1,
        flatShading: false
    });
    
    return new THREE.Mesh(geometry, material);
}

// Update progress
function updateProgress(percent) {
    progressFill.style.width = `${percent}%`;
}

// Generate 3D mesh
async function generate3DMesh() {
    if (!currentImageData) return;
    
    loading.style.display = 'flex';
    updateProgress(10);
    
    try {
        const res = parseInt(resolution.value);
        const scale = parseFloat(heightScale.value);
        const smooth = parseInt(smoothing.value);
        const colorModeType = colorMode.value;
        
        updateProgress(30);
        
        // Create height map
        const { heights, colors, width, height } = await createHeightMap(
            currentImageData, res, res, scale, smooth
        );
        
        updateProgress(70);
        
        // Create 3D mesh
        const newMesh = createMeshFromHeightMap(heights, colors, width, height, colorModeType);
        
        updateProgress(90);
        
        // Remove old mesh
        if (mesh) scene.remove(mesh);
        
        mesh = newMesh;
        scene.add(mesh);
        
        updateProgress(100);
        
        downloadBtn.disabled = false;
        showToast('3D mesh created successfully!', 'success');
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        setTimeout(() => {
            loading.style.display = 'none';
        }, 500);
    }
}

// Download as OBJ
function downloadModel() {
    if (!mesh) return;
    
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;
    const indices = geometry.index.array;
    
    let obj = '# 3D Model from Image\n';
    obj += '# Generated by 2D to 3D Converter\n\n';
    
    // Vertices
    for (let i = 0; i < positions.length; i += 3) {
        obj += `v ${positions[i]} ${positions[i+1]} ${positions[i+2]}\n`;
    }
    
    obj += '\n';
    
    // Faces
    for (let i = 0; i < indices.length; i += 3) {
        obj += `f ${indices[i]+1} ${indices[i+1]+1} ${indices[i+2]+1}\n`;
    }
    
    const blob = new Blob([obj], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `3d_model_${Date.now()}.obj`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Model downloaded as OBJ', 'success');
}

// Reset view
window.resetView = function() {
    camera.position.set(2, 1.5, 2.5);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    showToast('View reset', 'info');
};

// Toggle wireframe
window.toggleWireframe = function() {
    if (mesh) {
        wireframeMode = !wireframeMode;
        mesh.material.wireframe = wireframeMode;
        showToast(wireframeMode ? 'Wireframe ON' : 'Wireframe OFF', 'info');
    }
};

// Toggle auto rotate
window.toggleRotation = function() {
    autoRotate = !autoRotate;
    showToast(autoRotate ? 'Auto rotate ON' : 'Auto rotate OFF', 'info');
};

// Show toast message
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    toast.style.borderLeftColor = type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#667eea';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Image upload
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        currentImageData = event.target.result;
        previewImg.src = currentImageData;
        imagePreview.style.display = 'block';
        generateBtn.disabled = false;
        showToast('Image uploaded! Click Generate', 'success');
    };
    reader.readAsDataURL(file);
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'rgba(255,255,255,0.3)';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'rgba(255,255,255,0.3)';
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            currentImageData = event.target.result;
            previewImg.src = currentImageData;
            imagePreview.style.display = 'block';
            generateBtn.disabled = false;
            showToast('Image uploaded!', 'success');
        };
        reader.readAsDataURL(file);
    }
});

// Generate button
generateBtn.addEventListener('click', generate3DMesh);

// Height scale display
heightScale.addEventListener('input', (e) => {
    heightValue.textContent = parseFloat(e.target.value).toFixed(2);
});

// Initialize
init3D();

// Add default cube to show scene works
const defaultGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const defaultMat = new THREE.MeshStandardMaterial({ color: 0x667eea });
const defaultCube = new THREE.Mesh(defaultGeom, defaultMat);
defaultCube.position.y = 0;
scene.add(defaultCube);
mesh = defaultCube;

showToast('Ready! Upload an image to create 3D mesh', 'info');
