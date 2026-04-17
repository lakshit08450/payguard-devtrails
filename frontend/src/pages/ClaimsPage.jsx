import { useEffect, useMemo, useState } from 'react';
import {
	AlertTriangle,
	CheckCircle2,
	CloudRain,
	PlayCircle,
	PauseCircle,
	Radar,
	ShieldCheck,
	ShieldAlert,
	Wallet,
} from 'lucide-react';
import { monitorAPI, simulateAPI } from '../api';
import { useApp } from '../contexts/AppContext';

const DEFAULT_FORM = {
	city: 'Mumbai',
	rainfall: 10,
	platform: 'Swiggy',
	duration: 45,
	strikeCity: 'Delhi',
	severity: 'medium',
	reason: 'Suspicious login pattern',
};

function formatCurrency(amount) {
	return `Rs ${Number(amount || 0).toLocaleString('en-IN')}`;
}

function formatPayoutSentence(payout) {
	if (!payout) return 'Payout held pending manual review';
	const method = payout.paymentMethod || payout.method || 'UPI';
	return `₹${Number(payout.amount || 0).toLocaleString('en-IN')} credited via ${method} (Txn: ${payout.transactionId})`;
}

function StatusPill({ value }) {
	const tone = value === 'APPROVED' || value === 'LOW_RISK' || value === 'QUEUED' || value === 'done'
		|| value === 'SUCCESS' || value === 'SETTLED'
		? 'pill-safe'
		: value === 'PENDING_REVIEW' || value === 'MEDIUM_RISK'
			? 'pill-warn'
			: value === 'HIGH_RISK'
				? 'pill-danger'
				: 'pill-info';

	return <span className={`pill ${tone}`}>{value}</span>;
}

function StageRail({ stages = [] }) {
	if (!Array.isArray(stages) || stages.length === 0) return null;

	return (
		<div className="claims-stage-rail">
			{stages.map((stage, index) => (
				<div key={stage.step} className="claims-stage-node">
					<div className="claims-stage-dot">{index + 1}</div>
					<div>
						<strong>{stage.step.replaceAll('_', ' ')}</strong>
						<div><StatusPill value={stage.status} /></div>
					</div>
				</div>
			))}
		</div>
	);
}

