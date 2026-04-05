import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useHealthStore } from '../stores/healthStore';

const PALETTE = ['#2dd4bf', '#818cf8', '#f472b6', '#fb923c', '#34d399'];

const PRESET_VIEWS: Record<string, string[]> = {
  Cardiovascular: ['ldl', 'cholesterol', 'triglyceride', 'hdl', 'apob'],
  Immune: ['cd3', 'cd4', 'cd8', 'wbc', 'lymphocyte'],
  Inflammation: ['calprotectin', 'aso', 'anti-dnase', 'zonulin', 'h. pylori'],
  'All Flagged': [], // special: selects all metrics with non-normal status
};

const DATE_RANGES = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'All', months: 0 },
];

interface MetricGroup {
  name: string;
  points: Array<{ date: string; value: number }>;
  unit: string;
  latestValue: number;
  latestStatus: string | null;
  refLow: number | null;
  refHigh: number | null;
}

const PADDING = { top: 28, right: 24, bottom: 48, left: 56 };

export default function TrendsPage() {
  const metrics = useHealthStore(s => s.metrics);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(0); // months, 0 = all
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 300 });

  interface TooltipData { x: number; y: number; date: string; values: Array<{ name: string; value: number; color: string; unit: string }> }
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Build grouped metrics (only numeric values, 2+ points)
  const groupedMetrics = useMemo(() => {
    const map = new Map<string, { points: Array<{ date: string; value: number }>; unit: string; status: string | null; refLow: number | null; refHigh: number | null }>();
    for (const m of metrics) {
      const val = Number(m.metric_value);
      if (isNaN(val)) continue;
      const existing = map.get(m.metric_name);
      if (!existing) {
        map.set(m.metric_name, {
          points: [{ date: m.recorded_date, value: val }],
          unit: m.metric_unit ?? '',
          status: m.status,
          refLow: m.ref_range_low,
          refHigh: m.ref_range_high,
        });
      } else {
        existing.points.push({ date: m.recorded_date, value: val });
        if (m.ref_range_low != null) existing.refLow = m.ref_range_low;
        if (m.ref_range_high != null) existing.refHigh = m.ref_range_high;
        // Keep latest status
        if (m.recorded_date > (existing.points[0]?.date ?? '')) {
          existing.status = m.status;
        }
      }
    }
    return map;
  }, [metrics]);

  // Available metric names for picker
  const availableMetrics = useMemo(() => {
    return Array.from(groupedMetrics.entries())
      .map(([name, data]) => {
        const sorted = [...data.points].sort((a, b) => b.date.localeCompare(a.date));
        return {
          name,
          latestValue: sorted[0]?.value ?? 0,
          latestStatus: data.status,
          unit: data.unit,
          pointCount: data.points.length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groupedMetrics]);

  // Filtered by search
  const filteredMetrics = useMemo(() => {
    if (!search) return availableMetrics;
    const lower = search.toLowerCase();
    return availableMetrics.filter(m => m.name.toLowerCase().includes(lower));
  }, [availableMetrics, search]);

  // Build chart data for selected metrics
  const chartData = useMemo<MetricGroup[]>(() => {
    const cutoffDate = dateRange > 0
      ? new Date(Date.now() - dateRange * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null;

    return selected.map(name => {
      const data = groupedMetrics.get(name);
      if (!data) return null;
      let points = [...data.points].sort((a, b) => a.date.localeCompare(b.date));
      if (cutoffDate) {
        points = points.filter(p => p.date >= cutoffDate);
      }
      const sorted = [...data.points].sort((a, b) => b.date.localeCompare(a.date));
      return {
        name,
        points,
        unit: data.unit,
        latestValue: sorted[0]?.value ?? 0,
        latestStatus: data.status,
        refLow: data.refLow,
        refHigh: data.refHigh,
      };
    }).filter((d): d is MetricGroup => d !== null && d.points.length > 0);
  }, [selected, groupedMetrics, dateRange]);

  // Collect all dates across all selected metrics for shared X-axis
  const allDates = useMemo(() => {
    const dateSet = new Set<string>();
    for (const group of chartData) {
      for (const p of group.points) dateSet.add(p.date);
    }
    return Array.from(dateSet).sort();
  }, [chartData]);

  // Handle preset view clicks
  const handlePreset = (key: string) => {
    if (key === 'All Flagged') {
      // Select all metrics with non-normal latest status
      const flagged = availableMetrics
        .filter(m => m.latestStatus && m.latestStatus !== 'normal')
        .map(m => m.name)
        .slice(0, 5);
      setSelected(flagged);
    } else {
      const keywords = PRESET_VIEWS[key] ?? [];
      const matched = availableMetrics
        .filter(m => keywords.some(kw => m.name.toLowerCase().includes(kw)))
        .map(m => m.name)
        .slice(0, 5);
      setSelected(matched);
    }
  };

  const toggleMetric = (name: string) => {
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name);
      if (prev.length >= 5) return prev;
      return [...prev, name];
    });
  };

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.max(250, Math.min(400, Math.floor(w * 0.45)));
        setSize({ w, h });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Normalize function: value -> 0-1 range for a metric group
  const normalize = useCallback((value: number, group: MetricGroup) => {
    const allVals = group.points.map(p => p.value);
    if (group.refLow != null) allVals.push(group.refLow);
    if (group.refHigh != null) allVals.push(group.refHigh);
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const range = max - min || 1;
    return (value - min) / range;
  }, []);

  const toCanvasX = useCallback((i: number) => {
    const plotW = size.w - PADDING.left - PADDING.right;
    return PADDING.left + (allDates.length === 1 ? plotW / 2 : (i / (allDates.length - 1)) * plotW);
  }, [size.w, allDates.length]);

  const toCanvasY = useCallback((normalized: number) => {
    const plotH = size.h - PADDING.top - PADDING.bottom;
    return PADDING.top + plotH - normalized * plotH * 0.9 - plotH * 0.05;
  }, [size.h]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || chartData.length === 0 || allDates.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cs = getComputedStyle(canvas);
    const colorTxMuted = cs.getPropertyValue('--color-tx-muted').trim() || '#94a3b8';
    const colorTxFaint = cs.getPropertyValue('--color-tx-faint').trim() || '#4b5563';
    const colorDivider = cs.getPropertyValue('--color-divider').trim() || 'rgba(255,255,255,0.06)';
    const colorSuccess = cs.getPropertyValue('--color-success').trim() || '#4ade80';

    ctx.clearRect(0, 0, size.w, size.h);

    const plotW = size.w - PADDING.left - PADDING.right;
    const plotH = size.h - PADDING.top - PADDING.bottom;

    // Grid lines
    ctx.strokeStyle = colorDivider;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PADDING.top + (i / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + plotW, y);
      ctx.stroke();
    }

    // X-axis date labels
    ctx.textAlign = 'center';
    ctx.fillStyle = colorTxMuted;
    ctx.font = '400 10px Inter, system-ui, sans-serif';
    const maxLabels = Math.floor(plotW / 70);
    const step = Math.max(1, Math.ceil(allDates.length / maxLabels));
    for (let i = 0; i < allDates.length; i += step) {
      const x = toCanvasX(i);
      const d = new Date(allDates[i]);
      ctx.fillText(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, size.h - PADDING.bottom + 18);
    }
    if ((allDates.length - 1) % step !== 0 && allDates.length > 1) {
      const x = toCanvasX(allDates.length - 1);
      const d = new Date(allDates[allDates.length - 1]);
      ctx.fillText(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, size.h - PADDING.bottom + 18);
    }

    // Reference range for first metric (dashed lines)
    if (chartData[0]?.refLow != null && chartData[0]?.refHigh != null) {
      const normLow = normalize(chartData[0].refLow, chartData[0]);
      const normHigh = normalize(chartData[0].refHigh, chartData[0]);
      const yLow = toCanvasY(normLow);
      const yHigh = toCanvasY(normHigh);

      ctx.fillStyle = colorSuccess.startsWith('#') ? colorSuccess + '12' : colorSuccess.replace(/[\d.]+\)$/, '0.07)');
      ctx.fillRect(PADDING.left, yHigh, plotW, yLow - yHigh);

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colorSuccess.startsWith('#') ? colorSuccess + '55' : colorSuccess.replace(/[\d.]+\)$/, '0.33)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, yHigh);
      ctx.lineTo(PADDING.left + plotW, yHigh);
      ctx.moveTo(PADDING.left, yLow);
      ctx.lineTo(PADDING.left + plotW, yLow);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw lines + dots for each metric
    for (let gi = 0; gi < chartData.length; gi++) {
      const group = chartData[gi];
      const color = PALETTE[gi % PALETTE.length];

      // Build date->value map
      const valueMap = new Map<string, number>();
      for (const p of group.points) valueMap.set(p.date, p.value);

      // Collect points that exist on allDates
      const plotPoints: Array<{ x: number; y: number; dateIdx: number }> = [];
      for (let di = 0; di < allDates.length; di++) {
        const val = valueMap.get(allDates[di]);
        if (val !== undefined) {
          const norm = normalize(val, group);
          plotPoints.push({ x: toCanvasX(di), y: toCanvasY(norm), dateIdx: di });
        }
      }

      // Line
      if (plotPoints.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (let i = 0; i < plotPoints.length; i++) {
          if (i === 0) ctx.moveTo(plotPoints[i].x, plotPoints[i].y);
          else ctx.lineTo(plotPoints[i].x, plotPoints[i].y);
        }
        ctx.stroke();
      }

      // Dots
      for (const pt of plotPoints) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    }

    // Y-axis label
    ctx.save();
    ctx.translate(12, PADDING.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = colorTxFaint;
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.fillText(chartData.length === 1 ? chartData[0].unit : 'Normalized', 0, 0);
    ctx.restore();
  }, [chartData, allDates, size, toCanvasX, toCanvasY, normalize]);

  // Mouse tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || allDates.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    // Find nearest date index
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < allDates.length; i++) {
      const x = toCanvasX(i);
      const dist = Math.abs(mx - x);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    if (nearestDist > 30) {
      setTooltip(null);
      return;
    }

    const date = allDates[nearestIdx];
    const values: Array<{ name: string; value: number; color: string; unit: string }> = [];
    for (let gi = 0; gi < chartData.length; gi++) {
      const group = chartData[gi];
      const pt = group.points.find(p => p.date === date);
      if (pt) {
        values.push({ name: group.name, value: pt.value, color: PALETTE[gi % PALETTE.length], unit: group.unit });
      }
    }

    if (values.length > 0) {
      setTooltip({ x: toCanvasX(nearestIdx), y: e.clientY - rect.top, date, values });
    } else {
      setTooltip(null);
    }
  }, [allDates, chartData, toCanvasX]);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Biomarker Trends</h1>
          <p className="view-subtitle">Compare multiple metrics over time</p>
        </div>
      </div>

      {/* Preset views */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {Object.keys(PRESET_VIEWS).map(key => (
          <button
            key={key}
            className="btn btn-secondary btn-sm"
            onClick={() => handlePreset(key)}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Metric picker */}
      <div className="section" style={{ marginBottom: '1rem' }}>
        <input
          className="input-field"
          placeholder="Search metrics..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: '0.75rem', maxWidth: 360 }}
        />
        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {filteredMetrics.map(m => {
            const isSelected = selected.includes(m.name);
            const disabled = !isSelected && selected.length >= 5;
            return (
              <label
                key={m.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0.5rem',
                  borderRadius: 'var(--radius-md)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                  background: isSelected ? 'var(--color-surface)' : 'transparent',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => toggleMetric(m.name)}
                  style={{ accentColor: isSelected ? PALETTE[selected.indexOf(m.name) % PALETTE.length] : undefined }}
                />
                <span style={{ flex: 1 }}>{m.name}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)' }}>
                  {m.latestValue} {m.unit}
                </span>
                {m.latestStatus && m.latestStatus !== 'normal' && (
                  <span className={`badge badge-${m.latestStatus === 'critical' || m.latestStatus === 'high' ? 'error' : m.latestStatus === 'low' ? 'warning' : 'muted'}`}>
                    {m.latestStatus}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {selected.length >= 5 && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', marginTop: '0.5rem' }}>
            Maximum 5 metrics selected
          </p>
        )}
      </div>

      {/* Date range */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {DATE_RANGES.map(r => (
          <button
            key={r.label}
            className={`btn btn-sm ${dateRange === r.months ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDateRange(r.months)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {selected.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--color-tx-muted)',
          fontSize: 'var(--text-sm)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-divider)',
        }}>
          Select metrics above to compare trends
        </div>
      ) : (
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          padding: '1rem',
          overflow: 'hidden',
        }}>
          <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: size.h, display: 'block', cursor: 'crosshair' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setTooltip(null)}
            />
            {tooltip && (
              <div style={{
                position: 'absolute',
                left: tooltip.x,
                top: Math.max(10, tooltip.y - 20 - tooltip.values.length * 20),
                transform: 'translateX(-50%)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-tx)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                boxShadow: 'var(--shadow-md)',
                zIndex: 10,
              }}>
                <div style={{ color: 'var(--color-tx-muted)', marginBottom: 4 }}>
                  {new Date(tooltip.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                {tooltip.values.map((v, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{v.value}</span>
                    <span style={{ color: 'var(--color-tx-muted)' }}>{v.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-divider)' }}>
            {chartData.map((group, i) => (
              <div key={group.name} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 'var(--text-xs)' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />
                <span>{group.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
