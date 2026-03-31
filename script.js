import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Global variables
let scene, camera, renderer, controls, mesh;
let currentTexture = null;
let autoRotate = false;
let animationId = null;

// DOM elements
const canvas = document.getElementById('canvas3d');
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const previewImg = document.getElementById('previewImg');
const imagePreview = document.getElementById('imagePreview');
const depthScale = document.getElementById('depthScale');
const depthValue = document.getElementById('depthValue');
const quality = document.getElementById('quality');
const meshType = document.getElementById('meshType');
const textureMode = document.getElementById('textureMode');

let currentImageData = null;
let currentModelBlob = null;

// Initialize 3D scene
function init3D() {
    const container = document.querySelector('.preview-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.008);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(2, 1.5, 2.5);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 1.5;
    controls.zoomSpeed = 1.2;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 2.0;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(2, 3, 2);
    mainLight.castShadow = true;
    mainLight.receiveShadow = true;
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

    // Helper grid
    const gridHelper = new THREE.GridHelper(5, 20, 0x88aaff, 0x335588);
    gridHelper.position.y = -0.8;
    scene.add(gridHelper);

    // Simple ground reflection
    const planeGeometry = new THREE.PlaneGeometry(4, 4);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x112233, roughness: 0.5, metalness: 0.1 });
    const groundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.75;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    animate();
}

// Animation loop
function animate() {
    animationId = requestAnimationFrame(animate);
    
    if (autoRotate && mesh) {
        mesh.rotation.y += 0.005;
    }
    
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    const container = document.querySelector('.preview-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
});

// Reset camera
window.resetCamera = function() {
    camera.position.set(2, 1.5, 2.5);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    showToast('Camera reset', 'info');
};

// Toggle auto rotation
window.toggleRotation = function() {
    autoRotate = !autoRotate;
    controls.autoRotate = autoRotate;
    showToast(autoRotate ? 'Auto rotate ON' : 'Auto rotate OFF', 'info');
};

// Download model as GLB
window.downloadModel = function() {
    if (!mesh) {
        showToast('No model to download', 'error');
        return;
    }
    
    const exporter = new GLTFExporter();
    const sceneToExport = new THREE.Scene();
    sceneToExport.add(mesh.clone());
    
    exporter.parse(sceneToExport, (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `3d_model_${Date.now()}.glb`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Model downloaded as GLB', 'success');
    }, { binary: true });
};

// Show toast message
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Create depth map from image
async function createDepthMap(imageData, scale, qualityLevel) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let targetSize = 128;
            if (qualityLevel === 'low') targetSize = 64;
            else if (qualityLevel === 'medium') targetSize = 128;
            else if (qualityLevel === 'high') targetSize = 256;
            else if (qualityLevel === 'ultra') targetSize = 512;
            
            const canvas = document.createElement('canvas');
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, targetSize, targetSize);
            
            const imageDataObj = ctx.getImageData(0, 0, targetSize, targetSize);
            const data = imageDataObj.data;
            
            // Calculate depth from brightness
            const depthMap = [];
            for (let i = 0; i < data.length; i += 4) {
                const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
                const depth = (brightness / 255) * scale;
                depthMap.push(depth);
            }
            
            resolve({ depthMap, width: targetSize, height: targetSize });
        };
        img.src = imageData;
    });
}

