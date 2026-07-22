import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from './utils/api';

const VideoProcessor = ({ colorblindType, mode }) => {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [backendProgress, setBackendProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [totalFrames, setTotalFrames] = useState(0); 
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);
  const sessionIdRef = useRef(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type.startsWith('video/')) {
      setFile(selectedFile);
      setError(null);
      setUploadProgress(0);
      setProcessingProgress(0);
    } else {
      setError('Please select a valid video file');
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const droppedFile = droppedFiles[0];
      if (droppedFile.type.startsWith('video/')) {
        setFile(droppedFile);
        setError(null);
        setUploadProgress(0);
        setProcessingProgress(0);
      } else {
        setError('Please drop a valid video file');
      }
    }
  };

  const connectProgressStream = (sessionId) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`${API_URL}/progress/${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'processing') {
          setBackendProgress(data.progress);
          if (data.total_frames && data.total_frames > 0) {
            setTotalFrames(data.total_frames);
          }
          const totalProgress = 30 + (data.progress * 0.7);
          setProcessingProgress(Math.round(totalProgress));
        } else if (data.status === 'complete') {
          setBackendProgress(100);
          setProcessingProgress(100);
          if (data.total_frames && data.total_frames > 0) {
            setTotalFrames(data.total_frames);
          }
          eventSource.close();
          eventSourceRef.current = null;
          
          setTimeout(() => {
            fetchProcessingResult(sessionId);
          }, 500);
        }
      } catch (e) {
        console.error('Error parsing progress data:', e, event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.log('Progress stream ended or error:', err);
      try {
        eventSource.close();
      } catch (e) {
        console.error('Error closing event source:', e);
      }
      eventSourceRef.current = null;
      setProcessing(false);
    };
  };

  const fetchProcessingResult = async (sessionId) => {
    try {
      const response = await axios.get(`${API_URL}/processing-result/${sessionId}`);
      if (response.data.success) {
        setResult({
          success: true,
          outputFile: response.data.output_file,
          framesProcessed: response.data.frames_processed,
          processingTime: response.data.processing_time,
          processor: response.data.processor,
        });
      } else {
        setError(response.data.error || 'Processing failed');
      }
      setProcessing(false);
    } catch (err) {
      console.error('Error fetching result:', err);
      setError('Error fetching processing result');
      setProcessing(false);
    }
  };

  const processVideo = async () => {
    if (!file) {
      setError('Please select a video file');
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setUploadProgress(0);
      setProcessingProgress(0);
      setBackendProgress(0);
      setResult(null);
      setTotalFrames(0);

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionIdRef.current = sessionId;

      const formData = new FormData();
      formData.append('video', file);
      formData.append('colorblind_type', colorblindType);
      formData.append('mode', mode);
      formData.append('session_id', sessionId);

      const response = await axios.post(`${API_URL}/process-video`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          try {
            const percentCompleted = Math.round((progressEvent.loaded * 30) / progressEvent.total);
            setUploadProgress(percentCompleted);
          } catch (e) {
            console.error('Error updating upload progress:', e);
          }
        },
      });

      if (response.data.success) {
        setUploadProgress(30);
        setProcessingProgress(30);
        connectProgressStream(sessionId);
        
        setTimeout(() => {
          const checkCompletion = setInterval(() => {
            if (backendProgress >= 100) {
              clearInterval(checkCompletion);
            }
          }, 500);
        }, 100);
      } else {
        setError(response.data.error || 'Processing failed');
        setProcessing(false);
      }
    } catch (err) {
      console.error('Video processing error:', err);
      setError('Error processing video: ' + (err.response?.data?.error || err.message || 'Unknown error'));
      setProcessing(false);
    }
  };

  const downloadVideo = () => {
    if (result && result.outputFile) {
      const link = document.createElement('a');
      link.href = `${API_URL}/download/${encodeURIComponent(result.outputFile)}`;
      link.download = result.outputFile;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const totalProgress = Math.max(uploadProgress, processingProgress);

  return (
    <div className="component-container">
      <h2>Video Processor</h2>

      {error && (
        <div className="error" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      <div
        className="upload-area"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '2px dashed #5d35c4',
          borderRadius: '8px',
          backgroundColor: '#fafafa',
          cursor: 'pointer',
          transition: 'all 0.3s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          
          accept="video/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {!file ? (
          <>
            <p style={{ fontSize: '16px', marginBottom: '10px' }}>Drag and drop your video here</p>
            <p style={{ fontSize: '14px', color: '#666' }}>or click to select a video file</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: '16px' }}>✓ Selected: {file.name}</p>
            <p style={{ fontSize: '12px', color: '#666' }}>Size: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </>
        )}
      </div>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button
          className="button"
          onClick={processVideo}
          disabled={!file || processing}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: file && !processing ? '#5d35c4' : '#ccc',
            color: '#fff',
            cursor: file && !processing ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.3s',
          }}
        >
          {processing ? `Processing ${backendProgress}%` : 'Process Video'}
        </button>
      </div>
      {processing && (
        <div style={{ marginTop: '20px' }}>
          <p style={{ textAlign: 'center', fontSize: '14px', color: '#5d35c4', fontWeight: '600', marginBottom: '10px' }}>
            Processing {backendProgress}%
          </p>
          <div style={{
            width: '100%',
            height: '12px',
            backgroundColor: '#e0e0e0',
            borderRadius: '6px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}>
            <div style={{
              width: `${totalProgress}%`,
              height: '100%',
              backgroundColor: '#5d35c4',
              transition: 'width 0.2s ease',
              boxShadow: '0 0 10px rgba(93, 53, 196, 0.6)',
            }} />
          </div>
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            {uploadProgress > 0 && processingProgress < 30 ? (
              <p style={{ fontSize: '14px', color: '#666', margin: '4px 0', fontWeight: '500' }}>
                Uploading... {uploadProgress}%
              </p>
            ) : (
              <>
                {processingProgress >= 30 && (
                  <p style={{ fontSize: '13px', color: '#5d35c4', margin: '4px 0', fontWeight: '600' }}>
                    Frames processed: {totalFrames > 0 ? Math.round((backendProgress / 100) * totalFrames) : 'calculating'} {totalFrames > 0 ? `/ ${totalFrames}` : ''}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {result && result.success && !processing && (
        <div style={{ marginTop: '20px', textAlign: 'center', backgroundColor: '#e8f5e9', padding: '15px', borderRadius: '8px' }}>
          <p style={{ color: '#2e7d32', fontSize: '16px', marginBottom: '10px' }}>
            ✓ Video processed successfully!
          </p>
          <p style={{ fontSize: '13px', color: '#555', marginBottom: '10px' }}>
            Frames: {result.framesProcessed} | Time: {result.processingTime?.toFixed(2) || 'N/A'}s
            {result.processor ? ` | ${result.processor}` : ''}
          </p>
          <button
            className="button"
            onClick={downloadVideo}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#4caf50',
              color: '#fff',
              cursor: 'pointer',
              transition: 'background-color 0.3s',
            }}
          >
            Download Processed Video
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoProcessor;
