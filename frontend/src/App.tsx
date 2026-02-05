import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, Image as ImageIcon, Loader2, Send, History, ArrowLeft, Eye, Clapperboard, Film } from 'lucide-react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';

interface ImageRecord {
  id: number;
  filename: string;
  file_path: string;
  media_type: 'image' | 'movie';
  tags: string;
  description: string;
  created_at: string;
}

const API_BASE_URL = 'http://localhost:8000';

function Navbar() {
  return (
    <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white hover:text-blue-400 transition-colors">
          <Clapperboard className="text-blue-500" size={24} />
          CineStealr
        </Link>
        <nav className="flex gap-4">
          <Link to="/" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2">
            <Upload size={18} /> New Analysis
          </Link>
          <Link to="/history" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2">
            <History size={18} /> History
          </Link>
        </nav>
      </div>
    </header>
  );
}

function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'movie'>('image');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('media_type', mediaType);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData);
      navigate(`/details/${response.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred during upload.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-12 px-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Upload className="text-blue-500" /> Upload Scene
        </h2>
        
        <div className="flex flex-col gap-6">
          <label className="relative group cursor-pointer">
            <div className={`aspect-video w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${preview ? 'border-blue-500/50' : 'border-slate-600 hover:border-blue-500/50 bg-slate-900/50'}`}>
              {preview ? (
                <img src={preview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
              ) : (
                <>
                  <ImageIcon className="text-slate-500 group-hover:text-blue-400 mb-4" size={64} />
                  <p className="text-slate-400 text-lg font-medium group-hover:text-slate-200">Click to select an image</p>
                  <p className="text-slate-500 text-sm mt-2">JPG, PNG supported</p>
                </>
              )}
            </div>
            <input type="file" className="hidden" onChange={handleFileChange} accept="image/*" />
          </label>

          <div className="flex gap-4">
            <button
              onClick={() => setMediaType('image')}
              className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                mediaType === 'image' 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <ImageIcon size={18} /> Image Analysis
            </button>
            <button
              onClick={() => setMediaType('movie')}
              className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                mediaType === 'movie' 
                  ? 'bg-purple-600 border-purple-500 text-white' 
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Clapperboard size={18} /> Movie Scene
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] ${
              loading || !file 
                ? 'bg-slate-700 cursor-not-allowed text-slate-400'
                : mediaType === 'image' 
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20' 
                  : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" /> Analyzing...
              </>
            ) : (
              <>
                <Send size={20} /> Start Analysis
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryPage() {
  const [records, setRecords] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/records`);
      setRecords(response.data);
    } catch (err) {
      console.error('Failed to fetch records', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center mt-20">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-8 px-4">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <History className="text-blue-500" /> Analysis History
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {records.map((record) => (
          <Link key={record.id} to={`/details/${record.id}`} className="group bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/10 transition-all block">
            <div className="aspect-video bg-slate-900 relative overflow-hidden">
              <img 
                src={`${API_BASE_URL}${record.file_path}`} 
                alt={record.filename} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-2 right-2">
                {record.media_type === 'movie' ? (
                  <span className="bg-purple-600/90 text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 shadow-sm backdrop-blur-sm">
                    <Film size={12} /> MOVIE
                  </span>
                ) : (
                  <span className="bg-blue-600/90 text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 shadow-sm backdrop-blur-sm">
                    <ImageIcon size={12} /> IMAGE
                  </span>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                <span className="text-white text-sm font-medium flex items-center gap-1">
                  <Eye size={16} /> View Details
                </span>
              </div>
            </div>
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs text-slate-500">{new Date(record.created_at).toLocaleString()}</p>
              </div>
              <p className="text-sm text-slate-300 line-clamp-2 mb-3 h-10">
                {record.description || <span className="text-slate-500 italic">No description generated</span>}
              </p>
              <div className="flex flex-wrap gap-1">
                {record.tags.split(',').slice(0, 3).map((tag, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 rounded-md">
                    {tag}
                  </span>
                ))}
                {record.tags.split(',').length > 3 && (
                  <span className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-400 rounded-md">
                    +{record.tags.split(',').length - 3}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
      
      {records.length === 0 && (
        <div className="text-center py-20 bg-slate-800/50 rounded-2xl border border-dashed border-slate-700">
          <p className="text-slate-500 text-lg">No analysis history found.</p>
          <Link to="/" className="text-blue-400 hover:underline mt-2 inline-block">Start your first analysis</Link>
        </div>
      )}
    </div>
  );
}

function DetailPage() {
  const { id } = useParams();
  const [record, setRecord] = useState<ImageRecord | null>(null);
  const [description, setDescription] = useState("");
  const [streaming, setStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetchRecord();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [id]);

  const fetchRecord = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/record/${id}`);
      setRecord(response.data);
      if (response.data.description) {
        setDescription(response.data.description);
      } else {
        startStreaming();
      }
    } catch (err) {
      console.error('Failed to fetch record', err);
    }
  };

  const startStreaming = () => {
    setStreaming(true);
    const eventSource = new EventSource(`${API_BASE_URL}/stream/${id}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        eventSource.close();
        setStreaming(false);
      } else {
        setDescription((prev) => prev + event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      eventSource.close();
      setStreaming(false);
    };
  };

  if (!record) {
    return (
      <div className="flex justify-center mt-20">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-8 px-4 pb-12">
      <div className="flex items-center justify-between mb-6">
        <Link to="/history" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={18} /> Back to History
        </Link>
        {record.media_type === 'movie' && (
          <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-2">
            <Clapperboard size={14} /> Movie Scene Context
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800 p-2 rounded-2xl shadow-xl border border-slate-700 h-fit">
          <img 
            src={`${API_BASE_URL}${record.file_path}`} 
            alt={record.filename} 
            className="w-full rounded-xl"
          />
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700">
            <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-3">Detected Elements</h3>
            <div className="flex flex-wrap gap-2">
              {record.tags.split(',').map((tag, i) => (
                <span key={i} className="px-3 py-1 bg-blue-500/10 text-blue-300 rounded-full text-sm font-medium border border-blue-500/20">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700 min-h-[300px] relative">
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-sm font-bold uppercase tracking-wider ${record.media_type === 'movie' ? 'text-purple-400' : 'text-green-400'}`}>
                {record.media_type === 'movie' ? 'Cinematic Analysis' : 'Scene Description'}
              </h3>
              <div className="flex items-center gap-2">
                {streaming && (
                  <>
                    <span className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full animate-pulse">
                      <Loader2 size={12} className="animate-spin" /> Generating...
                    </span>
                    <button 
                      onClick={() => {
                        if (eventSourceRef.current) {
                          eventSourceRef.current.close();
                          setStreaming(false);
                        }
                      }}
                      className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-md hover:bg-red-500/30 transition-colors"
                    >
                      Stop
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <div className="prose prose-invert max-w-none">
              <p className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap font-serif">
                {description}
                {streaming && <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse"></span>}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
        <Navbar />
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/details/:id" element={<DetailPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;