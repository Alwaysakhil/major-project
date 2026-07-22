import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from './utils/api';

const History = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    try {
      console.log('Fetching history from:', `${API_URL}/history`);
      const result = await axios.get(`${API_URL}/history`);
      console.log('History response:', result.data);
      setHistory(result.data.history || []);
      setCurrentPage(1);
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('History fetch error:', err);
      setError('Failed to load history: ' + err.message);
      setHistory([]);
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(history.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = history.slice(startIndex, endIndex);
  const getPreviewUrl = (item) => {
    const previewFile = item.preview_file || item.output;
    return previewFile ? `${API_URL}/file/${encodeURIComponent(previewFile)}` : '';
  };
  const getDownloadUrl = (filename) => `${API_URL}/download/${encodeURIComponent(filename)}`;

  const handleDelete = async (filename) => {
    if (!filename) {
      return;
    }

    const confirmed = window.confirm(`Delete ${filename} from history?`);
    if (!confirmed) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/history/${encodeURIComponent(filename)}`);
      setHistory((prevHistory) => {
        const updatedHistory = prevHistory.filter((entry) => entry.output !== filename);
        const updatedTotalPages = Math.max(1, Math.ceil(updatedHistory.length / itemsPerPage));
        setCurrentPage((page) => Math.min(page, updatedTotalPages));
        return updatedHistory;
      });
      setError(null);
    } catch (err) {
      console.error('Delete history item error:', err);
      setError('Failed to delete history item: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (loading) {
    return <div className="component-container"><p>Loading history...</p></div>;
  }

  return (
    <div className="component-container">
      <h2>Processing History</h2>

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button onClick={fetchHistory} className="button">
          Refresh
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {history.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#666' }}>No processing history yet.</p>
      ) : (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Output File</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Preview</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Details</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px' }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>
                        {item.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {item.output ? (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ flex: 1 }}>{item.output}</span>
                          <a
                            href={getDownloadUrl(item.output)}
                            download
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#4caf50',
                              color: '#fff',
                              textDecoration: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Download
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.output)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#d32f2f',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {item.type === 'recording' && item.output ? (
                        <video
                          src={getPreviewUrl(item)}
                          controls
                          preload="metadata"
                          style={{
                            width: '220px',
                            maxWidth: '100%',
                            borderRadius: '6px',
                            border: '1px solid #ddd'
                          }}
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {item.type === 'recording'
                        ? (item.duration_seconds ? `${item.duration_seconds.toFixed(2)}s clip` : 'Recorded clip')
                        : (item.frames ? `${item.frames} frames${item.processing_time ? ` - ${item.processing_time.toFixed(2)}s` : ''}` : '-')}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#666' }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px' }}>
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              style={{
                padding: '8px 12px',
                backgroundColor: currentPage === 1 ? '#ccc' : '#5d35c4',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Previous
            </button>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', minWidth: '120px', textAlign: 'center' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              style={{
                padding: '8px 12px',
                backgroundColor: currentPage === totalPages ? '#ccc' : '#5d35c4',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
