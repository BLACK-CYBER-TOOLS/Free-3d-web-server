import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Global variables
let scene, camera, renderer, controls, mesh;
let wireframeMode = false;
let autoRotate = false;
let currentImageData = null;

// DOM elements
const canvas = document.getElementById('canvas3d');
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const previewImg = document.getElementById('previewImg');
const imagePreview = document.getElementById('imagePreview');
const heightScale = document.getElementById('heightScale');
const heightValue = document.getElementById('heightValue');
const resolution = document.getElementById('resolution');
const resValue = document.getElementById('resValue');
const colorMode = document.getElementById('colorMode');
const smoothing = document.getElementById('smoothing');
const smoothValue = document.getElementById('smoothValue');
const meshType = document.getElementById('meshType');

// Update displays
resolution.addEventListener('change', () => {
    resValue.textContent = `${resolution.value}x${resolution.value}`;
});

heightScale.addEventListener('input', (e) => {
    heightValue.textContent = parseFloat(e.target.value).toFixed(2);
});

smoothing.addEventListener('input', (e) => {
    smoothValue.textContent = e.target.value;
});

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    toast.style.borderLeftColor = type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#667eea';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function updateProgress(percent, text) {
    progressBar.style.width = `${percent}%`;
    if (text) statusText.textContent = text;
}

// AI Depth Estimation from image brightness
function estimateDepthMap(imgData, width, height, scale, smoothLevel) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            updateProgress(20, 'Processing image...');
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            updateProgress(40, 'Calculating depth map...');
            
            const depths = [];
            const colors = [];
            
            // Advanced depth estimation using brightness + contrast
            let minBrightness = 1, maxBrightness = 0;
            const brightnesses = [];
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                
                // Perceptual brightness formula
                const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                brightnesses.push(brightness);
                
                if (brightness < minBrightness) minBrightness = brightness;
                if (brightness > maxBrightness) maxBrightness = brightness;
            }
            
            // Apply smoothing (simple average filter)
            const smoothedDepths = [];
            const smoothWindow = smoothLevel;
            
            for (let i = 0; i < brightnesses.length; i++) {
                let sum = 0;
                let count = 0;
                const y = Math.floor(i / width);
                const x = i % width;
                
                for (let dy = -smoothWindow; dy <= smoothWindow; dy++) {
                    for (let dx = -smoothWindow; dx <= smoothWindow; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const idx = ny * width + nx;
                            sum += brightnesses[idx];
                            count++;
                        }
                    }
                }
                
                let depth = (sum / count) * scale;
                
                // Invert: brighter = higher (like terrain)
                depth = (1 - (sum / count)) * scale;
                
                smoothedDepths.push(depth);
                depths.push(depth);
                
                // Store colors
                const idx = i * 4;
                colors.push([data[idx]/255, data[idx+1]/255, data[idx+2]/255]);
            }
            
            updateProgress(60, 'Depth map complete');
            resolve({ depths: smoothedDepths, colors, width, height });
        };
        img.src = imgData;
    });
}

