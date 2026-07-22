# Color Blindness Friendly Image Filter Project

A comprehensive web application for processing images, videos, and live camera feeds to simulate color blindness or enhance content for color-blind users. Built with TensorFlow, WebGL, OpenCV, Flask, React, and MongoDB.

## Features

- **Image Processing**: Upload and process images with color blindness simulation or enhancement
- **Video Processing**: Process video files frame-by-frame
- **Live Camera Feed**: Real-time processing using WebGL for optimal performance
- **Multiple Color Blindness Types**: Support for Protanopia, Deuteranopia, and Tritanopia
- **Two Processing Modes**:
  - **Simulate**: See how images appear to color-blind users
  - **Enhance**: Improve visibility for color-blind users
- **Processing History**: MongoDB integration to track processing history
- **Deep Learning Models**: CNN and GAN models for advanced processing (TensorFlow)

## Technology Stack

### Backend
- **Flask**: RESTful API server
- **OpenCV**: Image and video processing
- **TensorFlow**: Deep learning models (CNN, GAN)
- **MongoDB**: Data storage and history tracking
- **Python**: Backend programming language

### Frontend
- **React**: User interface framework
- **WebGL**: Real-time GPU-accelerated processing
- **Axios**: HTTP client for API communication

## Project Structure

```
.
├── backend/
│   ├── app.py                 # Flask application
│   ├── models/
│   │   └── cnn_model.py       # TensorFlow CNN and GAN models
│   ├── requirements.txt       # Python dependencies
│   ├── uploads/               # Uploaded files (created at runtime)
│   └── processed/             # Processed files (created at runtime)
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js             # Main React component
│   │   ├── App.css            # Styles
│   │   ├── components/
│   │   │   ├── ImageProcessor.js
│   │   │   ├── VideoProcessor.js
│   │   │   ├── CameraProcessor.js
│   │   │   └── History.js
│   │   ├── utils/
│   │   │   └── webglProcessor.js  # WebGL utilities
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
└── README.md
```

## Installation

### Prerequisites
- Python 3.8+
- Node.js 16+
- MongoDB (running on localhost:27017)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

4. Start MongoDB (if not already running):
```bash
# On Windows (if installed as service, it should start automatically)
# On Linux/Mac:
mongod
```

5. Run the Flask server:
```bash
python app.py
```

The backend API will be available at `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Start the React development server:
```bash
npm start
```

The frontend will be available at `http://localhost:3000`

## Usage

1. **Image Processing**:
   - Select the "Image" tab
   - Upload an image file (drag & drop or click to browse)
   - Choose color blindness type and mode
   - Click "Process Image" to see the result

2. **Video Processing**:
   - Select the "Video" tab
   - Upload a video file
   - Choose color blindness type and mode
   - Click "Process Video"
   - Download the processed video when complete

3. **Live Camera**:
   - Select the "Live Camera" tab
   - Click "Start Camera" (grant camera permissions)
   - Real-time processing will be displayed
   - Click "Stop Camera" when done

4. **History**:
   - View processing history in the "History" tab
   - See all processed images and videos with metadata

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/process-image` - Process uploaded image
- `POST /api/process-video` - Process uploaded video
- `POST /api/camera-frame` - Process single camera frame
- `GET /api/history` - Get processing history
- `GET /api/download/<filename>` - Download processed file

## Color Blindness Types

- **Protanopia**: Red-blind (cannot distinguish red colors)
- **Deuteranopia**: Green-blind (cannot distinguish green colors)
- **Tritanopia**: Blue-blind (cannot distinguish blue colors)

## Processing Modes

- **Simulate**: Applies color transformation to show how images appear to color-blind users
- **Enhance**: Improves contrast and adjusts colors to make content more accessible for color-blind users

## Deep Learning Models

The project includes TensorFlow models for advanced processing:

- **CNN Model**: Convolutional Neural Network for color blindness simulation and correction
- **GAN Model**: Generative Adversarial Network for enhanced color correction

Models can be trained on custom datasets and loaded via the `cnn_model.py` module.

## Development

### Training Models

To train custom models, you can use the TensorFlow models in `backend/models/cnn_model.py`. Prepare your dataset and train the models accordingly.

### Adding New Features

- Backend: Add new routes in `backend/app.py`
- Frontend: Create new components in `frontend/src/components/`
- WebGL: Extend shaders in `frontend/src/utils/webglProcessor.js`

## License

This project is open source and available for educational purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