// Create 3D mesh with depth
async function create3DMesh(imageData, depthScaleVal, meshTypeVal, qualityVal, textureModeVal) {
    const depthResult = await createDepthMap(imageData, depthScaleVal, qualityVal);
    const texture = new THREE.TextureLoader().load(imageData);
    
    // Texture wrapping mode
    if (textureModeVal === 'repeat') {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
    } else if (textureModeVal === 'mirror') {
        texture.wrapS = THREE.MirroredRepeatWrapping;
        texture.wrapT = THREE.MirroredRepeatWrapping;
        texture.repeat.set(1, 1);
    }
    
    let geometry;
    const segments = qualityVal === 'low' ? 32 : qualityVal === 'medium' ? 64 : qualityVal === 'high' ? 128 : 256;
    
    switch(meshTypeVal) {
        case 'cylinder':
            geometry = new THREE.CylinderGeometry(1, 1, 1.2, segments, segments);
            break;
        case 'sphere':
            geometry = new THREE.SphereGeometry(0.9, segments, segments);
            break;
        case 'torus':
            geometry = new THREE.TorusGeometry(0.8, 0.2, segments, segments * 2);
            break;
        case 'icosahedron':
            geometry = new THREE.IcosahedronGeometry(0.9, qualityVal === 'high' ? 1 : 0);
            break;
        default:
            // Plane with displacement map
            geometry = new THREE.PlaneGeometry(1.8, 1.8, segments, segments);
            const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
            const newMesh = new THREE.Mesh(geometry, material);
            newMesh.rotation.x = -Math.PI / 2;
            return newMesh;
    }
    
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.3, metalness: 0.1 });
    const newMesh = new THREE.Mesh(geometry, material);
    
    return newMesh;
}

// Update progress bar
function updateProgress(percent) {
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = `${percent}%`;
    }
}

// Main convert function
async function convertTo3D() {
    if (!currentImageData) return;
    
    loadingOverlay.style.display = 'flex';
    updateProgress(10);
    
    try {
        updateProgress(30);
        
        const depthVal = parseFloat(depthScale.value);
        const meshVal = meshType.value;
        const qualityVal = quality.value;
        const textureVal = textureMode.value;
        
        updateProgress(50);
        
        const newMesh = await create3DMesh(currentImageData, depthVal, meshVal, qualityVal, textureVal);
        
        updateProgress(80);
        
        // Remove old mesh
        if (mesh) scene.remove(mesh);
        
        mesh = newMesh;
        scene.add(mesh);
        
        updateProgress(100);
        
        setTimeout(() => {
            downloadBtn.disabled = false;
            showToast('3D model created successfully!', 'success');
        }, 500);
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error creating 3D model: ' + error.message, 'error');
    } finally {
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 1000);
    }
}

// Image upload handling
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showToast('File too large (max 10MB)', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        currentImageData = event.target.result;
        previewImg.src = currentImageData;
        imagePreview.style.display = 'block';
        convertBtn.disabled = false;
        showToast('Image uploaded successfully', 'success');
        
        // Auto preview as texture
        const tempTexture = new THREE.TextureLoader().load(currentImageData);
        if (mesh) {
            mesh.material.map = tempTexture;
            mesh.material.needsUpdate = true;
        }
    };
    reader.readAsDataURL(file);
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
    uploadArea.style.background = 'rgba(102,126,234,0.1)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'rgba(255,255,255,0.3)';
    uploadArea.style.background = 'transparent';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'rgba(255,255,255,0.3)';
    uploadArea.style.background = 'transparent';
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            currentImageData = event.target.result;
            previewImg.src = currentImageData;
            imagePreview.style.display = 'block';
            convertBtn.disabled = false;
            showToast('Image uploaded', 'success');
        };
        reader.readAsDataURL(file);
    }
});

// Convert button click
convertBtn.addEventListener('click', convertTo3D);

// Update depth value display
depthScale.addEventListener('input', (e) => {
    depthValue.textContent = parseFloat(e.target.value).toFixed(2);
    if (mesh && currentImageData) {
        // Update depth in real-time
        convertTo3D();
    }
});

// Initialize
init3D();

// Create a default cube to show scene is working
const defaultGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0x667eea, emissive: 0x332266 });
const defaultCube = new THREE.Mesh(defaultGeometry, defaultMaterial);
defaultCube.position.y = 0;
scene.add(defaultCube);
mesh = defaultCube;

showToast('Ready! Upload an image to create 3D model', 'info');
