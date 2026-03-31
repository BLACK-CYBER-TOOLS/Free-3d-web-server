// Global variables
let scene, camera, renderer, mesh;
let currentImage = null;
let currentTexture = null;

// Initialize 3D scene
function init3D() {
    const container = document.getElementById('canvasContainer');
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);
    scene.fog = new THREE.FogExp2(0x111122, 0.01);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(2, 2, 3);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas3d'), antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 1);
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0x444444, 0.5);
    backLight.position.set(-1, -1, -1);
    scene.add(backLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(5, 20, 0x888888, 0x444444);
    scene.add(gridHelper);

    animate();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (mesh) {
        mesh.rotation.y += 0.005;
    }
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    const container = document.getElementById('canvasContainer');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
});

// Reset camera
function resetCamera() {
    camera.position.set(2, 2, 3);
    camera.lookAt(0, 0, 0);
}

// Download model
function downloadModel() {
    if (!mesh) return;
    
    // Export as GLB
    const exporter = new THREE.GLTFExporter();
    exporter.parse(scene, (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = '3d_model.glb';
        link.click();
        URL.revokeObjectURL(link.href);
    }, { binary: true });
}

// Image upload handling
document.getElementById('imageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        currentImage = event.target.result;
        
        // Show preview
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.style.background = 'rgba(102,126,234,0.2)';
        
        document.getElementById('convertBtn').disabled = false;
    };
    reader.readAsDataURL(file);
});

// Drag and drop
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'rgba(255,255,255,0.3)';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            currentImage = event.target.result;
            document.getElementById('convertBtn').disabled = false;
        };
        reader.readAsDataURL(file);
    }
});

// Convert button click
document.getElementById('convertBtn').addEventListener('click', async () => {
    if (!currentImage) return;
    
    const loading = document.getElementById('loading');
    loading.style.display = 'flex';
    
    const depthScale = parseFloat(document.getElementById('depthScale').value);
    const quality = document.getElementById('quality').value;
    const meshType = document.getElementById('meshType').value;
    
    try {
        // Create texture from image
        const texture = new THREE.TextureLoader().load(currentImage);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        // Remove old mesh
        if (mesh) scene.remove(mesh);
        
        // Create 3D mesh based on type
        if (meshType === 'plane') {
            const geometry = new THREE.PlaneGeometry(2, 2, 32, 32);
            const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
            mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
        } else if (meshType === 'cylinder') {
            const geometry = new THREE.CylinderGeometry(1, 1, 1.5, 32, 32);
            const material = new THREE.MeshStandardMaterial({ map: texture });
            mesh = new THREE.Mesh(geometry, material);
        } else {
            const geometry = new THREE.SphereGeometry(1, 64, 64);
            const material = new THREE.MeshStandardMaterial({ map: texture });
            mesh = new THREE.Mesh(geometry, material);
        }
        
        scene.add(mesh);
        
        // Add some depth effect based on image brightness
        await simulateDepthEffect(texture.image, depthScale);
        
    } catch (error) {
        console.error('Error:', error);
        alert('Xatolik yuz berdi. Qayta urinib ko\'ring.');
    } finally {
        loading.style.display = 'none';
    }
});

// Simulate depth effect from image brightness
function simulateDepthEffect(img, scale) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Simple brightness calculation
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
            totalBrightness += brightness;
        }
        
        const avgBrightness = totalBrightness / (data.length / 4);
        const depth = (avgBrightness / 255) * scale;
        
        // Adjust mesh position based on brightness
        if (mesh) {
            mesh.position.y = depth * 0.5;
        }
        
        resolve();
    });
}

// Update depth value display
document.getElementById('depthScale').addEventListener('input', (e) => {
    document.getElementById('depthValue').textContent = e.target.value;
});

// Initialize
init3D();
