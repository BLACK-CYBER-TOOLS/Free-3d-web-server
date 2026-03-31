#!/usr/bin/env python3
# Flask server for additional processing (optional)

from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import base64
import io
import json
import numpy as np
from PIL import Image, ImageFilter
import cv2

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/process-depth', methods=['POST'])
def process_depth():
    try:
        data = request.json
        image_data = data.get('image', '').split(',')[1]
        depth_scale = float(data.get('depth_scale', 0.5))
        
        # Decode image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to grayscale
        gray = image.convert('L')
        
        # Apply Gaussian blur for smoother depth
        blurred = gray.filter(ImageFilter.GaussianBlur(radius=2))
        
        # Create depth map
        depth_array = np.array(blurred) / 255.0 * depth_scale
        
        # Normalize
        depth_normalized = (depth_array - depth_array.min()) / (depth_array.max() - depth_array.min() + 1e-8)
        
        # Convert to list for JSON
        depth_list = depth_normalized.flatten().tolist()
        
        return jsonify({
            'success': True,
            'depth_map': depth_list,
            'dimensions': depth_array.shape,
            'min_depth': float(depth_array.min()),
            'max_depth': float(depth_array.max())
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/estimate-depth', methods=['POST'])
def estimate_depth():
    """Advanced depth estimation using OpenCV"""
    try:
        data = request.json
        image_data = data.get('image', '').split(',')[1]
        
        # Decode image
        image_bytes = base64.b64decode(image_data)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply Sobel edge detection
        sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        magnitude = np.sqrt(sobel_x**2 + sobel_y**2)
        
        # Normalize
        depth = cv2.normalize(magnitude, None, 0, 1, cv2.NORM_MINMAX)
        
        # Convert to list
        depth_list = depth.flatten().tolist()
        
        return jsonify({
            'success': True,
            'depth_map': depth_list,
            'dimensions': depth.shape
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
