#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 3D Model Generator - Flask Backend
Advanced depth estimation using OpenCV and AI models
"""

from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import base64
import io
import json
import os
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
import cv2
import time
import uuid

app = Flask(__name__)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    """Serve main page"""
    return render_template('index.html')

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'AI 3D Model Generator is running'})

@app.route('/api/process-depth', methods=['POST'])
def process_depth():
    """
    Advanced depth map generation from image
    Uses OpenCV for edge detection and depth estimation
    """
    try:
        data = request.json
        image_data = data.get('image', '')
        depth_scale = float(data.get('depth_scale', 0.8))
        smoothing = int(data.get('smoothing', 3))
        
        if not image_data:
            return jsonify({'success': False, 'error': 'No image data'})
        
        # Remove base64 prefix if present
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        # Decode image
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize for processing (max 1024px)
        max_size = 1024
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # Convert to numpy array for OpenCV
        img_np = np.array(img)
        img_cv = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        
        # Method 1: Sobel edge detection for depth
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur
        gray_blurred = cv2.GaussianBlur(gray, (smoothing * 2 + 1, smoothing * 2 + 1), 0)
        
        # Sobel edge detection
        sobel_x = cv2.Sobel(gray_blurred, cv2.CV_64F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray_blurred, cv2.CV_64F, 0, 1, ksize=3)
        magnitude = np.sqrt(sobel_x**2 + sobel_y**2)
        
        # Normalize to 0-1
        depth_map = cv2.normalize(magnitude, None, 0, 1, cv2.NORM_MINMAX)
        
        # Apply depth scale
        depth_map = depth_map * depth_scale
        
        # Apply additional smoothing
        if smoothing > 0:
            kernel_size = smoothing * 2 + 1
            depth_map = cv2.GaussianBlur(depth_map, (kernel_size, kernel_size), 0)
        
        # Method 2: Brightness-based depth (fallback/combination)
        brightness = gray_blurred.astype(np.float32) / 255.0
        brightness_depth = 1 - brightness  # Inverse: brighter = higher
        
        # Combine methods (weighted)
        combined_depth = (depth_map * 0.6 + brightness_depth * 0.4) * depth_scale
        
        # Normalize final depth
        depth_min = combined_depth.min()
        depth_max = combined_depth.max()
        if depth_max > depth_min:
            depth_normalized = (combined_depth - depth_min) / (depth_max - depth_min)
        else:
            depth_normalized = combined_depth
        
        # Convert to list for JSON
        depth_list = depth_normalized.flatten().tolist()
        
        # Generate preview depth image (for visualization)
        depth_vis = (depth_normalized * 255).astype(np.uint8)
        depth_vis = cv2.applyColorMap(depth_vis, cv2.COLORMAP_JET)
        
        # Encode depth preview to base64
        _, buffer = cv2.imencode('.jpg', depth_vis)
        depth_preview = base64.b64encode(buffer).decode('utf-8')
        
        return jsonify({
            'success': True,
            'depth_map': depth_list,
            'dimensions': depth_normalized.shape,
            'depth_preview': depth_preview,
            'min_depth': float(depth_min),
            'max_depth': float(depth_max),
            'mean_depth': float(np.mean(depth_normalized))
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/estimate-depth-advanced', methods=['POST'])
def estimate_depth_advanced():
    """
    Advanced depth estimation using multiple techniques
    """
    try:
        data = request.json
        image_data = data.get('image', '')
        method = data.get('method', 'combined')
        
        if not image_data:
            return jsonify({'success': False, 'error': 'No image data'})
        
        # Decode image
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes))
        
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize
        max_size = 512
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        img_np = np.array(img)
        img_cv = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        if method == 'sobel':
            # Sobel edge detection
            sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
            sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
            depth = np.sqrt(sobel_x**2 + sobel_y**2)
            depth = cv2.normalize(depth, None, 0, 1, cv2.NORM_MINMAX)
            
        elif method == 'laplacian':
            # Laplacian edge detection
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            depth = np.abs(laplacian)
            depth = cv2.normalize(depth, None, 0, 1, cv2.NORM_MINMAX)
            
        elif method == 'canny':
            # Canny edge detection
            edges = cv2.Canny(gray, 50, 150)
            depth = edges.astype(np.float32) / 255.0
            
        elif method == 'brightness':
            # Simple brightness inversion
            depth = 1 - (gray.astype(np.float32) / 255.0)
            
        else:
            # Combined method (default)
            sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
            sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
            edges = np.sqrt(sobel_x**2 + sobel_y**2)
            brightness = 1 - (gray.astype(np.float32) / 255.0)
            depth = (edges + brightness * 255) / 2
            depth = cv2.normalize(depth, None, 0, 1, cv2.NORM_MINMAX)
        
        # Smooth
        depth = cv2.GaussianBlur(depth, (5, 5), 0)
        
        # Convert to list
        depth_list = depth.flatten().tolist()
        
        return jsonify({
            'success': True,
            'depth_map': depth_list,
            'dimensions': depth.shape,
            'method': method
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/upload', methods=['POST'])
def upload_image():
    """
    Upload and process image
    """
    try:
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file'})
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No image selected'})
        
        # Save file
        filename = f"{uuid.uuid4().hex}_{file.filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Process image info
        img = Image.open(filepath)
        width, height = img.size
        mode = img.mode
        
        return jsonify({
            'success': True,
            'filename': filename,
            'width': width,
            'height': height,
            'mode': mode
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/convert-to-obj', methods=['POST'])
def convert_to_obj():
    """
    Convert depth map to OBJ format
    """
    try:
        data = request.json
        depth_map = data.get('depth_map', [])
        dimensions = data.get('dimensions', [128, 128])
        width, height = dimensions
        
        if not depth_map:
            return jsonify({'success': False, 'error': 'No depth map'})
        
        # Reshape depth map
        depth_array = np.array(depth_map).reshape(height, width)
        
        # Generate OBJ
        obj_data = []
        obj_data.append("# 3D Model from AI Depth Estimation")
        obj_data.append("# Generated by AI 3D Model Generator")
        obj_data.append("")
        
        # Vertices
        spacing_x = 2.0 / (width - 1)
        spacing_z = 2.0 / (height - 1)
        start_x = -1.0
        start_z = -1.0
        
        for i in range(height):
            z = start_z + i * spacing_z
            for j in range(width):
                x = start_x + j * spacing_x
                y = depth_array[i, j]
                obj_data.append(f"v {x:.6f} {y:.6f} {z:.6f}")
        
        obj_data.append("")
        
        # Faces
        for i in range(height - 1):
            for j in range(width - 1):
                a = i * width + j + 1
                b = i * width + j + 2
                c = (i + 1) * width + j + 1
                d = (i + 1) * width + j + 2
                
                obj_data.append(f"f {a} {b} {c}")
                obj_data.append(f"f {b} {d} {c}")
        
        obj_text = "\n".join(obj_data)
        
        return jsonify({
            'success': True,
            'obj_data': obj_text
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/export', methods=['POST'])
def export_model():
    """
    Export model as OBJ file
    """
    try:
        data = request.json
        obj_data = data.get('obj_data', '')
        
        if not obj_data:
            return jsonify({'success': False, 'error': 'No OBJ data'})
        
        # Create file
        filename = f"model_{uuid.uuid4().hex[:8]}.obj"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        with open(filepath, 'w') as f:
            f.write(obj_data)
        
        return send_file(filepath, as_attachment=True, download_name=filename)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
