#!/usr/bin/env python3
# Flask server for AI processing (ixtiyoriy)

from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import base64
import io
from PIL import Image
import numpy as np

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/process', methods=['POST'])
def process_image():
    try:
        data = request.json
        image_data = data.get('image', '').split(',')[1]
        depth_scale = float(data.get('depth_scale', 0.5))
        
        # Decode image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to grayscale for depth map
        gray = image.convert('L')
        
        # Create depth map (simplified)
        depth_map = np.array(gray) / 255.0 * depth_scale
        
        # Convert to JSON for frontend
        depth_list = depth_map.flatten().tolist()
        
        return jsonify({
            'success': True,
            'depth_map': depth_list,
            'dimensions': depth_map.shape
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
