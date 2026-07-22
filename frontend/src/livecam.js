import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from './utils/api';

const FRAME_INTERVAL_MS = 140;
const DISPLAY_MAX_WIDTH = 640;
const PROCESSING_MAX_WIDTH = 384;

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const CameraProcessor = ({ colorblindType = 'protanopia', mode = 'simulate' }) => {
  const [streaming, setStreaming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('');
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);
  const recordingStartRef = useRef(0);
  const recordingStopRef = useRef(0);
  const loopTimerRef = useRef(null);
  const requestIdRef = useRef(0);
  const processingRef = useRef(false);

  const stopLoop = () => {
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    requestIdRef.current += 1;
    processingRef.current = false;
    setProcessing(false);
  };

  const stopCamera = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      recordingStopRef.current = Date.now();
      setRecordingStatus('Saving recording...');
      mediaRecorderRef.current.stop();
    } else {
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
      }
      mediaRecorderRef.current = null;
      recordingChunksRef.current = [];
      setIsRecording(false);
    }

    stopLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  };

  const uploadRecording = async (blob, durationSeconds) => {
    const formData = new FormData();
    formData.append('video', blob, `live-recording-${Date.now()}.webm`);
    formData.append('clip_seconds', String(durationSeconds));

    const response = await fetch(`${API_URL}/save-recording`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to save recording (${response.status})`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Recording save failed');
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }
    recordingStopRef.current = Date.now();
    setRecordingStatus('Saving recording...');
    mediaRecorderRef.current.stop();
  };

  const startRecording = () => {
    if (!streaming || !canvasRef.current) {
      setError('Start camera before recording.');
      return;
    }
    if (!window.MediaRecorder) {
      setError('Recording is not supported in this browser.');
      return;
    }

    try {
      const canvasStream = canvasRef.current.captureStream(20);
      recordingStreamRef.current = canvasStream;

      let mimeType = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        mimeType = 'video/webm;codecs=vp8';
      }

      const recorder = new MediaRecorder(canvasStream, { mimeType });
      recordingChunksRef.current = [];
      recordingStartRef.current = Date.now();
      recordingStopRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = recordingChunksRef.current;
        const outputMime = recorder.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: outputMime });
        const stopTime = recordingStopRef.current || Date.now();
        const fallbackDurationSeconds = (stopTime - recordingStartRef.current) / 1000;

        recordingChunksRef.current = [];
        setIsRecording(false);
        mediaRecorderRef.current = null;

        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach(track => track.stop());
          recordingStreamRef.current = null;
        }

        if (blob.size === 0) {
          setRecordingStatus('Recording failed: empty clip.');
          return;
        }

        try {
          const clipDuration = Math.max(0.1, fallbackDurationSeconds);
          await uploadRecording(blob, clipDuration);
          setRecordingStatus('Recording saved to history.');
          setError(null);
        } catch (err) {
          setRecordingStatus('');
          setError(`Recording upload error: ${err.message}`);
        }
      };

      recorder.onerror = () => {
        setIsRecording(false);
        setRecordingStatus('');
        setError('Recording failed. Please try again.');
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingStatus('Recording in progress...');
      setError(null);
    } catch (err) {
      setError(`Unable to start recording: ${err.message}`);
    }
  };

  const scheduleNextFrame = () => {
    loopTimerRef.current = setTimeout(() => {
      processFrame();
    }, FRAME_INTERVAL_MS);
  };

  const processFrame = async () => {
    const video = videoRef.current;
    const outputCanvas = canvasRef.current;
    const captureCanvas = captureCanvasRef.current;

    if (!streaming || !video || !outputCanvas || !captureCanvas) {
      return;
    }

    if (video.readyState < 2) {
      scheduleNextFrame();
      return;
    }

    if (processingRef.current) {
      scheduleNextFrame();
      return;
    }

    const captureCtx = captureCanvas.getContext('2d');
    const outputCtx = outputCanvas.getContext('2d');
    if (!captureCtx || !outputCtx) {
      setError('Canvas rendering context is not available');
      return;
    }

    processingRef.current = true;
    setProcessing(true);
    const requestId = ++requestIdRef.current;

    try {
      captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

      const frameBlob = await new Promise((resolve) => {
        captureCanvas.toBlob(resolve, 'image/jpeg', 0.72);
      });

      if (!frameBlob) {
        throw new Error('Unable to capture live camera frame');
      }

      const formData = new FormData();
      formData.append('image', frameBlob, 'livecam-frame.jpg');
      formData.append('colorblind_type', colorblindType);
      formData.append('mode', mode);

      const response = await fetch(`${API_URL}/process-live-frame`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Backend responded with ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.processed_image) {
        throw new Error(result.error || 'Frame processing failed');
      }

      const processedImage = await loadImage(`data:image/jpeg;base64,${result.processed_image}`);
      if (requestId !== requestIdRef.current || !canvasRef.current) {
        return;
      }

      outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
      outputCtx.drawImage(processedImage, 0, 0, outputCanvas.width, outputCanvas.height);
      setError(null);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(`Live camera processing error: ${err.message}`);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        processingRef.current = false;
        setProcessing(false);
        if (streaming) {
          scheduleNextFrame();
        }
      }
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (!streaming) {
      stopLoop();
      return;
    }

    stopLoop();
    processFrame();
  }, [streaming, colorblindType, mode]);

  const startCamera = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const captureCanvas = captureCanvasRef.current;

    if (!video || !canvas || !captureCanvas) {
      setError('Video or canvas element not ready');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      video.srcObject = stream;

      video.onloadedmetadata = () => {
        const sourceWidth = video.videoWidth || 640;
        const sourceHeight = video.videoHeight || 480;
        const displayScale = Math.min(1, DISPLAY_MAX_WIDTH / sourceWidth);
        const displayWidth = Math.max(1, Math.round(sourceWidth * displayScale));
        const displayHeight = Math.max(1, Math.round(sourceHeight * displayScale));
        const processingScale = Math.min(1, PROCESSING_MAX_WIDTH / sourceWidth);
        const processingWidth = Math.max(1, Math.round(sourceWidth * processingScale));
        const processingHeight = Math.max(1, Math.round(sourceHeight * processingScale));

        canvas.width = displayWidth;
        canvas.height = displayHeight;
        captureCanvas.width = processingWidth;
        captureCanvas.height = processingHeight;

        video.play().then(() => {
          setStreaming(true);
          setError(null);
        }).catch(err => setError('Failed to play video: ' + err.message));
      };
    } catch (err) {
      setError('Camera access error: ' + err.message);
    }
  };

  return (
    <div className="component-container">
      <h2>Live Camera Processor</h2>

      {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

      <div
        className="upload-area"
        style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '2px dashed #5d35c4',
          borderRadius: '8px',
          backgroundColor: '#fdfdfd',
          cursor: 'pointer',
        }}
        onClick={streaming ? stopCamera : startCamera}
      >
        {!streaming ? (
          <>
            <p style={{ fontSize: '16px', marginBottom: '10px' }}>Click to start your camera</p>
            <p style={{ fontSize: '14px', color: '#666' }}>Live camera feed will appear below</p>
          </>
        ) : (
          <p style={{ fontSize: '16px' }}>
            {processing ? 'Processing live frame...' : 'Camera is active (click to stop)'}
          </p>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          marginTop: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p style={{ textAlign: 'center' }}>Original</p>
          <video
            ref={videoRef}
            style={{
              width: '320px',
              border: '2px solid #ddd',
              borderRadius: '8px',
            }}
            autoPlay
            playsInline
            muted
          />
        </div>

        <div>
          <p style={{ textAlign: 'center' }}>Filtered</p>
          <canvas
            ref={canvasRef}
            style={{
              width: '320px',
              border: '2px solid #ddd',
              borderRadius: '8px',
            }}
          />
        </div>
      </div>

      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button
          className="button"
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#5d35c4',
            color: '#fff',
            cursor: 'pointer',
            transition: 'background-color 0.3s',
          }}
          onClick={streaming ? stopCamera : startCamera}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#5d35c4')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#5d35c4')}
        >
          {streaming ? 'Stop Camera' : 'Start Camera'}
        </button>
        <div style={{ marginTop: '12px' }}>
          <button
            className="button"
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: isRecording ? '#c62828' : '#1565c0',
              color: '#fff',
              cursor: streaming ? 'pointer' : 'not-allowed',
              opacity: streaming ? 1 : 0.6,
              transition: 'background-color 0.3s',
            }}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!streaming}
          >
            {isRecording ? 'Stop Recording' : 'Record'}
          </button>
        </div>
        {recordingStatus && (
          <p style={{ marginTop: '10px', fontSize: '14px', color: '#444' }}>
            {recordingStatus}
          </p>
        )}
      </div>
    </div>
  );
};

export default CameraProcessor;