export default function ClaimsPage() {
	const { user } = useApp();
	const [form, setForm] = useState(DEFAULT_FORM);
	const [loadingType, setLoadingType] = useState('');
	const [processingText, setProcessingText] = useState('');
	const [lastResult, setLastResult] = useState(null);
	const [timeline, setTimeline] = useState({ claims: [], payouts: [] });
	const [detailedTimeline, setDetailedTimeline] = useState([]);
	const [latestAutoActivity, setLatestAutoActivity] = useState(null);
	const [monitoring, setMonitoring] = useState({ isMonitoring: false, users: [] });
	const [monitorBusy, setMonitorBusy] = useState(false);
	const [error, setError] = useState('');
	const [autoFeedback, setAutoFeedback] = useState('');

	const userId = user?.id;

	const triggerButtons = useMemo(() => [
		{
			key: 'WEATHER',
			label: 'Weather Trigger',
			run: () => simulateAPI.weather({ userId, city: form.city, rainfall: Number(form.rainfall || 0) }),
		},
		{
			key: 'DOWNTIME',
			label: 'Downtime Trigger',
			run: () => simulateAPI.downtime({ userId, platform: form.platform, duration: Number(form.duration || 0) }),
		},
		{
			key: 'STRIKE',
			label: 'Strike Trigger',
			run: () => simulateAPI.strike({ userId, city: form.strikeCity }),
		},
		{
			key: 'ACCIDENT',
			label: 'Accident Trigger',
			run: () => simulateAPI.accident({ userId, severity: form.severity }),
		},
		{
			key: 'ACCOUNT_BLOCK',
			label: 'Account Block Trigger',
			run: () => simulateAPI.accountBlock({ userId, reason: form.reason }),
		},
	], [form, userId]);

	const refreshTimeline = async () => {
		if (!userId) return;

		const [summaryRes, detailedRes] = await Promise.all([
			simulateAPI.timeline(userId),
			simulateAPI.detailedTimeline(userId),
		]);

		setTimeline({
			claims: summaryRes.data.claims || [],
			payouts: summaryRes.data.payouts || [],
		});

		const entries = detailedRes.data.entries || [];
		setDetailedTimeline(entries);

		const latestAuto = entries.find((entry) => entry?.event?.meta?.autoMonitored);
		if (latestAuto) {
			setLatestAutoActivity((prev) => {
				if (!prev) return latestAuto;
				const prevTs = new Date(prev.timestamp || 0).getTime();
				const nextTs = new Date(latestAuto.timestamp || 0).getTime();
				return nextTs > prevTs ? latestAuto : prev;
			});
		}
	};

	const refreshMonitoring = async () => {
		const { data } = await monitorAPI.status();
		setMonitoring(data.monitoring || { isMonitoring: false, users: [] });
	};

	useEffect(() => {
		refreshMonitoring().catch(() => {
			setMonitoring({ isMonitoring: false, users: [] });
		});
	}, []);

	useEffect(() => {
		refreshTimeline().catch(() => {
			setTimeline({ claims: [], payouts: [] });
			setDetailedTimeline([]);
		});
	}, [userId]);

	useEffect(() => {
		if (!userId) return;

		const pollTimer = setInterval(() => {
			refreshTimeline().catch(() => {});
			refreshMonitoring().catch(() => {});
		}, 3000);

		return () => clearInterval(pollTimer);
	}, [userId]);

	useEffect(() => {
		if (!userId) return;

		const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
		const streamBase = apiBase.replace(/\/?$/, '');
		const stream = new EventSource(`${streamBase}/monitor/stream?userId=${encodeURIComponent(userId)}`);

		stream.addEventListener('monitor-event', (evt) => {
			try {
				const payload = JSON.parse(evt.data);
				setLastResult(payload);
				setLatestAutoActivity(payload);
				refreshTimeline().catch(() => {});
			} catch {
				// Ignore malformed monitor stream payloads.
			}
		});

		return () => stream.close();
	}, [userId]);

	useEffect(() => {
		if (!latestAutoActivity) return;

		const steps = [
			'🚀 Auto Claim Triggered!',
			'Processing claim...',
			'Fraud analysis complete',
			'Payout successful',
		];

		let index = 0;
		setAutoFeedback(steps[index]);

		const interval = setInterval(() => {
			index += 1;
			if (index >= steps.length) {
				clearInterval(interval);
				setTimeout(() => setAutoFeedback(''), 1200);
				return;
			}
			setAutoFeedback(steps[index]);
		}, 900);

		return () => clearInterval(interval);
	}, [latestAutoActivity?.timestamp]);

	const toggleMonitoring = async () => {
		if (!userId || monitorBusy) return;

		setMonitorBusy(true);
		setError('');

		try {
			if (isUserMonitoring) {
				await monitorAPI.stop({ userId });
			} else {
				const configuredThreshold = Number(monitoring?.config?.rainThreshold || monitorInfo?.rainfallThreshold || 60);
				await monitorAPI.start({
					userId,
					city: form.city,
					rainfallThreshold: configuredThreshold,
					intervalSec: 45,
					cooldownMs: 300000,
				});
			}

			await refreshMonitoring();
		} catch (err) {
			setError(err.response?.data?.message || err.message || 'Unable to toggle monitoring');
		} finally {
			setMonitorBusy(false);
		}
	};

	const fireTrigger = async (trigger) => {
		if (!userId) {
			setError('Login required before firing triggers.');
			return;
		}

		setError('');
		setLoadingType(trigger.key);
		setProcessingText('Detecting disruption...');

		const loadingStates = [
			'Detecting disruption...',
			'Creating claim...',
			'Running fraud analysis...',
			'Processing payout...',
		];

		let stateIndex = 0;
		const stateTimer = setInterval(() => {
			stateIndex = (stateIndex + 1) % loadingStates.length;
			setProcessingText(loadingStates[stateIndex]);
		}, 850);

		try {
			const { data } = await trigger.run();
			setLastResult(data);
			setProcessingText('Completed');
			await refreshTimeline();
		} catch (err) {
			setError(err.response?.data?.message || err.message || 'Trigger failed');
		} finally {
			clearInterval(stateTimer);
			setTimeout(() => setProcessingText(''), 700);
			setLoadingType('');
		}
	};

	const monitorInfo = monitoring.users?.find((entry) => String(entry.userId) === String(userId));
	const isUserMonitoring = Boolean(monitorInfo);

	return (
		<div className="worker-dashboard claims-dashboard">
			<section className="card" style={{ marginBottom: 16 }}>
				<div className="section-head">
					<div>
						<h3>Claim Simulation Lab</h3>
						<p>Real-time disruption engine with zero-touch automation, explainability, and payout simulation.</p>
					</div>
					<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
						<span className="pill pill-info">User: {userId || 'Not logged in'}</span>
						<span className={`pill ${isUserMonitoring ? 'pill-safe' : 'pill-warn'}`}>
							Auto Monitoring: {isUserMonitoring ? 'Active' : 'Inactive'}
						</span>
					</div>
				</div>

				<div className="claims-hero-stats">
					<div className="card-sm">
						<span className="muted-label">Latest Rainfall</span>
						<strong>{monitorInfo?.lastObservedRainfall ?? 0} mm</strong>
					</div>
					<div className="card-sm">
						<span className="muted-label">Threshold</span>
						<strong>{monitorInfo?.rainfallThreshold ?? 60} mm</strong>
					</div>
					<div className="card-sm">
						<span className="muted-label">Cooldown</span>
						<strong>{Math.round((monitorInfo?.cooldownMs ?? 300000) / 60000)} min</strong>
					</div>
					<div className="card-sm">
						<span className="muted-label">Last Checked</span>
						<strong>{monitorInfo?.lastCheckedAt ? new Date(monitorInfo.lastCheckedAt).toLocaleTimeString('en-IN') : '--:--'}</strong>
					</div>
					<div className="card-sm">
						<span className="muted-label">Last Trigger</span>
						<strong>{monitorInfo?.lastTriggeredAt ? new Date(monitorInfo.lastTriggeredAt).toLocaleTimeString('en-IN') : 'None yet'}</strong>
					</div>
				</div>

				<div className="claims-monitor-bar">
					<div>
						<strong>Zero-touch Mode</strong>
						<p>Automatically checks OpenWeather every 30-60s and fires weather claims when rainfall exceeds threshold.</p>
					</div>
					<button className={isUserMonitoring ? 'btn-outline' : 'btn-primary'} disabled={!userId || monitorBusy} onClick={toggleMonitoring}>
						{monitorBusy ? 'Updating...' : isUserMonitoring ? <><PauseCircle size={15} /> Stop Monitoring</> : <><PlayCircle size={15} /> Start Monitoring</>}
					</button>
				</div>

				<div className="claims-auto-activity">
					<div>
						<strong>🤖 Auto Monitoring Activity</strong>
						<p>
							{latestAutoActivity
								? `🚀 Auto Claim Triggered (${latestAutoActivity.event?.type || 'WEATHER'} - ${latestAutoActivity.event?.meta?.weatherDescription || 'Heavy Rain'})`
								: 'No auto-trigger yet. Turn on auto monitoring and watch live events.'}
						</p>
					</div>
					<span className="pill pill-info">
						{latestAutoActivity?.timestamp ? new Date(latestAutoActivity.timestamp).toLocaleString('en-IN') : 'Awaiting event'}
					</span>
				</div>

				<div className="claims-form-grid">
					<label>
						Weather City
						<input className="input-field" value={form.city} onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))} />
					</label>
					<label>
						Rainfall (mm)
						<input className="input-field" type="number" value={form.rainfall} onChange={(e) => setForm((s) => ({ ...s, rainfall: e.target.value }))} />
					</label>
					<label>
						Platform
						<input className="input-field" value={form.platform} onChange={(e) => setForm((s) => ({ ...s, platform: e.target.value }))} />
					</label>
					<label>
						Downtime (min)
						<input className="input-field" type="number" value={form.duration} onChange={(e) => setForm((s) => ({ ...s, duration: e.target.value }))} />
					</label>
					<label>
						Strike City
						<input className="input-field" value={form.strikeCity} onChange={(e) => setForm((s) => ({ ...s, strikeCity: e.target.value }))} />
					</label>
					<label>
						Accident Severity
						<select className="input-field" value={form.severity} onChange={(e) => setForm((s) => ({ ...s, severity: e.target.value }))}>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="critical">Critical</option>
						</select>
					</label>
					<label style={{ gridColumn: '1 / -1' }}>
						Account Block Reason
						<input className="input-field" value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} />
					</label>
				</div>

				<div className="claims-trigger-grid">
					{triggerButtons.map((trigger) => (
						<button
							key={trigger.key}
							className="btn-primary"
							disabled={loadingType !== ''}
							onClick={() => fireTrigger(trigger)}
						>
							{loadingType === trigger.key ? 'Processing...' : trigger.label}
						</button>
					))}
					<button className="btn-outline" onClick={refreshTimeline} disabled={!userId}>Refresh Claim Timeline</button>
				</div>

				{error && (
					<div className="admin-alert" style={{ marginTop: 14 }}>
						<AlertTriangle size={16} /> {error}
					</div>
				)}

				{loadingType && (
					<div className="claims-processing-banner">
						<Radar size={16} /> {processingText || 'Processing...'}
					</div>
				)}

				{autoFeedback && (
					<div className="claims-auto-feedback">
						{autoFeedback}
					</div>
				)}
			</section>

			{lastResult && (
				<section className="worker-grid worker-grid-tables" style={{ marginBottom: 16 }}>
					<div className="card worker-panel">
						<div className="section-head">
							<div>
								<h3>Last Triggered Event</h3>
								<p>Raw JSON payload from trigger and weather metadata.</p>
							</div>
							<CloudRain size={18} color="var(--teal)" />
						</div>
						<div className="claims-json-box">
							<pre>{JSON.stringify(lastResult.event, null, 2)}</pre>
						</div>
					</div>

					<div className="card worker-panel">
						<div className="section-head">
							<div>
								<h3>Pipeline Output</h3>
								<p>Detecting - Claim - Fraud - Payout with explainable decisions.</p>
							</div>
							<CheckCircle2 size={18} color="var(--green)" />
						</div>

						<div className="claims-pipeline-grid">
							<div className="card-sm">
								<span className="muted-label">Claim</span>
								<strong>{lastResult.claim?.claimId || '-'}</strong>
								<div style={{ marginTop: 8 }}><StatusPill value={lastResult.claim?.status || '-'} /></div>
								<div className="muted-copy" style={{ marginTop: 6 }}>{formatCurrency(lastResult.claim?.amount)}</div>
							</div>
							<div className="card-sm">
								<span className="muted-label">Fraud Check</span>
								<strong>{lastResult.fraudCheck?.fraudScore ?? '-'}%</strong>
								<div style={{ marginTop: 8 }}><StatusPill value={lastResult.fraudCheck?.status || '-'} /></div>
								<div className="muted-copy" style={{ marginTop: 6 }}>Confidence: {lastResult.fraudCheck?.confidence ?? '-'}%</div>
							</div>
							<div className="card-sm">
								<span className="muted-label">Payout</span>
								<strong>{lastResult.payout?.transactionId || 'Not created'}</strong>
								<div style={{ marginTop: 8 }}><StatusPill value={lastResult.payout?.status || 'N/A'} /></div>
								<div className="muted-copy" style={{ marginTop: 6 }}>{formatPayoutSentence(lastResult.payout)}</div>
							</div>
						</div>

						<StageRail stages={lastResult.stages} />

						<div className="claims-fraud-box">
							<span className="muted-label">Fraud Reasons</span>
							{(lastResult.fraudCheck?.reasons || []).length > 0 ? (
								<ul>
									{lastResult.fraudCheck.reasons.map((reason) => <li key={reason}>{reason}</li>)}
								</ul>
							) : (
								<p className="muted-copy">Low-risk profile in this run.</p>
							)}
						</div>

						{lastResult.decisionLog && (
							<div className="claims-decision-log">
								<span className="muted-label">Decision Log</span>
								<p>{lastResult.decisionLog}</p>
							</div>
						)}
					</div>
				</section>
			)}

			<section className="worker-grid worker-grid-tables">
				<div className="card worker-panel">
					<div className="section-head">
						<div>
							<h3>Live Timeline</h3>
							<p>Events, claims, fraud outcomes, payouts, and decisions in one table.</p>
						</div>
						<ShieldCheck size={18} color="var(--teal)" />
					</div>
					<div className="table-wrap">
						<table className="dashboard-table">
							<thead>
								<tr>
									<th>Time</th>
									<th>Event</th>
									<th>Claim</th>
									<th>Fraud</th>
									<th>Payout</th>
								</tr>
							</thead>
							<tbody>
								{detailedTimeline.length === 0 && (
									<tr><td colSpan={5} style={{ color: 'var(--text3)' }}>No timeline entries yet.</td></tr>
								)}
								{detailedTimeline.map((entry) => (
									<tr key={entry.claim?.claimId || entry.timestamp}>
										<td>{new Date(entry.timestamp).toLocaleTimeString('en-IN')}</td>
										<td>{entry.event?.type}</td>
										<td>{entry.claim?.claimId || '-'}</td>
										<td>
											<div><StatusPill value={entry.fraudCheck?.status || '-'} /></div>
											<div className="muted-copy" style={{ marginTop: 4 }}>{entry.fraudCheck?.fraudScore ?? 0}%</div>
										</td>
										<td>{formatPayoutSentence(entry.payout)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				<div className="card worker-panel">
					<div className="section-head">
						<div>
							<h3>Payout Queue</h3>
							<p>Approved payouts generated by the zero-touch pipeline.</p>
						</div>
						<Wallet size={18} color="var(--green)" />
					</div>
					<div className="table-wrap">
						<table className="dashboard-table">
							<thead>
								<tr>
									<th>Transaction ID</th>
									<th>Claim ID</th>
									<th>Amount</th>
									<th>Method</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{timeline.payouts.length === 0 && (
									<tr><td colSpan={5} style={{ color: 'var(--text3)' }}>No payouts yet.</td></tr>
								)}
								{timeline.payouts.map((payout) => (
									<tr key={payout.transactionId}>
										<td>{payout.transactionId}</td>
										<td>{payout.claimId}</td>
										<td>{formatCurrency(payout.amount)}</td>
										<td>{payout.paymentMethod || payout.method || 'UPI'}</td>
										<td><StatusPill value={payout.status} /></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="claims-subtle-note">
						<ShieldAlert size={14} /> Auto-monitor updates stream in real time while this page is open.
					</div>
				</div>
			</section>
		</div>
	);
}
