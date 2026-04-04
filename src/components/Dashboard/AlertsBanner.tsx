import { useState, useEffect, useCallback } from 'react';
import { useHealthStore, type HealthAlert } from '../../stores/healthStore';
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { formatDate } from '../../lib/utils';

const DISMISSED_KEY = 'ethos-dismissed-alerts';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

export default function AlertsBanner() {
  const alerts = useHealthStore(s => s.alerts);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  // Sync dismissed set from localStorage on mount
  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const activeAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (activeAlerts.length === 0) return null;

  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = activeAlerts.filter(a => a.severity === 'warning').length;
  const infoCount = activeAlerts.filter(a => a.severity === 'info').length;

  // Determine banner accent color based on most severe active alert
  const bannerSeverity = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'info';

  return (
    <div className={`alerts-banner alerts-banner-${bannerSeverity}`}>
      <div className="alerts-banner-header" onClick={() => setCollapsed(c => !c)}>
        <div className="alerts-banner-title">
          <Bell size={14} />
          <span className="alerts-banner-count">{activeAlerts.length} active alert{activeAlerts.length !== 1 ? 's' : ''}</span>
          {criticalCount > 0 && <span className="badge badge-error">{criticalCount} critical</span>}
          {warningCount > 0 && <span className="badge badge-warning">{warningCount} warning</span>}
          {infoCount > 0 && <span className="badge badge-primary">{infoCount} info</span>}
        </div>
        <button className="alerts-banner-toggle" aria-label={collapsed ? 'Expand alerts' : 'Collapse alerts'}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="alerts-banner-list">
          {activeAlerts.map(alert => (
            <AlertItem
              key={alert.id}
              alert={alert}
              expanded={expandedId === alert.id}
              onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
              onDismiss={() => dismiss(alert.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertItem({ alert, expanded, onToggle, onDismiss }: {
  alert: HealthAlert;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  const Icon = alert.severity === 'critical' ? AlertTriangle
    : alert.severity === 'warning' ? AlertCircle
    : Info;

  return (
    <div className={`alert-item alert-item-${alert.severity}`}>
      <div className="alert-item-row" onClick={onToggle}>
        <Icon size={14} className="alert-item-icon" />
        <span className="alert-item-title">{alert.title}</span>
        {alert.body_region && <span className="badge badge-muted">{alert.body_region}</span>}
        <span className="alert-item-date">{formatDate(alert.date)}</span>
        <button
          className="alert-item-dismiss"
          onClick={e => { e.stopPropagation(); onDismiss(); }}
          aria-label="Dismiss alert"
        >
          <X size={12} />
        </button>
      </div>
      {expanded && (
        <div className="alert-item-detail">
          <p>{alert.message}</p>
          {alert.metric_name && (
            <span className="badge badge-muted">{alert.metric_name}</span>
          )}
        </div>
      )}
    </div>
  );
}
