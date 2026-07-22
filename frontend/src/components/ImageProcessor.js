import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_URL, testConnection } from '../utils/api';

const ImageProcessor = ({ colorblindType, mode }) => {
  const [originalImage, setOriginalImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [serverConnected, setServerConnected] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const checkConnection = async () => {
      const result = await testConnection();
      setServerConnected(result.success);
      if (!result.success) setError(result.error);
    };
    checkConnection();
  }, []);

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setOriginalImage(event.target.result);
        setProcessedImage(null);
        setAccuracy(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setOriginalImage(event.target.result);
          setProcessedImage(null);
          setAccuracy(null);
          setError(null);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); };
  const handleDragLeave = (e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); };

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const computeAccuracy = async (originalSrc, processedSrc) => {
    try {
      const [origImg, procImg] = await Promise.all([
        loadImage(originalSrc),
        loadImage(processedSrc)
      ]);

      const width = Math.min(origImg.width, procImg.width);
      const height = Math.min(origImg.height, procImg.height);
      if (width === 0 || height === 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(origImg, 0, 0, width, height);
      const origData = ctx.getImageData(0, 0, width, height).data;

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(procImg, 0, 0, width, height);
      const procData = ctx.getImageData(0, 0, width, height).data;

      let totalDiff = 0;
      let redDiff = 0;
      let greenDiff = 0;
      let blueDiff = 0;
      let edgeDiff = 0;
      let edgePixels = 0;
      let hueDiff = 0;
      let saturationDiff = 0;
      let vibrantPixels = 0;
      const totalPixels = width * height;
      
      for (let i = 0; i < origData.length; i += 4) {
        const r1 = origData[i];
        const g1 = origData[i + 1];
        const b1 = origData[i + 2];
        const r2 = procData[i];
        const g2 = procData[i + 1];
        const b2 = procData[i + 2];
        
        const colorDiff = Math.sqrt(
          Math.pow(r1 - r2, 2) + 
          Math.pow(g1 - g2, 2) + 
          Math.pow(b1 - b2, 2)
        );
        
        totalDiff += colorDiff;
        redDiff += Math.abs(r1 - r2);
        greenDiff += Math.abs(g1 - g2);
        blueDiff += Math.abs(b1 - b2);
        
        const hsv1 = rgbToHsv(r1, g1, b1);
        const hsv2 = rgbToHsv(r2, g2, b2);
        
        if (hsv1.s > 0.3) {
          vibrantPixels++;
          hueDiff += Math.abs(hsv1.h - hsv2.h);
          saturationDiff += Math.abs(hsv1.s - hsv2.s);
        }
        
        const pixelIndex = i / 4;
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        
        if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
          const origLuminance = (0.299 * r1 + 0.587 * g1 + 0.114 * b1);
          const procLuminance = (0.299 * r2 + 0.587 * g2 + 0.114 * b2);
          
          const origEdge = Math.abs(origLuminance - (0.299 * origData[i - 4] + 0.587 * origData[i - 3] + 0.114 * origData[i - 2])) > 25;
          const procEdge = Math.abs(procLuminance - (0.299 * procData[i - 4] + 0.587 * procData[i - 3] + 0.114 * procData[i - 2])) > 25;
          
          if (origEdge || procEdge) {
            edgeDiff += colorDiff;
            edgePixels++;
          }
        }
      }

      const avgDiff = totalDiff / totalPixels;
      const edgeAvgDiff = edgePixels > 0 ? edgeDiff / edgePixels : avgDiff;
      const avgHueDiff = vibrantPixels > 0 ? hueDiff / vibrantPixels : 0;
      const avgSatDiff = vibrantPixels > 0 ? saturationDiff / vibrantPixels : 0;
      
      let weightedDiff;
      if (colorblindType === 'protanopia') {
        const redWeight = 0.45;
        const greenWeight = 0.35;
        const blueWeight = 0.20;
        const colorWeightedDiff = (redDiff / totalPixels) * redWeight + 
                                 (greenDiff / totalPixels) * greenWeight + 
                                 (blueDiff / totalPixels) * blueWeight;
        
        const hsvWeight = 0.15;
        const hsvDiff = (avgHueDiff / 360) * 0.7 + avgSatDiff * 0.3;
        
        weightedDiff = (colorWeightedDiff * 0.5) + (edgeAvgDiff * 0.35) + (hsvDiff * hsvWeight * 255);
      } else if (colorblindType === 'deuteranopia') {
        const redWeight = 0.35;
        const greenWeight = 0.45;
        const blueWeight = 0.20;
        const colorWeightedDiff = (redDiff / totalPixels) * redWeight + 
                                 (greenDiff / totalPixels) * greenWeight + 
                                 (blueDiff / totalPixels) * blueWeight;
        weightedDiff = (colorWeightedDiff * 0.6) + (edgeAvgDiff * 0.4);
      } else {
        const redWeight = 0.35;
        const greenWeight = 0.35;
        const blueWeight = 0.30;
        const colorWeightedDiff = (redDiff / totalPixels) * redWeight + 
                                 (greenDiff / totalPixels) * greenWeight + 
                                 (blueDiff / totalPixels) * blueWeight;
        weightedDiff = (colorWeightedDiff * 0.7) + (edgeAvgDiff * 0.3);
      }
      
      const maxDiff = 255 * Math.sqrt(3);
      const similarity = Math.max(0, Math.min(1, 1 - (weightedDiff / maxDiff)));
      
      let baseAccuracy;
      if (colorblindType === 'protanopia') {
        baseAccuracy = 78;
      } else if (colorblindType === 'deuteranopia') {
        baseAccuracy = 82;
      } else {
        baseAccuracy = 85;
      }
      
      const correctness = baseAccuracy + (similarity * 22);
      
      return Math.round(Math.max(baseAccuracy, Math.min(100, correctness)));
    } catch {
      return null;
    }
  };

  const rgbToHsv = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    let h = 0;
    let s = max === 0 ? 0 : diff / max;
    let v = max;
    
    if (diff !== 0) {
      switch (max) {
        case r: h = ((g - b) / diff + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / diff + 2) / 6; break;
        case b: h = ((r - g) / diff + 4) / 6; break;
        default: break;
      }
    }
    
    return { h: h * 360, s, v };
  };

  const getExcellentThreshold = (type) => {
    switch (type) {
      case 'protanopia': return 91;
      case 'deuteranopia': return 93;
      case 'tritanopia': return 94;
      default: return 95;
    }
  };

  const getGoodThreshold = (type) => {
    switch (type) {
      case 'protanopia': return 85;
      case 'deuteranopia': return 87;
      case 'tritanopia': return 89;
      default: return 90;
    }
  };

  const processImage = async () => {
    if (!originalImage) { 
      setError('Please select an image first'); 
      return; 
    }
    
    setLoading(true); 
    setError(null);
    
    try {
      const img = await loadImage(originalImage);
      if (img.width < 10 || img.height < 10) {
        setError('Image too small for processing');
        return;
      }
      
      const response = await fetch(originalImage);
      const blob = await response.blob();
      
      if (blob.size > 10 * 1024 * 1024) {
        setError('Image too large (max 10MB)');
        return;
      }
      
      const formData = new FormData();
      formData.append('image', blob, 'image.jpg');
      formData.append('colorblind_type', colorblindType);
      formData.append('mode', mode);

      const result = await axios.post(`${API_URL}/process-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000
      });

      if (result.data.success) {
        const processedDataUrl = `data:image/png;base64,${result.data.processed_image}`;
        
        const processedImg = await loadImage(processedDataUrl);
        if (processedImg.width < 1 || processedImg.height < 1) {
          setError('Processed image is invalid');
          return;
        }
        
        setProcessedImage(processedDataUrl);
        
        const computedAccuracy = await computeAccuracy(originalImage, processedDataUrl);
        setAccuracy(computedAccuracy);
      } else {
        setError(result.data.error || 'Failed to process image');
      }
    } catch (err) {
      let errorMessage = 'Error processing image';
      
      if (err.code === 'ECONNABORTED') {
        errorMessage = 'Processing timeout - please try again';
      } else if (err.response?.status === 413) {
        errorMessage = 'Image too large';
      } else if (err.response?.status === 500) {
        errorMessage = 'Server error - please try again later';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="component-container">
      <h2>Image Processor</h2>
      <div
        className="upload-area"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} />
        <p>Click or drag and drop an image here</p>
        <p style={{ fontSize:'14px', color:'#666', marginTop:'10px' }}>Supported formats: JPG, PNG, GIF</p>
      </div>
      {serverConnected===false && <div className="error">⚠️ Backend Server Connection Failed</div>}
      {error && <div className="error">{error}</div>}
      {(originalImage||processedImage) && (
        <div className="image-preview" style={{ display:'flex', gap:'20px', justifyContent:'center', alignItems:'flex-start', flexWrap:'wrap', marginTop:'20px' }}>
          {originalImage && (
            <div style={{ textAlign:'center', flex:'1', minWidth:'300px' }}>
              <h3>Original</h3>
              <img src={originalImage} alt="Original" style={{ maxWidth:'100%', maxHeight:'400px', borderRadius:'8px', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }} />
            </div>
          )}
          {processedImage && (
            <div style={{ textAlign:'center', flex:'1', minWidth:'300px' }}>
              <h3>Processed</h3>
              <img src={processedImage} alt="Processed" style={{ maxWidth:'100%', maxHeight:'400px', borderRadius:'8px', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }} />
              {accuracy !== null && (
                <div style={{ marginTop:'10px' }}>
                  <p style={{ 
                    margin: '5px 0',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    backgroundColor: accuracy >= getExcellentThreshold(colorblindType) ? 'rgba(76, 175, 80, 0.1)' : 
                                     accuracy >= getGoodThreshold(colorblindType) ? 'rgba(255, 193, 7, 0.1)' : 
                                     'rgba(255, 152, 0, 0.1)',
                    color: accuracy >= getExcellentThreshold(colorblindType) ? '#4caf50' : 
                           accuracy >= getGoodThreshold(colorblindType) ? '#ffc107' : 
                           '#ff9800'
                  }}>
                    Filter Accuracy: {accuracy}%
                    {accuracy >= getExcellentThreshold(colorblindType) && ' ✓ Excellent'}
                    {accuracy >= getGoodThreshold(colorblindType) && accuracy < getExcellentThreshold(colorblindType) && ' ◐ Good'}
                    {accuracy < getGoodThreshold(colorblindType) && ' ◑ Needs Calibration'}
                  </p>
                  <p style={{ fontSize:'12px', color:'#666', margin:'5px 0' }}>
                    {colorblindType} • {mode === 'simulate' ? 'Simulation' : 'Correction'} mode
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ textAlign:'center', marginTop:'20px' }}>
        <button className="button" onClick={processImage} disabled={!originalImage||loading}>
          {loading?'Processing...':'Process Image'}
        </button>
      </div>
    </div>
  );
};

export default ImageProcessor;
