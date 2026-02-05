import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Settings, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_BASE_URL = 'http://localhost:8000';

interface SettingsData {
    llm_api_url: string;
    llm_api_key: string;
    llm_model_name: string;
    history_retention_days: string;
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<SettingsData>({
        llm_api_url: '',
        llm_api_key: '',
        llm_model_name: '',
        history_retention_days: '0',
    });
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [fetchingModels, setFetchingModels] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [showClearConfirm, setShowClearConfirm] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/settings`);
            setSettings(prev => ({
                ...prev,
                ...response.data
            }));
        } catch (err) {
            console.error('Failed to fetch settings', err);
            setMessage({ type: 'error', text: 'Failed to load settings.' });
        } finally {
            setLoading(false);
        }
    };

    const fetchModels = async () => {
        setFetchingModels(true);
        setMessage(null);
        try {
            // First save current API URL/Key so backend can use them
            await Promise.all([
                axios.post(`${API_BASE_URL}/settings`, { key: 'llm_api_url', value: settings.llm_api_url }),
                axios.post(`${API_BASE_URL}/settings`, { key: 'llm_api_key', value: settings.llm_api_key })
            ]);

            const response = await axios.get(`${API_BASE_URL}/proxy/models`);
            const models = response.data.data.map((m: any) => m.id);
            setAvailableModels(models);

            if (models.length > 0) {
                setMessage({ type: 'success', text: `Found ${models.length} models.` });
            } else {
                setMessage({ type: 'error', text: 'No models found. Check URL/Key.' });
            }
        } catch (err) {
            console.error('Failed to fetch models', err);
            setMessage({ type: 'error', text: 'Failed to fetch models.' });
        } finally {
            setFetchingModels(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        // Save each setting individually (Sequential to avoid DB locks)
        try {
            await axios.post(`${API_BASE_URL}/settings`, { key: 'llm_api_url', value: settings.llm_api_url });
            await axios.post(`${API_BASE_URL}/settings`, { key: 'llm_api_key', value: settings.llm_api_key });
            await axios.post(`${API_BASE_URL}/settings`, { key: 'llm_model_name', value: settings.llm_model_name });
            await axios.post(`${API_BASE_URL}/settings`, { key: 'history_retention_days', value: settings.history_retention_days });

            setMessage({ type: 'success', text: 'Settings saved successfully.' });
        } catch (err) {
            console.error('Failed to save settings', err);
            setMessage({ type: 'error', text: 'Failed to save settings. See console.' });
        } finally {
            setSaving(false);
        }
    };

    const clearHistory = async () => {
        try {
            await axios.delete(`${API_BASE_URL}/records`);
            setShowClearConfirm(false);
            setMessage({ type: 'success', text: 'History cleared successfully.' });
        } catch (err) {
            console.error('Failed to clear history', err);
            setMessage({ type: 'error', text: 'Failed to clear history.' });
        }
    };

    const exportHistory = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/export`);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(response.data, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "cinestealr_history.json");
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            setMessage({ type: 'success', text: 'Export started.' });
        } catch (err) {
            console.error('Failed to export history', err);
            setMessage({ type: 'error', text: 'Failed to export history.' });
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center mt-20">
                <div className="animate-spin text-blue-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto mt-8 px-4 pb-12">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Settings className="text-blue-500" /> Settings
                </h2>
                <Link to="/" className="text-slate-400 hover:text-white flex items-center gap-2">
                    <ArrowLeft size={18} /> Back to Home
                </Link>
            </div>

            <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
                <form onSubmit={handleSave} className="space-y-8">

                    {/* LLM Configuration */}
                    <section className="space-y-4">
                        <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                            LLM Configuration
                        </h3>

                        {/* API URL */}
                        <div className="space-y-3">
                            <label htmlFor="llm_api_url" className="block text-sm font-medium text-slate-300">
                                LLM API Endpoint
                            </label>
                            <input
                                type="text"
                                id="llm_api_url"
                                name="llm_api_url"
                                value={settings.llm_api_url}
                                onChange={handleChange}
                                placeholder="http://localhost:8080/v1/chat/completions"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono text-sm"
                            />

                            {/* Examples */}
                            <div className="bg-slate-900/50 rounded-lg p-3 text-xs space-y-2 border border-slate-700/50">
                                <p className="text-slate-400 font-medium">Examples (Containerized Backend):</p>
                                <div className="grid grid-cols-1 gap-2 text-slate-500">
                                    <div className="flex flex-col">
                                        <span className="text-slate-400">Native Mac (Podman):</span>
                                        <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300 select-all">http://host.containers.internal:8080/v1/chat/completions</code>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-slate-400">Ollama (Host):</span>
                                        <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300 select-all">http://host.containers.internal:11434/v1/chat/completions</code>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-slate-400">OpenAI:</span>
                                        <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300 select-all">https://api.openai.com/v1/chat/completions</code>
                                    </div>
                                </div>
                                <p className="text-[10px] text-yellow-500/80 italic mt-1">
                                    Note: Use 'host.containers.internal' instead of 'localhost' to reach services running on your Mac from inside the backend container.
                                </p>
                            </div>
                        </div>

                        {/* API Key */}
                        <div className="space-y-2">
                            <label htmlFor="llm_api_key" className="block text-sm font-medium text-slate-300">
                                API Key <span className="text-slate-500 font-normal">(Optional)</span>
                            </label>
                            <input
                                type="password"
                                id="llm_api_key"
                                name="llm_api_key"
                                value={settings.llm_api_key}
                                onChange={handleChange}
                                placeholder="sk-..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono text-sm"
                            />
                            <p className="text-xs text-slate-500">
                                Required for providers like OpenAI. Leave empty for local models if not needed.
                            </p>
                        </div>

                        {/* Model Name */}
                        <div className="space-y-2">
                            <label htmlFor="llm_model_name" className="block text-sm font-medium text-slate-300">
                                Model Name
                            </label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        id="llm_model_name"
                                        name="llm_model_name"
                                        value={settings.llm_model_name}
                                        onChange={handleChange}
                                        list="model-list"
                                        placeholder="llava-v1.5-7b-Q4_K_M.gguf"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono text-sm"
                                    />
                                    <datalist id="model-list">
                                        {availableModels.map(model => (
                                            <option key={model} value={model} />
                                        ))}
                                    </datalist>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchModels}
                                    disabled={fetchingModels}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors whitespace-nowrap"
                                >
                                    {fetchingModels ? '...' : 'Fetch Models'}
                                </button>
                            </div>
                            <p className="text-xs text-slate-500">
                                Specify the model ID to use (e.g., 'gpt-4-vision-preview', 'llama3').
                            </p>
                        </div>
                    </section>

                    {/* History Retention */}
                    <section className="space-y-4">
                        <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                            History & Retention
                        </h3>
                        <div className="space-y-2">
                            <label htmlFor="history_retention_days" className="block text-sm font-medium text-slate-300">
                                Retention Period
                            </label>
                            <select
                                id="history_retention_days"
                                name="history_retention_days"
                                value={settings.history_retention_days}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            >
                                <option value="0">Never delete history</option>
                                <option value="7">Delete after 7 days</option>
                                <option value="30">Delete after 30 days</option>
                                <option value="90">Delete after 90 days</option>
                                <option value="180">Delete after 6 months</option>
                                <option value="365">Delete after 1 year</option>
                            </select>
                            <p className="text-xs text-slate-500">
                                Automatically removes analysis records older than the selected period.
                            </p>
                        </div>
                    </section>

                    {/* Data Management */}
                    <section className="space-y-4">
                        <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                            Data Management
                        </h3>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                type="button"
                                onClick={exportHistory}
                                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <Settings size={18} className="rotate-90" /> Export History (JSON)
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowClearConfirm(true)}
                                className="px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <AlertCircle size={18} /> Clear All History
                            </button>
                        </div>
                    </section>

                    {/* Status Message */}
                    {message && (
                        <div className={`p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                            {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                            {message.text}
                        </div>
                    )}

                    {/* Save Button */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className={`w-full md:w-auto px-8 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${saving ? 'bg-blue-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                                }`}
                        >
                            <Save size={18} />
                            {saving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Clear Confirmation Modal */}
            {showClearConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 p-6 rounded-2xl max-w-md w-full border border-slate-700 shadow-2xl">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                            <AlertCircle className="text-red-500" /> Confirm Clear History
                        </h3>
                        <p className="text-slate-300 mb-6">
                            Are you sure you want to delete ALL analysis history? This action cannot be undone and will permanently remove all generated descriptions and images.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={clearHistory}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium"
                            >
                                Yes, Clear All
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
