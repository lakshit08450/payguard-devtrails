import { useEffect, useState } from 'react';
import { AlertTriangle, Save, Settings2 } from 'lucide-react';
import { adminAPI } from '../api';

export default function AdminControlPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [config, setConfig] = useState({
    rainThreshold: 60,
    fraudSensitivity: 'medium',
  });

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await adminAPI.controlCenter();
        const serverConfig = data?.config || {};
        if (!ignore) {
          setConfig({
            rainThreshold: Number(serverConfig.rainThreshold || 60),
            fraudSensitivity: String(serverConfig.fraudSensitivity || 'medium').toLowerCase(),
          });
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.response?.data?.message || 'Unable to load control settings.');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await adminAPI.config({
        rainThreshold: Number(config.rainThreshold || 60),
        fraudSensitivity: config.fraudSensitivity,
      });
      setSuccess('Control settings updated successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to save control settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-grid" style={{ gap: 16 }}>
      <section className="admin-hero">
        <div>
          <span className="admin-kicker">Control Panel</span>
          <h1>Manage system thresholds without touching backend service code.</h1>
          <p>All updates use existing admin configuration API endpoints.</p>
        </div>
      </section>

      {error && (
        <div className="admin-alert">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {success && (
        <div className="event-chip">
          <Settings2 size={15} /> {success}
        </div>
      )}

      <section className="card admin-panel" style={{ maxWidth: 620 }}>
        <div className="section-head">
          <div>
            <h3>Automation Settings</h3>
            <p>Tune rainfall trigger thresholds and fraud sensitivity profiles.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label>Rainfall Threshold (mm)</label>
            <input
              className="input-field"
              type="number"
              min={1}
              value={config.rainThreshold}
              disabled={loading}
              onChange={(e) => setConfig((prev) => ({ ...prev, rainThreshold: Number(e.target.value || 60) }))}
            />
          </div>

          <div>
            <label>Fraud Sensitivity</label>
            <select
              className="input-field"
              value={config.fraudSensitivity}
              disabled={loading}
              onChange={(e) => setConfig((prev) => ({ ...prev, fraudSensitivity: e.target.value }))}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <button className="btn-primary" onClick={saveConfig} disabled={loading || saving} style={{ justifyContent: 'center' }}>
            <Save size={15} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </section>
    </div>
  );
}