// Create 3D mesh from depth map
function createMeshFromDepth(depths, colors, width, height, scale, colorModeType, meshBaseType) {
    updateProgress(70, 'Creating 3D mesh...');
    
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const vertexColors = [];
    
    const spacingX = 2.0 / (width - 1);
    const spacingZ = 2.0 / (height - 1);
    const startX = -1.0;
    const startZ = -1.0;
    
    let minY = Infinity;
    let maxY = -Infinity;
    
    // First pass: find min/max heights
    for (let i = 0; i < depths.length; i++) {
        const y = depths[i];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const heightRange = maxY - minY;
    
    // Create vertices
    for (let i = 0; i < height; i++) {
        const z = startZ + i * spacingZ;
        for (let j = 0; j < width; j++) {
            const x = startX + j * spacingX;
            const idx = i * width + j;
            let y = depths[idx];
            
            // Apply mesh base type
            if (meshBaseType === 'cylinder') {
                const radius = Math.sqrt(x*x + z*z);
                const angle = Math.atan2(z, x);
                const r = Math.min(0.8, radius);
                y = y * (1 - r * 0.8);
            } else if (meshBaseType === 'sphere') {
                const radius = Math.sqrt(x*x + y*y + z*z);
                y = y * (1 - Math.abs(radius) * 0.5);
            }
            
            vertices.push(x, y, z);
            
            // Colors based on mode
            if (colorModeType === 'heightmap') {
                const t = (y - minY) / (heightRange + 0.001);
                vertexColors.push(t, t, t);
            } else if (colorModeType === 'gradient') {
                const t = (y - minY) / (heightRange + 0.001);
                const r = Math.min(1, t * 1.5);
                const g = Math.min(1, 1 - Math.abs(t - 0.5) * 1.5);
                const b = Math.min(1, (1 - t) * 1.5);
                vertexColors.push(r, g, b);
            } else if (colorModeType === 'depth') {
                const t = (y - minY) / (heightRange + 0.001);
                vertexColors.push(t, t * 0.5, 1 - t);
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
    
    updateProgress(85, 'Finalizing mesh...');
    
    return new THREE.Mesh(geometry, material);
}

// Generate 3D model
async function generate3DModel() {
    if (!currentImageData) {
        showToast('Please upload an image first', 'error');
        return;
    }
    
    loadingOverlay.style.display = 'flex';
    updateProgress(5, 'Initializing AI depth estimation...');
    
    try {
        const res = parseInt(resolution.value);
        const scale = parseFloat(heightScale.value);
        const smooth = parseInt(smoothing.value);
        const colorModeType = colorMode.value;
        const meshBaseType = meshType.value;
        
        updateProgress(10, 'Analyzing image...');
        
        // Estimate depth map
        const { depths, colors, width, height } = await estimateDepthMap(
            currentImageData, res, res, scale, smooth
        );
        
        // Create 3D mesh
        const newMesh = createMeshFromDepth(
            depths, colors, width, height, scale, colorModeType, meshBaseType
        );
        
        updateProgress(95, 'Adding to scene...');
        
        // Remove old mesh
        if (mesh) scene.remove(mesh);
        
        mesh = newMesh;
        scene.add(mesh);
        
        updateProgress(100, 'Complete!');
        
        downloadBtn.disabled = false;
        showToast('3D model generated successfully! Ready for Blender', 'success');
        
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500);
        
    } catch (error) {
        console.error('Error:', error);
        loadingOverlay.style.display = 'none';
        showToast('Error: ' + error.message, 'error');
    }
}

// Download as OBJ (Blender compatible)
function downloadModel() {
    if (!mesh) return;
    
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;
    const indices = geometry.index.array;
    const colors = geometry.attributes.color ? geometry.attributes.color.array : null;
    
    let obj = '# 3D Model from AI Depth Estimation\n';
    obj += '# Generated by AI 3D Model Generator\n';
    obj += '# Compatible with Blender, Maya, Unity, Unreal Engine\n\n';
    
    // Vertices
    for (let i = 0; i < positions.length; i += 3) {
        obj += `v ${positions[i].toFixed(6)} ${positions[i+1].toFixed(6)} ${positions[i+2].toFixed(6)}\n`;
    }
    
    // Vertex colors (optional, Blender supports)
    if (colors) {
        obj += '\n# Vertex Colors\n';
        for (let i = 0; i < colors.length; i += 3) {
            obj += `vc ${colors[i].toFixed(4)} ${colors[i+1].toFixed(4)} ${colors[i+2].toFixed(4)}\n`;
        }
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
    a.download = `ai_3d_model_${Date.now()}.obj`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Model downloaded as OBJ - Ready for Blender!', 'success');
}

// Download as GLTF
function downloadGLTF() {
    if (!mesh) return;
    
    const exporter = new GLTFExporter();
    const sceneToExport = new THREE.Scene();
    sceneToExport.add(mesh.clone());
    
    exporter.parse(sceneToExport, (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai_3d_model_${Date.now()}.glb`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Model downloaded as GLTF', 'success');
    }, { binary: true });
}

// Initialize 3D scene
function init3D() {
    const container = document.querySelector('.preview-3d');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.01);
    
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
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(2, 3, 2);
    scene.add(mainLight);
    
    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(-1, 1, 2);
    scene.add(fillLight);
    
    const backLight = new THREE.PointLight(0xffaa66, 0.3);
    backLight.position.set(0, 1, -2);
    scene.add(backLight);
    
    const rimLight = new THREE.PointLight(0xff66aa, 0.4);
    rimLight.position.set(1, 2, -1.5);
    scene.add(rimLight);
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(4, 20, 0x88aaff, 0x335588);
    gridHelper.position.y = -1;
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

window.addEventListener('resize', () => {
    const container = document.querySelector('.preview-3d');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
});

window.resetView = function() {
    camera.position.set(2, 1.5, 2.5);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    showToast('Camera reset', 'info');
};

window.toggleWireframe = function() {
    if (mesh) {
        wireframeMode = !wireframeMode;
        mesh.material.wireframe = wireframeMode;
        showToast(wireframeMode ? 'Wireframe mode ON' : 'Wireframe mode OFF', 'info');
    }
};

window.toggleRotation = function() {
    autoRotate = !autoRotate;
    showToast(autoRotate ? 'Auto rotate ON' : 'Auto rotate OFF', 'info');
};

window.downloadModel = downloadModel;

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
        showToast('Image uploaded! Ready to generate 3D model', 'success');
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

generateBtn.addEventListener('click', generate3DModel);

// Start
init3D();

// Add default cube
const defaultGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const defaultMat = new THREE.MeshStandardMaterial({ color: 0x667eea });
const defaultCube = new THREE.Mesh(defaultGeom, defaultMat);
scene.add(defaultCube);
mesh = defaultCube;

showToast('AI 3D Model Generator ready! Upload an image', 'info');
